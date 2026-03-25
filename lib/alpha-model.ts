/**
 * @module lib/alpha-model
 * @description Stepwise+Ridge regression model predicting 30-day market-relative alpha using 8 features from SEC filings, trained on 340 samples with fixed coefficients for deterministic scoring
 *
 * PURPOSE:
 * - Calculate standardized alpha scores by applying Ridge regression weights to 8 features (price momentum, analyst activity, AI sentiment)
 * - Classify predictions as LONG/SHORT/NEUTRAL with high/medium/low confidence based on training distribution percentiles
 * - Extract model features from company, filing, and analyst activity data ensuring ratio-based price calculations
 * - Provide per-feature contribution breakdown showing which signals drive the alpha prediction
 *
 * EXPORTS:
 * - AlphaFeatures (interface) - Shape with 8 numeric features: priceToLow, majorDowngrades, analystUpsidePotential, priceToHigh, concernLevel, marketCap, sentimentScore, upgradesLast30d
 * - AlphaPrediction (interface) - Shape with rawScore, expectedAlpha, signal (LONG/SHORT/NEUTRAL), confidence level, percentile, featureContributions map, and predicted30dReturn
 * - predictAlpha (function) - Accepts AlphaFeatures, returns AlphaPrediction with standardized score and classification
 * - extractAlphaFeatures (function) - Converts company/filing/analystActivity records into AlphaFeatures using ratio calculations and fallback to training means
 *
 * PATTERNS:
 * - Call extractAlphaFeatures({ company, filing, analystActivity }) to build features from database records
 * - Pass features to predictAlpha(features) which returns signal, confidence, and expectedAlpha percentage
 * - Check prediction.signal === 'LONG' && prediction.confidence === 'high' for top 10% percentile entries (>90th)
 * - Use prediction.featureContributions to debug which features pushed score bullish/bearish
 *
 * CLAUDE NOTES:
 * - CRITICAL: priceToHigh and priceToLow MUST be ratios (e.g., 0.88, 1.27), NOT percentages (-12.0, +27.0) — training stats confirm ratio scale with mean=0.8588 and 1.3978
 * - Model replaces three previous systems: RandomForest (CV R²=-0.067), Logistic Regression baseline, and rule-based engine — this fixed-formula approach prevents overfitting on small dataset
 * - Uses frozen training statistics (FEATURE_STATS) for z-score normalization — never recalculate these means/stds or model breaks
 * - Backtested 56.3% directional accuracy overall, 62.5% for high-confidence signals with +7.64pp long-short spread on high-conf subset
 * - extractAlphaFeatures falls back to training means when data missing (e.g., no analyst target price) to prevent NaN propagation
 */
/**
 * Alpha Prediction Model — Stepwise+Ridge (8 features)
 *
 * Predicts 30-day market-relative alpha (stock return minus S&P 500 return).
 * Trained on 340 SEC filings with 5-fold TimeSeriesSplit cross-validation.
 * CV R² = 0.043 ± 0.056
 *
 * Replaces:
 *   - lib/ml-prediction.ts (RandomForest via predict_single_filing.py)
 *   - lib/baseline-features.ts (Logistic Regression via predict_baseline.py)
 *   - The rule-based engine in lib/predictions.ts
 *
 * Why this model wins over the existing RandomForest:
 *   - RF had CV R² = -0.067 (worse than predicting the mean)
 *   - RF overfits with max_depth=10 on n=352 samples
 *   - RF retrained from CSV on every call (no stability)
 *   - This model is a fixed formula — deterministic, fast, no Python needed
 *
 * Backtested directional accuracy:
 *   All signals: 56.3% (80/142)
 *   High confidence: 62.5% (30/48)
 *   LONG-SHORT spread: +3.73pp (high-conf: +7.64pp)
 */

