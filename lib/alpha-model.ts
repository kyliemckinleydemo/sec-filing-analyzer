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
  priceToLow              : { mean:         1.3638, std:         0.3776 },
  majorDowngrades         : { mean:         0.0000, std:          1.0000 },
  analystUpsidePotential  : { mean:        29.5690, std:        55.1452 },
  priceToHigh             : { mean:         0.8381, std:         0.1401 },
  concernLevel            : { mean:         5.3333, std:         0.8027 },
  marketCap               : { mean:     9.8179e+10, std:     3.4064e+11 },
  sentimentScore          : { mean:         0.1095, std:         0.1893 },
  upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
  filingTypeFactor        : { mean:         0.7378, std:         0.4399 },
  toneChangeDelta         : { mean:        -0.0113, std:         0.2243 },
} as const;

// v2 model trained on 4009 samples with historically accurate price features

// v2 model trained on 3779 samples with historically accurate price features

// v2 model trained on 3779 samples with historically accurate price features

// Stepwise+Ridge model weights (standardized feature space, Ridge λ=100)
// v1 weights from 340 mega-cap samples. v2 weights updated by retrain-alpha-v2.ts.
const WEIGHTS = {
  priceToLow              : -0.0022,
  majorDowngrades         : +0.0000,
  analystUpsidePotential  : +0.0237,
  priceToHigh             : -0.0009,
  concernLevel            : +0.0046,
  marketCap               : -0.0002,
  sentimentScore          : +0.0004,
  upgradesLast30d         : +0.0000,
  filingTypeFactor        : -0.0064,
  toneChangeDelta         : -0.0010,
} as const;

