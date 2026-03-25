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
  majorDowngrades         : { mean:         0.0000, std:         1.0000 },
  analystUpsidePotential  : { mean:        29.5690, std:        55.1452 },
  priceToHigh             : { mean:         0.8381, std:         0.1401 },
  concernLevel            : { mean:         5.3333, std:         0.8027 },
  marketCap               : { mean:     9.8179e+10, std:     3.4064e+11 },
  sentimentScore          : { mean:         0.1095, std:         0.1893 },
  upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
  filingTypeFactor        : { mean:         0.7378, std:         0.4399 },
  toneChangeDelta         : { mean:        -0.0113, std:         0.2243 },
} as const;

// v2 model trained on 4009 samples with historically accurate price features

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

/** Market-cap tier thresholds in USD (mega >200B, large 10-200B, mid 2-10B, small <2B). */
export const CAP_TIER_THRESHOLDS = {
  mega:  200_000_000_000,
  large:  10_000_000_000,
  mid:     2_000_000_000,
} as const;

/** Returns the market-cap tier label for a given market cap (USD). */
export function getCapTier(marketCap: number): 'mega' | 'large' | 'mid' | 'small' {
  if (marketCap >= CAP_TIER_THRESHOLDS.mega)  return 'mega';
  if (marketCap >= CAP_TIER_THRESHOLDS.large) return 'large';
  if (marketCap >= CAP_TIER_THRESHOLDS.mid)   return 'mid';
  return 'small';
}

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
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        34.7362, std:        44.2018 },
      priceToHigh             : { mean:         0.8639, std:         0.1307 },
      concernLevel            : { mean:         5.2729, std:         0.7149 },
      marketCap               : { mean:     4.9819e+10, std:     6.0223e+10 },
      sentimentScore          : { mean:         0.0917, std:         0.1768 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
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
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        29.3900, std:        56.4114 },
      priceToHigh             : { mean:         0.7799, std:         0.1722 },
      concernLevel            : { mean:         5.3184, std:         0.8170 },
      marketCap               : { mean:     7.8397e+10, std:     2.9488e+11 },
      sentimentScore          : { mean:         0.1099, std:         0.1898 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
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
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        21.8839, std:        24.4984 },
      priceToHigh             : { mean:         0.8668, std:         0.0956 },
      concernLevel            : { mean:         5.2141, std:         0.7850 },
      marketCap               : { mean:     4.7998e+10, std:     1.1778e+11 },
      sentimentScore          : { mean:         0.0945, std:         0.1801 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
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
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        57.5638, std:       113.3593 },
      priceToHigh             : { mean:         0.8414, std:         0.1331 },
      concernLevel            : { mean:         5.2780, std:         0.6912 },
      marketCap               : { mean:     3.5186e+11, std:     8.8244e+11 },
      sentimentScore          : { mean:         0.1125, std:         0.1911 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
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
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        20.6248, std:        33.6161 },
      priceToHigh             : { mean:         0.8264, std:         0.1388 },
      concernLevel            : { mean:         5.4208, std:         0.8960 },
      marketCap               : { mean:     1.0201e+11, std:     1.5214e+11 },
      sentimentScore          : { mean:         0.1419, std:         0.2053 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
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
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        30.1235, std:        37.2210 },
      priceToHigh             : { mean:         0.9071, std:         0.0921 },
      concernLevel            : { mean:         5.2829, std:         0.8096 },
      marketCap               : { mean:     2.2302e+10, std:     2.2610e+10 },
      sentimentScore          : { mean:         0.0919, std:         0.1777 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
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
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        11.1763, std:        34.0631 },
      priceToHigh             : { mean:         0.8271, std:         0.1405 },
      concernLevel            : { mean:         5.4338, std:         0.8734 },
      marketCap               : { mean:     1.0409e+11, std:     1.9837e+11 },
      sentimentScore          : { mean:         0.1042, std:         0.1869 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
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
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        33.5850, std:        39.1128 },
      priceToHigh             : { mean:         0.7907, std:         0.1484 },
      concernLevel            : { mean:         5.5373, std:         0.8387 },
      marketCap               : { mean:     4.3907e+10, std:     9.1327e+10 },
      sentimentScore          : { mean:         0.1302, std:         0.2024 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
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
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        15.6782, std:        31.8785 },
      priceToHigh             : { mean:         0.8270, std:         0.1515 },
      concernLevel            : { mean:         5.5046, std:         0.8310 },
      marketCap               : { mean:     3.9544e+10, std:     4.6383e+10 },
      sentimentScore          : { mean:         0.1191, std:         0.1972 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
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
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        17.2230, std:        27.5552 },
      priceToHigh             : { mean:         0.8766, std:         0.0811 },
      concernLevel            : { mean:         5.3208, std:         0.7773 },
      marketCap               : { mean:     3.7322e+10, std:     3.4738e+10 },
      sentimentScore          : { mean:         0.1470, std:         0.2073 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
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
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        45.9901, std:        83.2598 },
      priceToHigh             : { mean:         0.8239, std:         0.1658 },
      concernLevel            : { mean:         5.2894, std:         0.6671 },
      marketCap               : { mean:     1.9135e+11, std:     3.9945e+11 },
      sentimentScore          : { mean:         0.1071, std:         0.1833 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
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
 * Cap-tier-specific Ridge regression models (MoE experts).
 * Populated by: npx tsx scripts/retrain-alpha-v2.ts
 */
const CAP_TIER_MODELS: Record<string, SectorModel> = {
  // Auto-generated by retrain-alpha-v2.ts (4 cap-tier experts)
  'large': {
    featureStats: {
      priceToLow              : { mean:         1.3433, std:         0.3368 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        32.3393, std:        54.7132 },
      priceToHigh             : { mean:         0.8688, std:         0.1098 },
      concernLevel            : { mean:         5.3315, std:         0.7724 },
      marketCap               : { mean:     5.2582e+10, std:     4.2372e+10 },
      sentimentScore          : { mean:         0.1170, std:         0.1923 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7284, std:         0.4449 },
      toneChangeDelta         : { mean:        -0.0120, std:         0.2329 },
    },
    weights: {
      priceToLow              : -0.0002,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0177,
      priceToHigh             : -0.0019,
      concernLevel            : +0.0009,
      marketCap               : +0.0016,
      sentimentScore          : -0.0003,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0080,
      toneChangeDelta         : -0.0004,
    },
    scorePercentiles: {
      p10: -0.0171,
      p25: -0.0117,
      p50: -0.0038,
      p75: +0.0074,
      p90: +0.0175,
      mean: -0.0000,
      std: +0.0199,
    },
    sampleCount: 2320,
  },
  'mid': {
    featureStats: {
      priceToLow              : { mean:         1.3703, std:         0.4115 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        19.9556, std:        43.9068 },
      priceToHigh             : { mean:         0.8101, std:         0.1416 },
      concernLevel            : { mean:         5.3158, std:         0.8293 },
      marketCap               : { mean:      5.4459e+9, std:      2.2370e+9 },
      sentimentScore          : { mean:         0.0930, std:         0.1806 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7439, std:         0.4367 },
      toneChangeDelta         : { mean:        -0.0118, std:         0.2023 },
    },
    weights: {
      priceToLow              : +0.0004,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0319,
      priceToHigh             : -0.0037,
      concernLevel            : +0.0073,
      marketCap               : +0.0075,
      sentimentScore          : +0.0031,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0037,
      toneChangeDelta         : -0.0007,
    },
    scorePercentiles: {
      p10: -0.0337,
      p25: -0.0190,
      p50: -0.0033,
      p75: +0.0139,
      p90: +0.0346,
      mean: -0.0000,
      std: +0.0341,
    },
    sampleCount: 941,
  },
  'small': {
    featureStats: {
      priceToLow              : { mean:         1.3721, std:         0.4165 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        15.2258, std:        56.0534 },
      priceToHigh             : { mean:         0.6926, std:         0.1938 },
      concernLevel            : { mean:         5.4030, std:         0.9269 },
      marketCap               : { mean: 814450672.7094, std: 511050278.6761 },
      sentimentScore          : { mean:         0.0962, std:         0.1829 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7759, std:         0.4175 },
      toneChangeDelta         : { mean:        -0.0123, std:         0.2178 },
    },
    weights: {
      priceToLow              : -0.0066,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0360,
      priceToHigh             : -0.0012,
      concernLevel            : +0.0069,
      marketCap               : +0.0095,
      sentimentScore          : -0.0022,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0012,
      toneChangeDelta         : -0.0010,
    },
    scorePercentiles: {
      p10: -0.0418,
      p25: -0.0233,
      p50: -0.0031,
      p75: +0.0163,
      p90: +0.0390,
      mean: -0.0000,
      std: +0.0371,
    },
    sampleCount: 406,
  },
  'mega': {
    featureStats: {
      priceToLow              : { mean:         1.4748, std:         0.4649 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        54.2539, std:        71.9435 },
      priceToHigh             : { mean:         0.8795, std:         0.1160 },
      concernLevel            : { mean:         5.3102, std:         0.7704 },
      marketCap               : { mean:     7.7823e+11, std:     9.1576e+11 },
      sentimentScore          : { mean:         0.1195, std:         0.1963 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7398, std:         0.4394 },
      toneChangeDelta         : { mean:        -0.0033, std:         0.2304 },
    },
    weights: {
      priceToLow              : -0.0010,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0096,
      priceToHigh             : -0.0023,
      concernLevel            : +0.0071,
      marketCap               : +0.0013,
      sentimentScore          : +0.0056,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0059,
      toneChangeDelta         : -0.0065,
    },
    scorePercentiles: {
      p10: -0.0163,
      p25: -0.0108,
      p50: -0.0018,
      p75: +0.0085,
      p90: +0.0183,
      mean: -0.0000,
      std: +0.0150,
    },
    sampleCount: 342,
  },
};

/**
 * Combined sector×cap-tier Ridge regression models (finest-grained MoE experts).
 * Keys are "CanonicalSector:capTier" (e.g. "Technology:mega").
 * Populated by: npx tsx scripts/retrain-alpha-v2.ts
 */
const COMBINED_MODELS: Record<string, SectorModel> = {
  // Auto-generated by retrain-alpha-v2.ts (29 sector×cap-tier experts)
  'Industrials:large': {
    featureStats: {
      priceToLow              : { mean:         1.3822, std:         0.2897 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        35.9677, std:        41.7032 },
      priceToHigh             : { mean:         0.8893, std:         0.0958 },
      concernLevel            : { mean:         5.2592, std:         0.7051 },
      marketCap               : { mean:     5.0874e+10, std:     3.7492e+10 },
      sentimentScore          : { mean:         0.0963, std:         0.1806 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7253, std:         0.4468 },
      toneChangeDelta         : { mean:        -0.0028, std:         0.2160 },
    },
    weights: {
      priceToLow              : -0.0020,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0208,
      priceToHigh             : -0.0037,
      concernLevel            : +0.0004,
      marketCap               : +0.0003,
      sentimentScore          : +0.0016,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0034,
      toneChangeDelta         : +0.0030,
    },
    scorePercentiles: {
      p10: -0.0209,
      p25: -0.0142,
      p50: -0.0052,
      p75: +0.0086,
      p90: +0.0254,
      mean: +0.0000,
      std: +0.0226,
    },
    sampleCount: 517,
  },
  'Healthcare:large': {
    featureStats: {
      priceToLow              : { mean:         1.2948, std:         0.1853 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        25.3929, std:        31.0262 },
      priceToHigh             : { mean:         0.8415, std:         0.1293 },
      concernLevel            : { mean:         5.3522, std:         0.8926 },
      marketCap               : { mean:     7.2144e+10, std:     5.6794e+10 },
      sentimentScore          : { mean:         0.1360, std:         0.2014 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7201, std:         0.4497 },
      toneChangeDelta         : { mean:        -0.0160, std:         0.2579 },
    },
    weights: {
      priceToLow              : +0.0013,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0154,
      priceToHigh             : -0.0067,
      concernLevel            : +0.0019,
      marketCap               : +0.0038,
      sentimentScore          : -0.0003,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0035,
      toneChangeDelta         : -0.0006,
    },
    scorePercentiles: {
      p10: -0.0193,
      p25: -0.0115,
      p50: -0.0032,
      p75: +0.0093,
      p90: +0.0240,
      mean: -0.0000,
      std: +0.0175,
    },
    sampleCount: 293,
  },
  'Technology:large': {
    featureStats: {
      priceToLow              : { mean:         1.4478, std:         0.6291 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        47.7697, std:       116.1165 },
      priceToHigh             : { mean:         0.8545, std:         0.1154 },
      concernLevel            : { mean:         5.2637, std:         0.6803 },
      marketCap               : { mean:     6.9652e+10, std:     5.2282e+10 },
      sentimentScore          : { mean:         0.1076, std:         0.1858 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7481, std:         0.4349 },
      toneChangeDelta         : { mean:        -0.0131, std:         0.2323 },
    },
    weights: {
      priceToLow              : +0.0044,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0145,
      priceToHigh             : +0.0069,
      concernLevel            : +0.0028,
      marketCap               : +0.0057,
      sentimentScore          : -0.0026,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0032,
      toneChangeDelta         : -0.0019,
    },
    scorePercentiles: {
      p10: -0.0205,
      p25: -0.0121,
      p50: -0.0032,
      p75: +0.0063,
      p90: +0.0224,
      mean: +0.0000,
      std: +0.0194,
    },
    sampleCount: 270,
  },
  'Financials:mid': {
    featureStats: {
      priceToLow              : { mean:         1.3240, std:         0.1865 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        21.7954, std:        25.0450 },
      priceToHigh             : { mean:         0.8530, std:         0.0926 },
      concernLevel            : { mean:         5.2261, std:         0.7983 },
      marketCap               : { mean:      5.0843e+9, std:      2.2929e+9 },
      sentimentScore          : { mean:         0.0776, std:         0.1688 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7510, std:         0.4333 },
      toneChangeDelta         : { mean:        -0.0086, std:         0.1898 },
    },
    weights: {
      priceToLow              : -0.0047,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0042,
      priceToHigh             : +0.0054,
      concernLevel            : +0.0095,
      marketCap               : +0.0031,
      sentimentScore          : +0.0009,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0006,
      toneChangeDelta         : +0.0014,
    },
    scorePercentiles: {
      p10: -0.0118,
      p25: -0.0076,
      p50: -0.0016,
      p75: +0.0066,
      p90: +0.0171,
      mean: +0.0000,
      std: +0.0113,
    },
    sampleCount: 261,
  },
  'Consumer Discretionary:large': {
    featureStats: {
      priceToLow              : { mean:         1.4300, std:         0.3214 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        44.6826, std:        51.1266 },
      priceToHigh             : { mean:         0.8698, std:         0.1039 },
      concernLevel            : { mean:         5.3028, std:         0.8022 },
      marketCap               : { mean:     4.9955e+10, std:     4.0744e+10 },
      sentimentScore          : { mean:         0.1333, std:         0.1987 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7371, std:         0.4411 },
      toneChangeDelta         : { mean:        -0.0120, std:         0.2386 },
    },
    weights: {
      priceToLow              : +0.0015,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0181,
      priceToHigh             : -0.0002,
      concernLevel            : -0.0008,
      marketCap               : -0.0012,
      sentimentScore          : -0.0028,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0039,
      toneChangeDelta         : -0.0039,
    },
    scorePercentiles: {
      p10: -0.0195,
      p25: -0.0124,
      p50: -0.0041,
      p75: +0.0080,
      p90: +0.0209,
      mean: -0.0000,
      std: +0.0194,
    },
    sampleCount: 251,
  },
  'Consumer Discretionary:mid': {
    featureStats: {
      priceToLow              : { mean:         1.4543, std:         0.4315 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        22.0247, std:        52.1109 },
      priceToHigh             : { mean:         0.7810, std:         0.1467 },
      concernLevel            : { mean:         5.2686, std:         0.7786 },
      marketCap               : { mean:      5.2609e+9, std:      1.9994e+9 },
      sentimentScore          : { mean:         0.0863, std:         0.1790 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7549, std:         0.4312 },
      toneChangeDelta         : { mean:        -0.0088, std:         0.2163 },
    },
    weights: {
      priceToLow              : +0.0030,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0438,
      priceToHigh             : -0.0143,
      concernLevel            : +0.0012,
      marketCap               : +0.0073,
      sentimentScore          : -0.0033,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0059,
      toneChangeDelta         : +0.0075,
    },
    scorePercentiles: {
      p10: -0.0457,
      p25: -0.0356,
      p50: -0.0076,
      p75: +0.0259,
      p90: +0.0515,
      mean: -0.0000,
      std: +0.0498,
    },
    sampleCount: 204,
  },
  'Financials:large': {
    featureStats: {
      priceToLow              : { mean:         1.2948, std:         0.1597 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        20.2353, std:        23.2748 },
      priceToHigh             : { mean:         0.8969, std:         0.0917 },
      concernLevel            : { mean:         5.1916, std:         0.6761 },
      marketCap               : { mean:     5.3977e+10, std:     3.7460e+10 },
      sentimentScore          : { mean:         0.1247, std:         0.1936 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7079, std:         0.4560 },
      toneChangeDelta         : { mean:        -0.0228, std:         0.2421 },
    },
    weights: {
      priceToLow              : -0.0054,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0062,
      priceToHigh             : -0.0008,
      concernLevel            : -0.0016,
      marketCap               : +0.0025,
      sentimentScore          : -0.0053,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0049,
      toneChangeDelta         : -0.0017,
    },
    scorePercentiles: {
      p10: -0.0179,
      p25: -0.0082,
      p50: +0.0013,
      p75: +0.0089,
      p90: +0.0164,
      mean: -0.0000,
      std: +0.0127,
    },
    sampleCount: 178,
  },
  'Utilities:large': {
    featureStats: {
      priceToLow              : { mean:         1.3905, std:         0.4430 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        35.4713, std:        45.6246 },
      priceToHigh             : { mean:         0.9120, std:         0.0996 },
      concernLevel            : { mean:         5.3294, std:         0.7890 },
      marketCap               : { mean:     3.5601e+10, std:     2.1882e+10 },
      sentimentScore          : { mean:         0.0856, std:         0.1735 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7401, std:         0.4398 },
      toneChangeDelta         : { mean:        -0.0288, std:         0.2059 },
    },
    weights: {
      priceToLow              : -0.0046,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0158,
      priceToHigh             : +0.0013,
      concernLevel            : -0.0026,
      marketCap               : +0.0026,
      sentimentScore          : -0.0020,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0206,
      toneChangeDelta         : +0.0032,
    },
    scorePercentiles: {
      p10: -0.0236,
      p25: -0.0189,
      p50: -0.0110,
      p75: +0.0247,
      p90: +0.0375,
      mean: +0.0000,
      std: +0.0283,
    },
    sampleCount: 177,
  },
  'Consumer Discretionary:small': {
    featureStats: {
      priceToLow              : { mean:         1.4198, std:         0.4875 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        15.6756, std:        66.7417 },
      priceToHigh             : { mean:         0.6367, std:         0.1872 },
      concernLevel            : { mean:         5.3753, std:         0.8972 },
      marketCap               : { mean: 673851318.9647, std: 475151143.0687 },
      sentimentScore          : { mean:         0.1000, std:         0.1840 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7765, std:         0.4178 },
      toneChangeDelta         : { mean:        -0.0135, std:         0.2240 },
    },
    weights: {
      priceToLow              : -0.0044,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0350,
      priceToHigh             : -0.0007,
      concernLevel            : +0.0118,
      marketCap               : +0.0041,
      sentimentScore          : -0.0025,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0067,
      toneChangeDelta         : +0.0007,
    },
    scorePercentiles: {
      p10: -0.0396,
      p25: -0.0243,
      p50: -0.0053,
      p75: +0.0197,
      p90: +0.0424,
      mean: -0.0000,
      std: +0.0365,
    },
    sampleCount: 170,
  },
  'Real Estate:large': {
    featureStats: {
      priceToLow              : { mean:         1.2524, std:         0.1764 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        18.6349, std:        27.8567 },
      priceToHigh             : { mean:         0.8808, std:         0.0774 },
      concernLevel            : { mean:         5.3308, std:         0.7498 },
      marketCap               : { mean:     3.9711e+10, std:     3.4907e+10 },
      sentimentScore          : { mean:         0.1574, std:         0.2114 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7051, std:         0.4575 },
      toneChangeDelta         : { mean:        -0.0157, std:         0.2606 },
    },
    weights: {
      priceToLow              : -0.0020,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0065,
      priceToHigh             : +0.0034,
      concernLevel            : +0.0008,
      marketCap               : +0.0021,
      sentimentScore          : +0.0013,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0100,
      toneChangeDelta         : +0.0011,
    },
    scorePercentiles: {
      p10: -0.0145,
      p25: -0.0103,
      p50: -0.0053,
      p75: +0.0115,
      p90: +0.0177,
      mean: +0.0000,
      std: +0.0138,
    },
    sampleCount: 156,
  },
  'Consumer Staples:large': {
    featureStats: {
      priceToLow              : { mean:         1.1684, std:         0.1253 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:         6.2344, std:        23.2342 },
      priceToHigh             : { mean:         0.8456, std:         0.1093 },
      concernLevel            : { mean:         5.6354, std:         0.8346 },
      marketCap               : { mean:     4.1109e+10, std:     2.5334e+10 },
      sentimentScore          : { mean:         0.1264, std:         0.1992 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7361, std:         0.4423 },
      toneChangeDelta         : { mean:        -0.0031, std:         0.2351 },
    },
    weights: {
      priceToLow              : -0.0023,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0134,
      priceToHigh             : -0.0010,
      concernLevel            : -0.0013,
      marketCap               : +0.0019,
      sentimentScore          : +0.0042,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0110,
      toneChangeDelta         : +0.0064,
    },
    scorePercentiles: {
      p10: -0.0280,
      p25: -0.0143,
      p50: -0.0014,
      p75: +0.0136,
      p90: +0.0267,
      mean: +0.0000,
      std: +0.0214,
    },
    sampleCount: 144,
  },
  'Materials:large': {
    featureStats: {
      priceToLow              : { mean:         1.2794, std:         0.1887 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        23.4678, std:        25.4983 },
      priceToHigh             : { mean:         0.8538, std:         0.1159 },
      concernLevel            : { mean:         5.4566, std:         0.8368 },
      marketCap               : { mean:     3.6493e+10, std:     2.2793e+10 },
      sentimentScore          : { mean:         0.1136, std:         0.1928 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7279, std:         0.4467 },
      toneChangeDelta         : { mean:        -0.0121, std:         0.2145 },
    },
    weights: {
      priceToLow              : -0.0049,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0113,
      priceToHigh             : +0.0019,
      concernLevel            : +0.0006,
      marketCap               : +0.0056,
      sentimentScore          : -0.0015,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0088,
      toneChangeDelta         : -0.0022,
    },
    scorePercentiles: {
      p10: -0.0174,
      p25: -0.0105,
      p50: -0.0002,
      p75: +0.0082,
      p90: +0.0226,
      mean: +0.0000,
      std: +0.0164,
    },
    sampleCount: 136,
  },
  'Energy:large': {
    featureStats: {
      priceToLow              : { mean:         1.2839, std:         0.2295 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        38.9094, std:        29.3332 },
      priceToHigh             : { mean:         0.8154, std:         0.1116 },
      concernLevel            : { mean:         5.5122, std:         0.7711 },
      marketCap               : { mean:     5.0590e+10, std:     3.6894e+10 },
      sentimentScore          : { mean:         0.1340, std:         0.2040 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7252, std:         0.4481 },
      toneChangeDelta         : { mean:        -0.0137, std:         0.2320 },
    },
    weights: {
      priceToLow              : +0.0002,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0196,
      priceToHigh             : -0.0021,
      concernLevel            : +0.0111,
      marketCap               : -0.0037,
      sentimentScore          : -0.0017,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0175,
      toneChangeDelta         : -0.0053,
    },
    scorePercentiles: {
      p10: -0.0314,
      p25: -0.0205,
      p50: -0.0017,
      p75: +0.0143,
      p90: +0.0399,
      mean: -0.0000,
      std: +0.0285,
    },
    sampleCount: 131,
  },
  'Utilities:mid': {
    featureStats: {
      priceToLow              : { mean:         1.2098, std:         0.1246 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        25.5744, std:        18.5285 },
      priceToHigh             : { mean:         0.9052, std:         0.0812 },
      concernLevel            : { mean:         5.1967, std:         0.8566 },
      marketCap               : { mean:      5.0344e+9, std:      2.0620e+9 },
      sentimentScore          : { mean:         0.0987, std:         0.1829 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7333, std:         0.4441 },
      toneChangeDelta         : { mean:        -0.0288, std:         0.2115 },
    },
    weights: {
      priceToLow              : -0.0030,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0039,
      priceToHigh             : +0.0019,
      concernLevel            : +0.0067,
      marketCap               : +0.0047,
      sentimentScore          : +0.0031,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0116,
      toneChangeDelta         : -0.0035,
    },
    scorePercentiles: {
      p10: -0.0185,
      p25: -0.0116,
      p50: -0.0042,
      p75: +0.0130,
      p90: +0.0208,
      mean: +0.0000,
      std: +0.0163,
    },
    sampleCount: 120,
  },
  'Industrials:mid': {
    featureStats: {
      priceToLow              : { mean:         1.4383, std:         0.3708 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        24.6436, std:        45.7650 },
      priceToHigh             : { mean:         0.7882, std:         0.1579 },
      concernLevel            : { mean:         5.2989, std:         0.7605 },
      marketCap               : { mean:      5.1309e+9, std:      2.5310e+9 },
      sentimentScore          : { mean:         0.0458, std:         0.1332 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7368, std:         0.4427 },
      toneChangeDelta         : { mean:        -0.0016, std:         0.1811 },
    },
    weights: {
      priceToLow              : -0.0072,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0174,
      priceToHigh             : -0.0022,
      concernLevel            : -0.0037,
      marketCap               : +0.0000,
      sentimentScore          : +0.0043,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0013,
      toneChangeDelta         : -0.0047,
    },
    scorePercentiles: {
      p10: -0.0239,
      p25: -0.0124,
      p50: -0.0009,
      p75: +0.0110,
      p90: +0.0241,
      mean: -0.0000,
      std: +0.0178,
    },
    sampleCount: 95,
  },
  'Technology:mega': {
    featureStats: {
      priceToLow              : { mean:         1.7447, std:         0.6249 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:       109.2426, std:       108.0012 },
      priceToHigh             : { mean:         0.8790, std:         0.1152 },
      concernLevel            : { mean:         5.2774, std:         0.6681 },
      marketCap               : { mean:     1.3238e+12, std:     1.4700e+12 },
      sentimentScore          : { mean:         0.1104, std:         0.1984 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7634, std:         0.4273 },
      toneChangeDelta         : { mean:        -0.0078, std:         0.2024 },
    },
    weights: {
      priceToLow              : -0.0010,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0069,
      priceToHigh             : +0.0040,
      concernLevel            : -0.0046,
      marketCap               : +0.0025,
      sentimentScore          : +0.0030,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0026,
      toneChangeDelta         : -0.0026,
    },
    scorePercentiles: {
      p10: -0.0117,
      p25: -0.0058,
      p50: -0.0009,
      p75: +0.0055,
      p90: +0.0098,
      mean: +0.0000,
      std: +0.0098,
    },
    sampleCount: 93,
  },
  'Energy:mid': {
    featureStats: {
      priceToLow              : { mean:         1.4365, std:         0.3527 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        21.9441, std:        33.7062 },
      priceToHigh             : { mean:         0.8061, std:         0.1357 },
      concernLevel            : { mean:         5.5919, std:         0.9270 },
      marketCap               : { mean:      5.6415e+9, std:      1.4579e+9 },
      sentimentScore          : { mean:         0.1424, std:         0.2083 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7209, std:         0.4512 },
      toneChangeDelta         : { mean:        -0.0221, std:         0.2269 },
    },
    weights: {
      priceToLow              : +0.0047,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0130,
      priceToHigh             : +0.0037,
      concernLevel            : +0.0113,
      marketCap               : +0.0054,
      sentimentScore          : +0.0020,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0087,
      toneChangeDelta         : -0.0038,
    },
    scorePercentiles: {
      p10: -0.0234,
      p25: -0.0121,
      p50: -0.0039,
      p75: +0.0142,
      p90: +0.0215,
      mean: -0.0000,
      std: +0.0198,
    },
    sampleCount: 86,
  },
  'Financials:small': {
    featureStats: {
      priceToLow              : { mean:         1.3186, std:         0.2316 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        23.1774, std:        27.5317 },
      priceToHigh             : { mean:         0.8265, std:         0.0916 },
      concernLevel            : { mean:         5.2907, std:         0.9726 },
      marketCap               : { mean: 958383888.2133, std: 365052359.4839 },
      sentimentScore          : { mean:         0.0640, std:         0.1620 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7867, std:         0.4124 },
      toneChangeDelta         : { mean:        -0.0080, std:         0.2032 },
    },
    weights: {
      priceToLow              : -0.0057,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0081,
      priceToHigh             : -0.0062,
      concernLevel            : +0.0028,
      marketCap               : +0.0012,
      sentimentScore          : +0.0004,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0031,
      toneChangeDelta         : +0.0004,
    },
    scorePercentiles: {
      p10: -0.0194,
      p25: -0.0085,
      p50: +0.0004,
      p75: +0.0103,
      p90: +0.0195,
      mean: -0.0000,
      std: +0.0153,
    },
    sampleCount: 75,
  },
  'Communication Services:large': {
    featureStats: {
      priceToLow              : { mean:         1.3483, std:         0.2973 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        43.3550, std:        69.6911 },
      priceToHigh             : { mean:         0.8505, std:         0.1377 },
      concernLevel            : { mean:         5.2985, std:         0.6995 },
      marketCap               : { mean:     5.3589e+10, std:     4.9177e+10 },
      sentimentScore          : { mean:         0.0918, std:         0.1731 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7463, std:         0.4384 },
      toneChangeDelta         : { mean:         0.0045, std:         0.2449 },
    },
    weights: {
      priceToLow              : +0.0057,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0049,
      priceToHigh             : -0.0050,
      concernLevel            : +0.0022,
      marketCap               : +0.0001,
      sentimentScore          : +0.0050,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0024,
      toneChangeDelta         : -0.0038,
    },
    scorePercentiles: {
      p10: -0.0103,
      p25: -0.0067,
      p50: -0.0015,
      p75: +0.0043,
      p90: +0.0107,
      mean: +0.0000,
      std: +0.0101,
    },
    sampleCount: 67,
  },
  'Consumer Staples:mega': {
    featureStats: {
      priceToLow              : { mean:         1.2651, std:         0.2108 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        29.0539, std:        29.8771 },
      priceToHigh             : { mean:         0.8984, std:         0.1072 },
      concernLevel            : { mean:         5.1340, std:         0.8537 },
      marketCap               : { mean:     4.4153e+11, std:     2.6109e+11 },
      sentimentScore          : { mean:         0.0991, std:         0.1836 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7358, std:         0.4451 },
      toneChangeDelta         : { mean:        -0.0028, std:         0.1962 },
    },
    weights: {
      priceToLow              : +0.0027,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0043,
      priceToHigh             : +0.0053,
      concernLevel            : -0.0033,
      marketCap               : -0.0031,
      sentimentScore          : +0.0006,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0024,
      toneChangeDelta         : -0.0022,
    },
    scorePercentiles: {
      p10: -0.0088,
      p25: -0.0057,
      p50: +0.0004,
      p75: +0.0064,
      p90: +0.0132,
      mean: +0.0000,
      std: +0.0102,
    },
    sampleCount: 53,
  },
  'Healthcare:mid': {
    featureStats: {
      priceToLow              : { mean:         1.2881, std:         0.2647 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        -8.7936, std:        31.4020 },
      priceToHigh             : { mean:         0.7354, std:         0.1503 },
      concernLevel            : { mean:         5.7080, std:         0.9075 },
      marketCap               : { mean:      7.2789e+9, std:      2.3601e+9 },
      sentimentScore          : { mean:         0.1200, std:         0.2010 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7000, std:         0.4629 },
      toneChangeDelta         : { mean:        -0.0240, std:         0.1642 },
    },
    weights: {
      priceToLow              : +0.0018,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0098,
      priceToHigh             : -0.0020,
      concernLevel            : +0.0024,
      marketCap               : +0.0069,
      sentimentScore          : +0.0038,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0114,
      toneChangeDelta         : +0.0015,
    },
    scorePercentiles: {
      p10: -0.0235,
      p25: -0.0131,
      p50: +0.0003,
      p75: +0.0098,
      p90: +0.0255,
      mean: -0.0000,
      std: +0.0184,
    },
    sampleCount: 50,
  },
  'Consumer Staples:small': {
    featureStats: {
      priceToLow              : { mean:         1.3689, std:         0.4840 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        12.3575, std:        47.5971 },
      priceToHigh             : { mean:         0.7155, std:         0.1976 },
      concernLevel            : { mean:         5.4500, std:         1.0122 },
      marketCap               : { mean: 875017994.2400, std: 526535871.6419 },
      sentimentScore          : { mean:         0.0750, std:         0.1694 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7600, std:         0.4314 },
      toneChangeDelta         : { mean:        -0.0240, std:         0.2086 },
    },
    weights: {
      priceToLow              : -0.0057,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0101,
      priceToHigh             : +0.0035,
      concernLevel            : -0.0058,
      marketCap               : +0.0045,
      sentimentScore          : +0.0034,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0022,
      toneChangeDelta         : -0.0079,
    },
    scorePercentiles: {
      p10: -0.0199,
      p25: -0.0098,
      p50: -0.0005,
      p75: +0.0113,
      p90: +0.0179,
      mean: +0.0000,
      std: +0.0151,
    },
    sampleCount: 50,
  },
  'Technology:mid': {
    featureStats: {
      priceToLow              : { mean:         1.2634, std:         0.1847 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:         4.8386, std:        47.5340 },
      priceToHigh             : { mean:         0.6703, std:         0.1551 },
      concernLevel            : { mean:         5.3732, std:         0.8149 },
      marketCap               : { mean:      5.7102e+9, std:      2.2571e+9 },
      sentimentScore          : { mean:         0.1500, std:         0.2095 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7805, std:         0.4191 },
      toneChangeDelta         : { mean:         0.0073, std:         0.2486 },
    },
    weights: {
      priceToLow              : +0.0024,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0052,
      priceToHigh             : -0.0056,
      concernLevel            : +0.0088,
      marketCap               : +0.0003,
      sentimentScore          : +0.0003,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0011,
      toneChangeDelta         : +0.0009,
    },
    scorePercentiles: {
      p10: -0.0146,
      p25: -0.0084,
      p50: -0.0005,
      p75: +0.0060,
      p90: +0.0126,
      mean: +0.0000,
      std: +0.0116,
    },
    sampleCount: 41,
  },
  'Industrials:small': {
    featureStats: {
      priceToLow              : { mean:         1.3960, std:         0.4559 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        11.7709, std:        40.0714 },
      priceToHigh             : { mean:         0.6679, std:         0.2235 },
      concernLevel            : { mean:         5.3368, std:         0.7957 },
      marketCap               : { mean: 844976380.6316, std: 475205051.6660 },
      sentimentScore          : { mean:         0.1500, std:         0.2092 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7632, std:         0.4309 },
      toneChangeDelta         : { mean:        -0.0039, std:         0.2246 },
    },
    weights: {
      priceToLow              : -0.0022,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0193,
      priceToHigh             : -0.0121,
      concernLevel            : +0.0120,
      marketCap               : -0.0041,
      sentimentScore          : -0.0016,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0010,
      toneChangeDelta         : +0.0013,
    },
    scorePercentiles: {
      p10: -0.0383,
      p25: -0.0272,
      p50: -0.0098,
      p75: +0.0237,
      p90: +0.0487,
      mean: -0.0000,
      std: +0.0363,
    },
    sampleCount: 38,
  },
  'Consumer Discretionary:mega': {
    featureStats: {
      priceToLow              : { mean:         1.4440, std:         0.3855 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        29.2720, std:        35.7782 },
      priceToHigh             : { mean:         0.8207, std:         0.1694 },
      concernLevel            : { mean:         5.4342, std:         0.7412 },
      marketCap               : { mean:     1.0066e+12, std:     7.7266e+11 },
      sentimentScore          : { mean:         0.1263, std:         0.1989 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7368, std:         0.4463 },
      toneChangeDelta         : { mean:         0.0079, std:         0.2789 },
    },
    weights: {
      priceToLow              : -0.0061,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0186,
      priceToHigh             : -0.0080,
      concernLevel            : +0.0022,
      marketCap               : +0.0006,
      sentimentScore          : +0.0048,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0045,
      toneChangeDelta         : -0.0011,
    },
    scorePercentiles: {
      p10: -0.0259,
      p25: -0.0180,
      p50: -0.0028,
      p75: +0.0080,
      p90: +0.0230,
      mean: +0.0000,
      std: +0.0257,
    },
    sampleCount: 38,
  },
  'Consumer Staples:mid': {
    featureStats: {
      priceToLow              : { mean:         1.3036, std:         0.3764 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:         3.2050, std:        44.3675 },
      priceToHigh             : { mean:         0.8040, std:         0.1066 },
      concernLevel            : { mean:         5.0568, std:         0.5834 },
      marketCap               : { mean:      5.3632e+9, std:      2.8352e+9 },
      sentimentScore          : { mean:         0.0649, std:         0.1563 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7838, std:         0.4173 },
      toneChangeDelta         : { mean:         0.0162, std:         0.1993 },
    },
    weights: {
      priceToLow              : +0.0030,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0088,
      priceToHigh             : -0.0033,
      concernLevel            : -0.0039,
      marketCap               : +0.0004,
      sentimentScore          : -0.0005,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0038,
      toneChangeDelta         : -0.0003,
    },
    scorePercentiles: {
      p10: -0.0159,
      p25: -0.0074,
      p50: +0.0007,
      p75: +0.0059,
      p90: +0.0145,
      mean: -0.0000,
      std: +0.0131,
    },
    sampleCount: 37,
  },
  'Healthcare:mega': {
    featureStats: {
      priceToLow              : { mean:         1.2935, std:         0.2868 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        31.5432, std:        29.1383 },
      priceToHigh             : { mean:         0.8616, std:         0.1150 },
      concernLevel            : { mean:         5.5278, std:         0.8355 },
      marketCap               : { mean:     4.9341e+11, std:     2.1783e+11 },
      sentimentScore          : { mean:         0.1944, std:         0.2267 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.6944, std:         0.4672 },
      toneChangeDelta         : { mean:        -0.0056, std:         0.2759 },
    },
    weights: {
      priceToLow              : +0.0001,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0044,
      priceToHigh             : +0.0041,
      concernLevel            : +0.0067,
      marketCap               : +0.0028,
      sentimentScore          : -0.0012,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0067,
      toneChangeDelta         : -0.0041,
    },
    scorePercentiles: {
      p10: -0.0156,
      p25: -0.0064,
      p50: -0.0011,
      p75: +0.0130,
      p90: +0.0175,
      mean: -0.0000,
      std: +0.0136,
    },
    sampleCount: 36,
  },
  'Energy:small': {
    featureStats: {
      priceToLow              : { mean:         1.3402, std:         0.3278 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        42.6046, std:        71.5425 },
      priceToHigh             : { mean:         0.6305, std:         0.2088 },
      concernLevel            : { mean:         5.6676, std:         0.8831 },
      marketCap               : { mean: 913755299.7647, std: 705402521.2916 },
      sentimentScore          : { mean:         0.1191, std:         0.2015 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7647, std:         0.4306 },
      toneChangeDelta         : { mean:        -0.0265, std:         0.2700 },
    },
    weights: {
      priceToLow              : -0.0023,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0053,
      priceToHigh             : -0.0012,
      concernLevel            : -0.0072,
      marketCap               : +0.0043,
      sentimentScore          : +0.0003,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0125,
      toneChangeDelta         : +0.0009,
    },
    scorePercentiles: {
      p10: -0.0178,
      p25: -0.0120,
      p50: -0.0021,
      p75: +0.0083,
      p90: +0.0270,
      mean: -0.0000,
      std: +0.0162,
    },
    sampleCount: 34,
  },
  'Financials:mega': {
    featureStats: {
      priceToLow              : { mean:         1.3065, std:         0.2226 },
      majorDowngrades         : { mean:         0.0000, std:         1.0000 },
      analystUpsidePotential  : { mean:        28.5360, std:        18.1674 },
      priceToHigh             : { mean:         0.9054, std:         0.0924 },
      concernLevel            : { mean:         5.0667, std:         0.7619 },
      marketCap               : { mean:     4.6206e+11, std:     1.7796e+11 },
      sentimentScore          : { mean:         0.1348, std:         0.2067 },
      upgradesLast30d         : { mean:         0.0000, std:         1.0000 },
      filingTypeFactor        : { mean:         0.7576, std:         0.4352 },
      toneChangeDelta         : { mean:        -0.0152, std:         0.2757 },
    },
    weights: {
      priceToLow              : +0.0006,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0048,
      priceToHigh             : +0.0034,
      concernLevel            : -0.0030,
      marketCap               : -0.0018,
      sentimentScore          : +0.0017,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0032,
      toneChangeDelta         : +0.0013,
    },
    scorePercentiles: {
      p10: -0.0120,
      p25: -0.0082,
      p50: +0.0013,
      p75: +0.0066,
      p90: +0.0106,
      mean: -0.0000,
      std: +0.0097,
    },
    sampleCount: 33,
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
  // MoE routing hierarchy: sector:capTier → sector → capTier → global
  const canonicalSector = sector ? (SECTOR_NORMALIZATION[sector] ?? sector) : null;
  const capTier = getCapTier(features.marketCap);
  const combinedKey = canonicalSector ? `${canonicalSector}:${capTier}` : null;

  const combinedModel  = combinedKey ? COMBINED_MODELS[combinedKey] : null;
  const sectorModel    = !combinedModel && canonicalSector ? SECTOR_MODELS[canonicalSector] : null;
  const capTierModel   = !combinedModel && !sectorModel ? CAP_TIER_MODELS[capTier] : null;
  const activeModel    = combinedModel ?? sectorModel ?? capTierModel ?? null;

  const effectiveWeights = activeModel?.weights ?? WEIGHTS;
  const effectiveStats   = activeModel?.featureStats ?? FEATURE_STATS;
  const effectivePercs   = activeModel?.scorePercentiles ?? SCORE_PERCENTILES;

  let expertUsed: string;
  if (combinedModel)    expertUsed = combinedKey!;
  else if (sectorModel) expertUsed = canonicalSector!;
  else if (capTierModel) expertUsed = capTier;
  else                  expertUsed = 'global';

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