// Training set statistics (v1: 340 mega-cap samples; v2: recalculated from expanded dataset)
// DO NOT MODIFY v1 values — they lock the v1 model. Run retrain-alpha-v2.ts to update.
// v2 stats will be updated by retrain-alpha-v2.ts when new model is ready.
const FEATURE_STATS = {
  priceToLow              : { mean:         1.3539, std:         0.3418 },
  majorDowngrades         : { mean:         0.0000, std:          1.0000 },
  analystUpsidePotential  : { mean:        30.4095, std:        56.5304 },
  priceToHigh             : { mean:         0.8384, std:         0.1390 },
  concernLevel            : { mean:         5.2800, std:         0.7506 },
  marketCap               : { mean:     9.5619e+10, std:     3.3167e+11 },
  sentimentScore          : { mean:         0.1086, std:         0.1925 },
  upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
  filingTypeFactor        : { mean:         0.7581, std:         0.4283 },
  toneChangeDelta         : { mean:        -0.0135, std:         0.2255 },
} as const;

// v2 model trained on 3779 samples with historically accurate price features

// v2 model trained on 3779 samples with historically accurate price features

// Stepwise+Ridge model weights (standardized feature space, Ridge λ=100)
// v1 weights from 340 mega-cap samples. v2 weights updated by retrain-alpha-v2.ts.
const WEIGHTS = {
  priceToLow              : -0.0016,
  majorDowngrades         : +0.0000,
  analystUpsidePotential  : +0.0238,
  priceToHigh             : -0.0015,
  concernLevel            : +0.0055,
  marketCap               : +0.0002,
  sentimentScore          : +0.0001,
  upgradesLast30d         : +0.0000,
  filingTypeFactor        : -0.0075,
  toneChangeDelta         : -0.0007,
} as const;

// Score distribution percentiles from training data
// Used to classify signals as LONG/SHORT/NEUTRAL and assign confidence
const SCORE_PERCENTILES = {
  p10: -0.0229,
  p25: -0.0142,
  p50: -0.0041,
  p75: +0.0088,
  p90: +0.0237,
  mean: -0.0000,
  std: +0.0256,
} as const;

export interface AlphaFeatures {
  priceToLow: number;             // currentPrice / fiftyTwoWeekLow
  majorDowngrades: number;        // count of downgrades from top-tier banks in last 30 days
  analystUpsidePotential: number; // ((analystTargetPrice / currentPrice) - 1) * 100
  priceToHigh: number;            // currentPrice / fiftyTwoWeekHigh
  concernLevel: number;           // Claude AI concern level (0-10)
  marketCap: number;              // market capitalization in dollars
  sentimentScore: number;         // Claude AI sentiment (-1 to +1)
  upgradesLast30d: number;        // count of analyst upgrades in last 30 days
  // v2 features
  filingTypeFactor: number;       // 0=10-K, 1=10-Q, 2=8-K (material event encoding)
  toneChangeDelta: number;        // sentimentScore - priorFilingSentimentScore (0 if no prior)
}

export interface AlphaPrediction {
  rawScore: number;               // continuous score (higher = more bullish)
  expectedAlpha: number;          // expected 30-day alpha in percentage points
  signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: 'high' | 'medium' | 'low';
  percentile: string;             // where this score falls in training distribution
  featureContributions: Record<string, number>;  // per-feature contribution to score
  predicted30dReturn: number;     // alpha + market baseline (~0.8%/mo)
  expertUsed: string;             // 'global' or canonical sector name (MoE routing result)
}

// ── Mixture of Experts: sector-specific models ─────────────────────────────

/** Per-sector Ridge regression model — same feature set, sector-tuned weights. */
export interface SectorModel {
  featureStats: Record<keyof AlphaFeatures, { mean: number; std: number }>;
  weights: Record<keyof AlphaFeatures, number>;
  scorePercentiles: {
    p10: number; p25: number; p50: number; p75: number; p90: number;
    mean: number; std: number;
  };
  sampleCount: number;
}

/**
 * Canonicalizes Yahoo Finance and GICS sector name variants to a consistent label.
 * Used both here for routing and in retrain-alpha-v2.ts for grouping training data.
 */