// Score distribution percentiles from training data
// Used to classify signals as LONG/SHORT/NEUTRAL and assign confidence
const SCORE_PERCENTILES = {
  p10: -0.0219,
  p25: -0.0133,
  p50: -0.0036,
  p75: +0.0083,
  p90: +0.0224,
  mean: -0.0000,
  std: +0.0249,
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
      priceToLow              : { mean:         1.4001, std:         0.3203 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        34.7362, std:        44.2018 },
      priceToHigh             : { mean:         0.8639, std:         0.1307 },
      concernLevel            : { mean:         5.2729, std:         0.7149 },
      marketCap               : { mean:     4.9819e+10, std:     6.0223e+10 },
      sentimentScore          : { mean:         0.0917, std:         0.1768 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7292, std:         0.4447 },
      toneChangeDelta         : { mean:        -0.0015, std:         0.2118 },
    },
    weights: {
      priceToLow              : -0.0050,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0257,
      priceToHigh             : -0.0061,
      concernLevel            : +0.0021,
      marketCap               : +0.0010,
      sentimentScore          : +0.0029,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0040,
      toneChangeDelta         : +0.0015,
    },
    scorePercentiles: {
      p10: -0.0279,
      p25: -0.0176,
      p50: -0.0056,
      p75: +0.0111,
      p90: +0.0357,
      mean: +0.0000,
      std: +0.0279,
    },
    sampleCount: 672,
  },
  'Consumer Discretionary': {
    featureStats: {
      priceToLow              : { mean:         1.4357, std:         0.4065 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        29.3900, std:        56.4114 },
      priceToHigh             : { mean:         0.7799, std:         0.1722 },
      concernLevel            : { mean:         5.3184, std:         0.8170 },
      marketCap               : { mean:     7.8397e+10, std:     2.9488e+11 },
      sentimentScore          : { mean:         0.1099, std:         0.1898 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7526, std:         0.4318 },
      toneChangeDelta         : { mean:        -0.0103, std:         0.2303 },
    },
    weights: {
      priceToLow              : -0.0035,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0431,
      priceToHigh             : -0.0018,
      concernLevel            : +0.0051,
      marketCap               : +0.0023,
      sentimentScore          : -0.0052,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0081,
      toneChangeDelta         : +0.0018,
    },
    scorePercentiles: {
      p10: -0.0450,
      p25: -0.0260,
      p50: -0.0062,
      p75: +0.0175,
      p90: +0.0462,
      mean: +0.0000,
      std: +0.0441,
    },
    sampleCount: 663,
  },
  'Financials': {
    featureStats: {
      priceToLow              : { mean:         1.3127, std:         0.1875 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        21.8839, std:        24.4984 },
      priceToHigh             : { mean:         0.8668, std:         0.0956 },
      concernLevel            : { mean:         5.2141, std:         0.7850 },
      marketCap               : { mean:     4.7998e+10, std:     1.1778e+11 },
      sentimentScore          : { mean:         0.0945, std:         0.1801 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7422, std:         0.4378 },
      toneChangeDelta         : { mean:        -0.0135, std:         0.2150 },
    },
    weights: {
      priceToLow              : -0.0088,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0080,
      priceToHigh             : +0.0050,
      concernLevel            : +0.0052,
      marketCap               : -0.0031,
      sentimentScore          : -0.0020,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0007,
      toneChangeDelta         : +0.0002,
    },
    scorePercentiles: {
      p10: -0.0138,
      p25: -0.0069,
      p50: +0.0004,
      p75: +0.0070,
      p90: +0.0147,
      mean: -0.0000,
      std: +0.0118,
    },
    sampleCount: 547,
  },
  'Technology': {
    featureStats: {
      priceToLow              : { mean:         1.4974, std:         0.6149 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        57.5638, std:       113.3593 },
      priceToHigh             : { mean:         0.8414, std:         0.1331 },
      concernLevel            : { mean:         5.2780, std:         0.6912 },
      marketCap               : { mean:     3.5186e+11, std:     8.8244e+11 },
      sentimentScore          : { mean:         0.1125, std:         0.1911 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7550, std:         0.4306 },
      toneChangeDelta         : { mean:        -0.0099, std:         0.2271 },
    },
    weights: {
      priceToLow              : +0.0032,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0157,
      priceToHigh             : +0.0072,
      concernLevel            : +0.0028,
      marketCap               : +0.0011,
      sentimentScore          : -0.0007,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0008,
      toneChangeDelta         : -0.0021,
    },
    scorePercentiles: {
      p10: -0.0197,
      p25: -0.0109,
      p50: -0.0026,
      p75: +0.0070,
      p90: +0.0204,
      mean: +0.0000,
      std: +0.0188,
    },
    sampleCount: 404,
  },
  'Healthcare': {
    featureStats: {
      priceToLow              : { mean:         1.2954, std:         0.2113 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        20.6248, std:        33.6161 },
      priceToHigh             : { mean:         0.8264, std:         0.1388 },
      concernLevel            : { mean:         5.4208, std:         0.8960 },
      marketCap               : { mean:     1.0201e+11, std:     1.5214e+11 },
      sentimentScore          : { mean:         0.1419, std:         0.2053 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7169, std:         0.4511 },
      toneChangeDelta         : { mean:        -0.0158, std:         0.2491 },
    },
    weights: {
      priceToLow              : +0.0019,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0184,
      priceToHigh             : -0.0045,
      concernLevel            : +0.0028,
      marketCap               : +0.0017,
      sentimentScore          : +0.0020,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0090,
      toneChangeDelta         : -0.0039,
    },
    scorePercentiles: {
      p10: -0.0233,
      p25: -0.0140,
      p50: -0.0014,
      p75: +0.0127,
      p90: +0.0253,
      mean: -0.0000,
      std: +0.0207,
    },
    sampleCount: 385,
  },
  'Utilities': {
    featureStats: {
      priceToLow              : { mean:         1.3113, std:         0.3559 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        30.1235, std:        37.2210 },
      priceToHigh             : { mean:         0.9071, std:         0.0921 },
      concernLevel            : { mean:         5.2829, std:         0.8096 },
      marketCap               : { mean:     2.2302e+10, std:     2.2610e+10 },
      sentimentScore          : { mean:         0.0919, std:         0.1777 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7355, std:         0.4418 },
      toneChangeDelta         : { mean:        -0.0271, std:         0.2069 },
    },
    weights: {
      priceToLow              : -0.0059,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0160,
      priceToHigh             : +0.0027,
      concernLevel            : +0.0018,
      marketCap               : +0.0039,
      sentimentScore          : -0.0011,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0215,
      toneChangeDelta         : +0.0006,
    },
    scorePercentiles: {
      p10: -0.0247,
      p25: -0.0188,
      p50: -0.0121,
      p75: +0.0244,
      p90: +0.0373,
      mean: -0.0000,
      std: +0.0283,
    },
    sampleCount: 310,
  },
  'Consumer Staples': {
    featureStats: {
      priceToLow              : { mean:         1.2394, std:         0.2844 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        11.1763, std:        34.0631 },
      priceToHigh             : { mean:         0.8271, std:         0.1405 },
      concernLevel            : { mean:         5.4338, std:         0.8734 },
      marketCap               : { mean:     1.0409e+11, std:     1.9837e+11 },
      sentimentScore          : { mean:         0.1042, std:         0.1869 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7465, std:         0.4358 },
      toneChangeDelta         : { mean:        -0.0042, std:         0.2184 },
    },
    weights: {
      priceToLow              : -0.0066,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0197,
      priceToHigh             : +0.0041,
      concernLevel            : -0.0063,
      marketCap               : -0.0043,
      sentimentScore          : +0.0062,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0067,
      toneChangeDelta         : -0.0003,
    },
    scorePercentiles: {
      p10: -0.0237,
      p25: -0.0131,
      p50: -0.0005,
      p75: +0.0115,
      p90: +0.0234,
      mean: +0.0000,
      std: +0.0212,
    },
    sampleCount: 284,
  },
  'Energy': {
    featureStats: {
      priceToLow              : { mean:         1.3358, std:         0.2959 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        33.5850, std:        39.1128 },
      priceToHigh             : { mean:         0.7907, std:         0.1484 },
      concernLevel            : { mean:         5.5373, std:         0.8387 },
      marketCap               : { mean:     4.3907e+10, std:     9.1327e+10 },
      sentimentScore          : { mean:         0.1302, std:         0.2024 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7269, std:         0.4464 },
      toneChangeDelta         : { mean:        -0.0177, std:         0.2307 },
    },
    weights: {
      priceToLow              : +0.0019,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0195,
      priceToHigh             : +0.0040,
      concernLevel            : +0.0095,
      marketCap               : +0.0008,
      sentimentScore          : +0.0008,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0220,
      toneChangeDelta         : -0.0057,
    },
    scorePercentiles: {
      p10: -0.0330,
      p25: -0.0227,
      p50: -0.0068,
      p75: +0.0227,
      p90: +0.0395,
      mean: +0.0000,
      std: +0.0306,
    },
    sampleCount: 260,
  },
  'Materials': {
    featureStats: {
      priceToLow              : { mean:         1.2640, std:         0.1858 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        15.6782, std:        31.8785 },
      priceToHigh             : { mean:         0.8270, std:         0.1515 },
      concernLevel            : { mean:         5.5046, std:         0.8310 },
      marketCap               : { mean:     3.9544e+10, std:     4.6383e+10 },
      sentimentScore          : { mean:         0.1191, std:         0.1972 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7314, std:         0.4445 },
      toneChangeDelta         : { mean:        -0.0163, std:         0.2081 },
    },
    weights: {
      priceToLow              : -0.0031,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0138,
      priceToHigh             : -0.0005,
      concernLevel            : +0.0023,
      marketCap               : +0.0014,
      sentimentScore          : -0.0024,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0142,
      toneChangeDelta         : +0.0019,
    },
    scorePercentiles: {
      p10: -0.0249,
      p25: -0.0113,
      p50: -0.0021,
      p75: +0.0114,
      p90: +0.0271,
      mean: +0.0000,
      std: +0.0201,
    },
    sampleCount: 175,
  },
  'Real Estate': {
    featureStats: {
      priceToLow              : { mean:         1.2594, std:         0.1755 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        17.2230, std:        27.5552 },
      priceToHigh             : { mean:         0.8766, std:         0.0811 },
      concernLevel            : { mean:         5.3208, std:         0.7773 },
      marketCap               : { mean:     3.7322e+10, std:     3.4738e+10 },
      sentimentScore          : { mean:         0.1470, std:         0.2073 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7083, std:         0.4559 },
      toneChangeDelta         : { mean:        -0.0146, std:         0.2511 },
    },
    weights: {
      priceToLow              : -0.0030,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0070,
      priceToHigh             : +0.0029,
      concernLevel            : +0.0004,
      marketCap               : +0.0027,
      sentimentScore          : +0.0016,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0096,
      toneChangeDelta         : +0.0010,
    },
    scorePercentiles: {
      p10: -0.0144,
      p25: -0.0097,
      p50: -0.0049,
      p75: +0.0102,
      p90: +0.0180,
      mean: +0.0000,
      std: +0.0139,
    },
    sampleCount: 168,
  },
  'Communication Services': {
    featureStats: {
      priceToLow              : { mean:         1.5530, std:         0.8254 },
      majorDowngrades         : { mean:         0.0000, std:          1.0000 },
      analystUpsidePotential  : { mean:        45.9901, std:        83.2598 },
      priceToHigh             : { mean:         0.8239, std:         0.1658 },
      concernLevel            : { mean:         5.2894, std:         0.6671 },
      marketCap               : { mean:     1.9135e+11, std:     3.9945e+11 },
      sentimentScore          : { mean:         0.1071, std:         0.1833 },
      upgradesLast30d         : { mean:         0.0000, std:          1.0000 },
      filingTypeFactor        : { mean:         0.7434, std:         0.4387 },
      toneChangeDelta         : { mean:         0.0004, std:         0.2390 },
    },
    weights: {
      priceToLow              : +0.0040,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0168,
      priceToHigh             : -0.0080,
      concernLevel            : -0.0001,
      marketCap               : +0.0019,
      sentimentScore          : +0.0020,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0026,
      toneChangeDelta         : -0.0051,
    },
    scorePercentiles: {
      p10: -0.0179,
      p25: -0.0124,
      p50: -0.0060,
      p75: +0.0047,
      p90: +0.0231,
      mean: -0.0000,
      std: +0.0222,
    },
    sampleCount: 113,
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