export const SECTOR_NORMALIZATION: Record<string, string> = {
  'Information Technology': 'Technology',
  'Technology':             'Technology',
  'Health Care':            'Healthcare',
  'Healthcare':             'Healthcare',
  'Financials':             'Financials',
  'Financial Services':     'Financials',
  'Consumer Discretionary': 'Consumer Discretionary',
  'Consumer Cyclical':      'Consumer Discretionary',
  'Consumer Staples':       'Consumer Staples',
  'Consumer Defensive':     'Consumer Staples',
  'Industrials':            'Industrials',
  'Energy':                 'Energy',
  'Materials':              'Materials',
  'Basic Materials':        'Materials',
  'Real Estate':            'Real Estate',
  'Utilities':              'Utilities',
  'Communication Services': 'Communication Services',
};

/**
 * Sector-specific Ridge regression models (MoE experts).
 * Populated by: npx tsx scripts/retrain-alpha-v2.ts
 * Empty until first retrain — falls back to global WEIGHTS.
 */
const SECTOR_MODELS: Record<string, SectorModel> = {
  // Auto-generated by retrain-alpha-v2.ts (11 sector experts)
  'Industrials': {
    featureStats: {
      priceToLow              : { mean:         1.3728, std:         0.2798 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        38.0367, std:        44.3566 },
      priceToHigh             : { mean:         0.8795, std:         0.1052 },
      concernLevel            : { mean:         5.1827, std:         0.6146 },
      marketCap               : { mean:     5.6975e+10, std:     6.0535e+10 },
      sentimentScore          : { mean:         0.0905, std:         0.1808 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7655, std:         0.4241 },
      toneChangeDelta         : { mean:        -0.0042, std:         0.2172 },
    },
    weights: {
      priceToLow              : -0.0023,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0215,
      priceToHigh             : -0.0021,
      concernLevel            : +0.0014,
      marketCap               : -0.0027,
      sentimentScore          : +0.0032,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0049,
      toneChangeDelta         : +0.0020,
    },
    scorePercentiles: {
      p10: -0.0218,
      p25: -0.0147,
      p50: -0.0049,
      p75: +0.0095,
      p90: +0.0278,
      mean: +0.0000,
      std: +0.0227,
    },
    sampleCount: 533,
  },
  'Technology': {
    featureStats: {
      priceToLow              : { mean:         1.4774, std:         0.4241 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        64.2525, std:       119.8171 },
      priceToHigh             : { mean:         0.8589, std:         0.1161 },
      concernLevel            : { mean:         5.2230, std:         0.6209 },
      marketCap               : { mean:     3.6902e+11, std:     8.9250e+11 },
      sentimentScore          : { mean:         0.1108, std:         0.1954 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7730, std:         0.4195 },
      toneChangeDelta         : { mean:        -0.0184, std:         0.2291 },
    },
    weights: {
      priceToLow              : +0.0064,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0144,
      priceToHigh             : +0.0033,
      concernLevel            : +0.0035,
      marketCap               : +0.0015,
      sentimentScore          : +0.0008,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0011,
      toneChangeDelta         : -0.0041,
    },
    scorePercentiles: {
      p10: -0.0177,
      p25: -0.0118,
      p50: -0.0045,
      p75: +0.0067,
      p90: +0.0203,
      mean: +0.0000,
      std: +0.0183,
    },
    sampleCount: 348,
  },
  'Healthcare': {
    featureStats: {
      priceToLow              : { mean:         1.2907, std:         0.2080 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        23.0323, std:        33.4400 },
      priceToHigh             : { mean:         0.8329, std:         0.1337 },
      concernLevel            : { mean:         5.3412, std:         0.8474 },
      marketCap               : { mean:     1.0548e+11, std:     1.5138e+11 },
      sentimentScore          : { mean:         0.1375, std:         0.2076 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7464, std:         0.4357 },
      toneChangeDelta         : { mean:        -0.0207, std:         0.2529 },
    },
    weights: {
      priceToLow              : -0.0000,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0171,
      priceToHigh             : -0.0059,
      concernLevel            : +0.0031,
      marketCap               : +0.0011,
      sentimentScore          : +0.0030,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0104,
      toneChangeDelta         : -0.0033,
    },
    scorePercentiles: {
      p10: -0.0229,
      p25: -0.0148,
      p50: -0.0024,
      p75: +0.0130,
      p90: +0.0273,
      mean: -0.0000,
      std: +0.0208,
    },
    sampleCount: 347,
  },
  'Consumer Discretionary': {
    featureStats: {
      priceToLow              : { mean:         1.4076, std:         0.3167 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        39.5460, std:        49.9353 },
      priceToHigh             : { mean:         0.8631, std:         0.1072 },
      concernLevel            : { mean:         5.2325, std:         0.6940 },
      marketCap               : { mean:     1.4360e+11, std:     3.9847e+11 },
      sentimentScore          : { mean:         0.1259, std:         0.2023 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7552, std:         0.4307 },
      toneChangeDelta         : { mean:        -0.0110, std:         0.2455 },
    },
    weights: {
      priceToLow              : -0.0016,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0237,
      priceToHigh             : -0.0043,
      concernLevel            : -0.0035,
      marketCap               : +0.0040,
      sentimentScore          : -0.0011,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0011,
      toneChangeDelta         : -0.0051,
    },
    scorePercentiles: {
      p10: -0.0244,
      p25: -0.0160,
      p50: -0.0048,
      p75: +0.0091,
      p90: +0.0274,
      mean: +0.0000,
      std: +0.0253,
    },
    sampleCount: 286,
  },
  'Financials': {
    featureStats: {
      priceToLow              : { mean:         1.2975, std:         0.1658 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        19.5973, std:        24.9634 },
      priceToHigh             : { mean:         0.9036, std:         0.0863 },
      concernLevel            : { mean:         5.1215, std:         0.6335 },
      marketCap               : { mean:     1.0426e+11, std:     1.6132e+11 },
      sentimentScore          : { mean:         0.1170, std:         0.1979 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7489, std:         0.4346 },
      toneChangeDelta         : { mean:        -0.0283, std:         0.2400 },
    },
    weights: {
      priceToLow              : -0.0029,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0063,
      priceToHigh             : +0.0004,
      concernLevel            : -0.0035,
      marketCap               : -0.0053,
      sentimentScore          : -0.0029,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0041,
      toneChangeDelta         : -0.0009,
    },
    scorePercentiles: {
      p10: -0.0130,
      p25: -0.0074,
      p50: +0.0003,
      p75: +0.0078,
      p90: +0.0132,
      mean: -0.0000,
      std: +0.0108,
    },
    sampleCount: 223,
  },
  'Consumer Staples': {
    featureStats: {
      priceToLow              : { mean:         1.1939, std:         0.1603 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:         9.0387, std:        29.9256 },
      priceToHigh             : { mean:         0.8629, std:         0.1040 },
      concernLevel            : { mean:         5.4550, std:         0.7368 },
      marketCap               : { mean:     1.2524e+11, std:     2.0139e+11 },
      sentimentScore          : { mean:         0.1149, std:         0.1963 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7487, std:         0.4349 },
      toneChangeDelta         : { mean:         0.0018, std:         0.2229 },
    },
    weights: {
      priceToLow              : -0.0007,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0120,
      priceToHigh             : -0.0008,
      concernLevel            : -0.0002,
      marketCap               : +0.0012,
      sentimentScore          : +0.0034,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0123,
      toneChangeDelta         : +0.0027,
    },
    scorePercentiles: {
      p10: -0.0211,
      p25: -0.0131,
      p50: -0.0030,
      p75: +0.0119,
      p90: +0.0248,
      mean: +0.0000,
      std: +0.0191,
    },
    sampleCount: 191,
  },
  'Utilities': {
    featureStats: {
      priceToLow              : { mean:         1.3950, std:         0.4470 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        36.0321, std:        45.9990 },
      priceToHigh             : { mean:         0.9111, std:         0.1004 },
      concernLevel            : { mean:         5.3231, std:         0.7871 },
      marketCap               : { mean:     3.5441e+10, std:     2.1927e+10 },
      sentimentScore          : { mean:         0.0841, std:         0.1752 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7514, std:         0.4334 },
      toneChangeDelta         : { mean:        -0.0329, std:         0.2064 },
    },
    weights: {
      priceToLow              : -0.0038,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0168,
      priceToHigh             : +0.0006,
      concernLevel            : -0.0031,
      marketCap               : +0.0016,
      sentimentScore          : -0.0022,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0187,
      toneChangeDelta         : +0.0017,
    },
    scorePercentiles: {
      p10: -0.0243,
      p25: -0.0179,
      p50: -0.0106,
      p75: +0.0201,
      p90: +0.0366,
      mean: +0.0000,
      std: +0.0276,
    },
    sampleCount: 173,
  },
  'Real Estate': {
    featureStats: {
      priceToLow              : { mean:         1.2527, std:         0.1757 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        18.3341, std:        28.0525 },
      priceToHigh             : { mean:         0.8764, std:         0.0792 },
      concernLevel            : { mean:         5.2877, std:         0.7566 },
      marketCap               : { mean:     3.7821e+10, std:     3.4096e+10 },
      sentimentScore          : { mean:         0.1481, std:         0.2121 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7419, std:         0.4390 },
      toneChangeDelta         : { mean:        -0.0116, std:         0.2561 },
    },
    weights: {
      priceToLow              : -0.0022,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0071,
      priceToHigh             : +0.0014,
      concernLevel            : +0.0005,
      marketCap               : +0.0006,
      sentimentScore          : +0.0008,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0092,
      toneChangeDelta         : +0.0001,
    },
    scorePercentiles: {
      p10: -0.0108,
      p25: -0.0089,
      p50: -0.0045,
      p75: +0.0101,
      p90: +0.0171,
      mean: +0.0000,
      std: +0.0122,
    },
    sampleCount: 155,
  },
  'Materials': {
    featureStats: {
      priceToLow              : { mean:         1.2650, std:         0.1701 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        22.4201, std:        24.9717 },
      priceToHigh             : { mean:         0.8543, std:         0.1195 },
      concernLevel            : { mean:         5.4288, std:         0.8006 },
      marketCap               : { mean:     4.4600e+10, std:     4.8376e+10 },
      sentimentScore          : { mean:         0.1171, std:         0.1981 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7534, std:         0.4325 },
      toneChangeDelta         : { mean:        -0.0154, std:         0.2141 },
    },
    weights: {
      priceToLow              : -0.0043,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0124,
      priceToHigh             : +0.0038,
      concernLevel            : +0.0008,
      marketCap               : +0.0019,
      sentimentScore          : -0.0023,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0089,
      toneChangeDelta         : -0.0037,
    },
    scorePercentiles: {
      p10: -0.0182,
      p25: -0.0093,
      p50: -0.0024,
      p75: +0.0083,
      p90: +0.0247,
      mean: -0.0000,
      std: +0.0165,
    },
    sampleCount: 146,
  },
  'Energy': {
    featureStats: {
      priceToLow              : { mean:         1.2665, std:         0.2280 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        39.7636, std:        29.1519 },
      priceToHigh             : { mean:         0.8166, std:         0.1114 },
      concernLevel            : { mean:         5.4496, std:         0.7505 },
      marketCap               : { mean:     8.2712e+10, std:     1.1747e+11 },
      sentimentScore          : { mean:         0.1256, std:         0.2026 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7364, std:         0.4423 },
      toneChangeDelta         : { mean:        -0.0174, std:         0.2208 },
    },
    weights: {
      priceToLow              : +0.0016,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0200,
      priceToHigh             : -0.0018,
      concernLevel            : +0.0099,
      marketCap               : +0.0012,
      sentimentScore          : -0.0031,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0178,
      toneChangeDelta         : -0.0055,
    },
    scorePercentiles: {
      p10: -0.0319,
      p25: -0.0215,
      p50: -0.0024,
      p75: +0.0177,
      p90: +0.0349,
      mean: -0.0000,
      std: +0.0286,
    },
    sampleCount: 129,
  },
  'Communication Services': {
    featureStats: {
      priceToLow              : { mean:         1.3989, std:         0.3381 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        40.8998, std:        61.9877 },
      priceToHigh             : { mean:         0.8622, std:         0.1188 },
      concernLevel            : { mean:         5.2098, std:         0.6053 },
      marketCap               : { mean:     2.1054e+11, std:     4.1267e+11 },
      sentimentScore          : { mean:         0.1125, std:         0.1959 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7500, std:         0.4354 },
      toneChangeDelta         : { mean:        -0.0147, std:         0.2536 },
    },
    weights: {
      priceToLow              : +0.0054,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0083,
      priceToHigh             : +0.0003,
      concernLevel            : +0.0022,
      marketCap               : +0.0013,
      sentimentScore          : +0.0033,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0022,
      toneChangeDelta         : -0.0038,
    },
    scorePercentiles: {
      p10: -0.0125,
      p25: -0.0064,
      p50: -0.0023,
      p75: +0.0036,
      p90: +0.0151,
      mean: +0.0000,
      std: +0.0113,
    },
    sampleCount: 92,
  },
};

/**
 * Score a filing using the Stepwise+Ridge alpha model.
 *
 * When a sector is provided, routes to the sector-specific expert model if one exists
 * (trained on sector-homogeneous data). Falls back to the global model when no
 * sector-specific model is available or when sector is not supplied.
 *
 * @param features  - Feature vector from extractAlphaFeatures()
 * @param sector    - Company sector string (Yahoo Finance or GICS format, auto-normalized)
 */
export function predictAlpha(features: AlphaFeatures, sector?: string | null): AlphaPrediction {
  // MoE routing: normalize sector name and look up sector expert
  const canonicalSector = sector ? (SECTOR_NORMALIZATION[sector] ?? sector) : null;
  const sectorModel = canonicalSector ? SECTOR_MODELS[canonicalSector] : null;

  const effectiveWeights = sectorModel?.weights ?? WEIGHTS;
  const effectiveStats   = sectorModel?.featureStats ?? FEATURE_STATS;
  const effectivePercs   = sectorModel?.scorePercentiles ?? SCORE_PERCENTILES;
  const expertUsed       = sectorModel ? canonicalSector! : 'global';

  // Standardize features using sector (or global) stats, then score
  const contributions: Record<string, number> = {};
  let score = 0;

  for (const [name, weight] of Object.entries(effectiveWeights)) {
    const stat = effectiveStats[name as keyof AlphaFeatures];
    const raw  = features[name as keyof AlphaFeatures] as number;
    const zVal = (raw - stat.mean) / stat.std;
    const contribution = weight * zVal;
    contributions[name] = Math.round(contribution * 10000) / 10000;
    score += contribution;
  }

  // Classify signal using sector-specific (or global) percentile thresholds
  let signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  let confidence: 'high' | 'medium' | 'low';
  let percentile: string;

  if (score > effectivePercs.p90) {
    signal = 'LONG';  confidence = 'high';   percentile = '>90th';
  } else if (score > effectivePercs.p75) {
    signal = 'LONG';  confidence = 'medium'; percentile = '75th-90th';
  } else if (score < effectivePercs.p10) {
    signal = 'SHORT'; confidence = 'high';   percentile = '<10th';
  } else if (score < effectivePercs.p25) {
    signal = 'SHORT'; confidence = 'medium'; percentile = '10th-25th';
  } else {
    signal = 'NEUTRAL'; confidence = 'low';  percentile = '25th-75th';
  }

  const expectedAlpha    = score;
  const marketBaseline30d = 0.8;  // long-run monthly S&P 500 return
  const predicted30dReturn = expectedAlpha + marketBaseline30d;

  return {
    rawScore: Math.round(score * 10000) / 10000,
    expectedAlpha: Math.round(expectedAlpha * 100) / 100,
    signal,
    confidence,
    percentile,
    featureContributions: contributions,
    predicted30dReturn: Math.round(predicted30dReturn * 100) / 100,
    expertUsed,
  };
}

/**
 * Extract AlphaFeatures from database records.
 *
 * This replaces the feature extraction in lib/ml-prediction.ts (extractMLFeatures)
 * which built ~33 features including hardcoded riskScore=5 and sentimentScore=0.
 * We only need 8 features, and we use the ACTUAL sentimentScore from Claude.
 */
/**
 * CRITICAL: priceToHigh and priceToLow must be RATIOS, not percentages.
 *
 * The existing ml-prediction.ts computes these as PERCENTAGES:
 *   priceToHigh = (currentPrice / fiftyTwoWeekHigh - 1) * 100  // e.g., -12.0
 *   priceToLow  = (currentPrice / fiftyTwoWeekLow - 1) * 100   // e.g., +27.0
 *
 * But the model was trained on RATIOS from the CSV export:
 *   priceToHigh = currentPrice / fiftyTwoWeekHigh               // e.g., 0.88
 *   priceToLow  = currentPrice / fiftyTwoWeekLow                // e.g., 1.27
 *
 * Using the wrong scale will completely break the model. The FEATURE_STATS
 * confirm the ratio scale: priceToHigh mean=0.8588, priceToLow mean=1.3978.
 */
export function extractAlphaFeatures(
  company: {
    currentPrice: number;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekLow: number;
    marketCap: number;
    analystTargetPrice?: number | null;
  },
  filing: {
    concernLevel?: number | null;
    sentimentScore?: number | null;
    filingType?: string | null;
    priorSentimentScore?: number | null;  // sentimentScore of most recent prior same-type filing
  },
  analystActivity: {
    upgradesLast30d: number;
    majorDowngradesLast30d: number;
  },
): AlphaFeatures {
  // RATIO (not percentage!) — see warning above
  const priceToLow = company.fiftyTwoWeekLow > 0
    ? company.currentPrice / company.fiftyTwoWeekLow
    : FEATURE_STATS.priceToLow.mean;

  // RATIO (not percentage!) — see warning above
  const priceToHigh = company.fiftyTwoWeekHigh > 0
    ? company.currentPrice / company.fiftyTwoWeekHigh
    : FEATURE_STATS.priceToHigh.mean;

  const analystUpsidePotential = company.analystTargetPrice && company.currentPrice > 0
    ? ((company.analystTargetPrice / company.currentPrice) - 1) * 100
    : FEATURE_STATS.analystUpsidePotential.mean;

  // v2: filing type factor (8-K=2 material event, 10-Q=1 quarterly, 10-K=0 annual)
  const filingTypeMap: Record<string, number> = { '8-K': 2, '10-Q': 1, '10-K': 0 };
  const filingTypeFactor = filing.filingType
    ? (filingTypeMap[filing.filingType] ?? FEATURE_STATS.filingTypeFactor.mean)
    : FEATURE_STATS.filingTypeFactor.mean;

  // v2: tone change vs prior filing (0 if no prior available — neutral effect)
  const currentSentiment = filing.sentimentScore ?? FEATURE_STATS.sentimentScore.mean;
  const toneChangeDelta = filing.priorSentimentScore != null
    ? currentSentiment - filing.priorSentimentScore
    : FEATURE_STATS.toneChangeDelta.mean;

  return {
    priceToLow,
    priceToHigh,
    majorDowngrades: analystActivity.majorDowngradesLast30d,
    analystUpsidePotential,
    concernLevel: filing.concernLevel ?? FEATURE_STATS.concernLevel.mean,
    marketCap: company.marketCap,
    sentimentScore: currentSentiment,
    upgradesLast30d: analystActivity.upgradesLast30d,
    filingTypeFactor,
    toneChangeDelta,
  };
}
