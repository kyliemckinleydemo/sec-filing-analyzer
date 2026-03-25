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
  majorDowngrades         : { mean:         0.0409, std:         0.2162 },
  analystUpsidePotential  : { mean:        29.5690, std:        55.1452 },
  priceToHigh             : { mean:         0.8381, std:         0.1401 },
  concernLevel            : { mean:         5.3333, std:         0.8027 },
  marketCap               : { mean:     9.8179e+10, std:     3.4064e+11 },
  sentimentScore          : { mean:         0.1095, std:         0.1893 },
  upgradesLast30d         : { mean:         0.1130, std:         0.3751 },
  filingTypeFactor        : { mean:         0.7378, std:         0.4399 },
  toneChangeDelta         : { mean:        -0.0113, std:         0.2243 },
  epsSurprise             : { mean:         3.8894, std:        14.2667 },
} as const;

// v2 model trained on 4009 samples with historically accurate price features

// v2 model trained on 4009 samples with historically accurate price features

// v2 model trained on 4009 samples with historically accurate price features

// v2 model trained on 4009 samples with historically accurate price features

// v2 model trained on 3779 samples with historically accurate price features

// v2 model trained on 3779 samples with historically accurate price features

// Stepwise+Ridge model weights (standardized feature space, Ridge λ=100)
// v1 weights from 340 mega-cap samples. v2 weights updated by retrain-alpha-v2.ts.
const WEIGHTS = {
  priceToLow              : -0.0031,
  majorDowngrades         : -0.0006,
  analystUpsidePotential  : +0.0236,
  priceToHigh             : -0.0002,
  concernLevel            : +0.0047,
  marketCap               : +0.0001,
  sentimentScore          : +0.0003,
  upgradesLast30d         : -0.0021,
  filingTypeFactor        : -0.0067,
  toneChangeDelta         : -0.0008,
  epsSurprise             : +0.0112,
} as const;

// Score distribution percentiles from training data
// Used to classify signals as LONG/SHORT/NEUTRAL and assign confidence
const SCORE_PERCENTILES = {
  p10: -0.0262,
  p25: -0.0152,
  p50: -0.0031,
  p75: +0.0105,
  p90: +0.0271,
  mean: -0.0000,
  std: +0.0274,
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
  epsSurprise: number;            // (epsActual - epsEstimate) / |epsEstimate| * 100, winsorized [-50,50]; 0 if unknown
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
      majorDowngrades         : { mean:         0.0387, std:         0.2149 },
      analystUpsidePotential  : { mean:        34.7362, std:        44.2018 },
      priceToHigh             : { mean:         0.8639, std:         0.1307 },
      concernLevel            : { mean:         5.2729, std:         0.7149 },
      marketCap               : { mean:     4.9819e+10, std:     6.0223e+10 },
      sentimentScore          : { mean:         0.0917, std:         0.1768 },
      upgradesLast30d         : { mean:         0.1324, std:         0.4180 },
      filingTypeFactor        : { mean:         0.7292, std:         0.4447 },
      toneChangeDelta         : { mean:        -0.0015, std:         0.2118 },
      epsSurprise             : { mean:         3.2515, std:        12.3725 },
    },
    weights: {
      priceToLow              : -0.0058,
      majorDowngrades         : -0.0010,
      analystUpsidePotential  : +0.0249,
      priceToHigh             : -0.0056,
      concernLevel            : +0.0014,
      marketCap               : +0.0017,
      sentimentScore          : +0.0028,
      upgradesLast30d         : -0.0048,
      filingTypeFactor        : -0.0045,
      toneChangeDelta         : +0.0011,
      epsSurprise             : +0.0127,
    },
    scorePercentiles: {
      p10: -0.0306,
      p25: -0.0186,
      p50: -0.0051,
      p75: +0.0145,
      p90: +0.0383,
      mean: +0.0000,
      std: +0.0312,
    },
    sampleCount: 672,
  },
  'Consumer Discretionary': {
    featureStats: {
      priceToLow              : { mean:         1.4357, std:         0.4065 },
      majorDowngrades         : { mean:         0.0317, std:         0.2141 },
      analystUpsidePotential  : { mean:        29.3900, std:        56.4114 },
      priceToHigh             : { mean:         0.7799, std:         0.1722 },
      concernLevel            : { mean:         5.3184, std:         0.8170 },
      marketCap               : { mean:     7.8397e+10, std:     2.9488e+11 },
      sentimentScore          : { mean:         0.1099, std:         0.1898 },
      upgradesLast30d         : { mean:         0.0845, std:         0.3235 },
      filingTypeFactor        : { mean:         0.7526, std:         0.4318 },
      toneChangeDelta         : { mean:        -0.0103, std:         0.2303 },
      epsSurprise             : { mean:         4.8718, std:        18.7629 },
    },
    weights: {
      priceToLow              : -0.0045,
      majorDowngrades         : +0.0072,
      analystUpsidePotential  : +0.0427,
      priceToHigh             : -0.0018,
      concernLevel            : +0.0057,
      marketCap               : +0.0021,
      sentimentScore          : -0.0047,
      upgradesLast30d         : -0.0025,
      filingTypeFactor        : +0.0081,
      toneChangeDelta         : +0.0012,
      epsSurprise             : +0.0111,
    },
    scorePercentiles: {
      p10: -0.0477,
      p25: -0.0281,
      p50: -0.0065,
      p75: +0.0216,
      p90: +0.0507,
      mean: +0.0000,
      std: +0.0461,
    },
    sampleCount: 663,
  },
  'Financials': {
    featureStats: {
      priceToLow              : { mean:         1.3127, std:         0.1875 },
      majorDowngrades         : { mean:         0.0274, std:         0.1635 },
      analystUpsidePotential  : { mean:        21.8839, std:        24.4984 },
      priceToHigh             : { mean:         0.8668, std:         0.0956 },
      concernLevel            : { mean:         5.2141, std:         0.7850 },
      marketCap               : { mean:     4.7998e+10, std:     1.1778e+11 },
      sentimentScore          : { mean:         0.0945, std:         0.1801 },
      upgradesLast30d         : { mean:         0.0603, std:         0.2741 },
      filingTypeFactor        : { mean:         0.7422, std:         0.4378 },
      toneChangeDelta         : { mean:        -0.0135, std:         0.2150 },
      epsSurprise             : { mean:         3.7423, std:        11.0935 },
    },
    weights: {
      priceToLow              : -0.0090,
      majorDowngrades         : -0.0022,
      analystUpsidePotential  : +0.0072,
      priceToHigh             : +0.0044,
      concernLevel            : +0.0048,
      marketCap               : -0.0028,
      sentimentScore          : -0.0021,
      upgradesLast30d         : +0.0029,
      filingTypeFactor        : -0.0018,
      toneChangeDelta         : +0.0008,
      epsSurprise             : +0.0124,
    },
    scorePercentiles: {
      p10: -0.0178,
      p25: -0.0091,
      p50: -0.0004,
      p75: +0.0091,
      p90: +0.0186,
      mean: -0.0000,
      std: +0.0175,
    },
    sampleCount: 547,
  },
  'Technology': {
    featureStats: {
      priceToLow              : { mean:         1.4974, std:         0.6149 },
      majorDowngrades         : { mean:         0.0520, std:         0.2436 },
      analystUpsidePotential  : { mean:        57.5638, std:       113.3593 },
      priceToHigh             : { mean:         0.8414, std:         0.1331 },
      concernLevel            : { mean:         5.2780, std:         0.6912 },
      marketCap               : { mean:     3.5186e+11, std:     8.8244e+11 },
      sentimentScore          : { mean:         0.1125, std:         0.1911 },
      upgradesLast30d         : { mean:         0.2153, std:         0.5183 },
      filingTypeFactor        : { mean:         0.7550, std:         0.4306 },
      toneChangeDelta         : { mean:        -0.0099, std:         0.2271 },
      epsSurprise             : { mean:         4.6213, std:         9.1881 },
    },
    weights: {
      priceToLow              : +0.0032,
      majorDowngrades         : -0.0053,
      analystUpsidePotential  : +0.0156,
      priceToHigh             : +0.0066,
      concernLevel            : +0.0026,
      marketCap               : +0.0014,
      sentimentScore          : -0.0010,
      upgradesLast30d         : -0.0035,
      filingTypeFactor        : +0.0006,
      toneChangeDelta         : -0.0014,
      epsSurprise             : +0.0034,
    },
    scorePercentiles: {
      p10: -0.0201,
      p25: -0.0110,
      p50: -0.0020,
      p75: +0.0076,
      p90: +0.0218,
      mean: +0.0000,
      std: +0.0202,
    },
    sampleCount: 404,
  },
  'Healthcare': {
    featureStats: {
      priceToLow              : { mean:         1.2954, std:         0.2113 },
      majorDowngrades         : { mean:         0.0442, std:         0.2180 },
      analystUpsidePotential  : { mean:        20.6248, std:        33.6161 },
      priceToHigh             : { mean:         0.8264, std:         0.1388 },
      concernLevel            : { mean:         5.4208, std:         0.8960 },
      marketCap               : { mean:     1.0201e+11, std:     1.5214e+11 },
      sentimentScore          : { mean:         0.1419, std:         0.2053 },
      upgradesLast30d         : { mean:         0.1377, std:         0.4199 },
      filingTypeFactor        : { mean:         0.7169, std:         0.4511 },
      toneChangeDelta         : { mean:        -0.0158, std:         0.2491 },
      epsSurprise             : { mean:         3.7297, std:         9.1761 },
    },
    weights: {
      priceToLow              : +0.0010,
      majorDowngrades         : -0.0010,
      analystUpsidePotential  : +0.0163,
      priceToHigh             : -0.0033,
      concernLevel            : +0.0036,
      marketCap               : +0.0016,
      sentimentScore          : +0.0025,
      upgradesLast30d         : +0.0033,
      filingTypeFactor        : -0.0098,
      toneChangeDelta         : -0.0038,
      epsSurprise             : +0.0172,
    },
    scorePercentiles: {
      p10: -0.0305,
      p25: -0.0168,
      p50: -0.0010,
      p75: +0.0143,
      p90: +0.0340,
      mean: -0.0000,
      std: +0.0273,
    },
    sampleCount: 385,
  },
  'Utilities': {
    featureStats: {
      priceToLow              : { mean:         1.3113, std:         0.3559 },
      majorDowngrades         : { mean:         0.0323, std:         0.1770 },
      analystUpsidePotential  : { mean:        30.1235, std:        37.2210 },
      priceToHigh             : { mean:         0.9071, std:         0.0921 },
      concernLevel            : { mean:         5.2829, std:         0.8096 },
      marketCap               : { mean:     2.2302e+10, std:     2.2610e+10 },
      sentimentScore          : { mean:         0.0919, std:         0.1777 },
      upgradesLast30d         : { mean:         0.0581, std:         0.2342 },
      filingTypeFactor        : { mean:         0.7355, std:         0.4418 },
      toneChangeDelta         : { mean:        -0.0271, std:         0.2069 },
      epsSurprise             : { mean:         3.1185, std:        14.0551 },
    },
    weights: {
      priceToLow              : -0.0060,
      majorDowngrades         : -0.0004,
      analystUpsidePotential  : +0.0160,
      priceToHigh             : +0.0028,
      concernLevel            : +0.0018,
      marketCap               : +0.0038,
      sentimentScore          : -0.0010,
      upgradesLast30d         : +0.0004,
      filingTypeFactor        : -0.0215,
      toneChangeDelta         : +0.0006,
      epsSurprise             : -0.0004,
    },
    scorePercentiles: {
      p10: -0.0247,
      p25: -0.0188,
      p50: -0.0120,
      p75: +0.0246,
      p90: +0.0378,
      mean: -0.0000,
      std: +0.0283,
    },
    sampleCount: 310,
  },
  'Consumer Staples': {
    featureStats: {
      priceToLow              : { mean:         1.2394, std:         0.2844 },
      majorDowngrades         : { mean:         0.0458, std:         0.2094 },
      analystUpsidePotential  : { mean:        11.1763, std:        34.0631 },
      priceToHigh             : { mean:         0.8271, std:         0.1405 },
      concernLevel            : { mean:         5.4338, std:         0.8734 },
      marketCap               : { mean:     1.0409e+11, std:     1.9837e+11 },
      sentimentScore          : { mean:         0.1042, std:         0.1869 },
      upgradesLast30d         : { mean:         0.0810, std:         0.2859 },
      filingTypeFactor        : { mean:         0.7465, std:         0.4358 },
      toneChangeDelta         : { mean:        -0.0042, std:         0.2184 },
      epsSurprise             : { mean:         2.2015, std:        11.7059 },
    },
    weights: {
      priceToLow              : -0.0071,
      majorDowngrades         : -0.0027,
      analystUpsidePotential  : +0.0204,
      priceToHigh             : +0.0046,
      concernLevel            : -0.0062,
      marketCap               : -0.0046,
      sentimentScore          : +0.0062,
      upgradesLast30d         : +0.0008,
      filingTypeFactor        : -0.0068,
      toneChangeDelta         : -0.0007,
      epsSurprise             : +0.0067,
    },
    scorePercentiles: {
      p10: -0.0253,
      p25: -0.0145,
      p50: -0.0007,
      p75: +0.0134,
      p90: +0.0235,
      mean: +0.0000,
      std: +0.0220,
    },
    sampleCount: 284,
  },
  'Energy': {
    featureStats: {
      priceToLow              : { mean:         1.3358, std:         0.2959 },
      majorDowngrades         : { mean:         0.0192, std:         0.1376 },
      analystUpsidePotential  : { mean:        33.5850, std:        39.1128 },
      priceToHigh             : { mean:         0.7907, std:         0.1484 },
      concernLevel            : { mean:         5.5373, std:         0.8387 },
      marketCap               : { mean:     4.3907e+10, std:     9.1327e+10 },
      sentimentScore          : { mean:         0.1302, std:         0.2024 },
      upgradesLast30d         : { mean:         0.0577, std:         0.2496 },
      filingTypeFactor        : { mean:         0.7269, std:         0.4464 },
      toneChangeDelta         : { mean:        -0.0177, std:         0.2307 },
      epsSurprise             : { mean:         5.2272, std:        17.7363 },
    },
    weights: {
      priceToLow              : +0.0025,
      majorDowngrades         : +0.0025,
      analystUpsidePotential  : +0.0187,
      priceToHigh             : +0.0051,
      concernLevel            : +0.0086,
      marketCap               : +0.0007,
      sentimentScore          : -0.0016,
      upgradesLast30d         : +0.0011,
      filingTypeFactor        : -0.0227,
      toneChangeDelta         : -0.0049,
      epsSurprise             : +0.0191,
    },
    scorePercentiles: {
      p10: -0.0382,
      p25: -0.0237,
      p50: -0.0057,
      p75: +0.0263,
      p90: +0.0466,
      mean: +0.0000,
      std: +0.0362,
    },
    sampleCount: 260,
  },
  'Materials': {
    featureStats: {
      priceToLow              : { mean:         1.2640, std:         0.1858 },
      majorDowngrades         : { mean:         0.1257, std:         0.3956 },
      analystUpsidePotential  : { mean:        15.6782, std:        31.8785 },
      priceToHigh             : { mean:         0.8270, std:         0.1515 },
      concernLevel            : { mean:         5.5046, std:         0.8310 },
      marketCap               : { mean:     3.9544e+10, std:     4.6383e+10 },
      sentimentScore          : { mean:         0.1191, std:         0.1972 },
      upgradesLast30d         : { mean:         0.2457, std:         0.5593 },
      filingTypeFactor        : { mean:         0.7314, std:         0.4445 },
      toneChangeDelta         : { mean:        -0.0163, std:         0.2081 },
      epsSurprise             : { mean:         4.0813, std:        14.7307 },
    },
    weights: {
      priceToLow              : -0.0033,
      majorDowngrades         : -0.0034,
      analystUpsidePotential  : +0.0137,
      priceToHigh             : +0.0004,
      concernLevel            : +0.0018,
      marketCap               : +0.0014,
      sentimentScore          : -0.0023,
      upgradesLast30d         : -0.0032,
      filingTypeFactor        : -0.0142,
      toneChangeDelta         : +0.0016,
      epsSurprise             : +0.0070,
    },
    scorePercentiles: {
      p10: -0.0274,
      p25: -0.0129,
      p50: -0.0019,
      p75: +0.0148,
      p90: +0.0265,
      mean: +0.0000,
      std: +0.0217,
    },
    sampleCount: 175,
  },
  'Real Estate': {
    featureStats: {
      priceToLow              : { mean:         1.2594, std:         0.1755 },
      majorDowngrades         : { mean:         0.0417, std:         0.2004 },
      analystUpsidePotential  : { mean:        17.2230, std:        27.5552 },
      priceToHigh             : { mean:         0.8766, std:         0.0811 },
      concernLevel            : { mean:         5.3208, std:         0.7773 },
      marketCap               : { mean:     3.7322e+10, std:     3.4738e+10 },
      sentimentScore          : { mean:         0.1470, std:         0.2073 },
      upgradesLast30d         : { mean:         0.1369, std:         0.3617 },
      filingTypeFactor        : { mean:         0.7083, std:         0.4559 },
      toneChangeDelta         : { mean:        -0.0146, std:         0.2511 },
      epsSurprise             : { mean:         3.8516, std:        20.8732 },
    },
    weights: {
      priceToLow              : -0.0031,
      majorDowngrades         : -0.0011,
      analystUpsidePotential  : +0.0070,
      priceToHigh             : +0.0029,
      concernLevel            : +0.0004,
      marketCap               : +0.0028,
      sentimentScore          : +0.0016,
      upgradesLast30d         : -0.0008,
      filingTypeFactor        : -0.0095,
      toneChangeDelta         : +0.0011,
      epsSurprise             : +0.0018,
    },
    scorePercentiles: {
      p10: -0.0144,
      p25: -0.0108,
      p50: -0.0036,
      p75: +0.0102,
      p90: +0.0179,
      mean: +0.0000,
      std: +0.0140,
    },
    sampleCount: 168,
  },
  'Communication Services': {
    featureStats: {
      priceToLow              : { mean:         1.5530, std:         0.8254 },
      majorDowngrades         : { mean:         0.0619, std:         0.2421 },
      analystUpsidePotential  : { mean:        45.9901, std:        83.2598 },
      priceToHigh             : { mean:         0.8239, std:         0.1658 },
      concernLevel            : { mean:         5.2894, std:         0.6671 },
      marketCap               : { mean:     1.9135e+11, std:     3.9945e+11 },
      sentimentScore          : { mean:         0.1071, std:         0.1833 },
      upgradesLast30d         : { mean:         0.1150, std:         0.3721 },
      filingTypeFactor        : { mean:         0.7434, std:         0.4387 },
      toneChangeDelta         : { mean:         0.0004, std:         0.2390 },
      epsSurprise             : { mean:         4.9393, std:        17.6238 },
    },
    weights: {
      priceToLow              : +0.0039,
      majorDowngrades         : -0.0021,
      analystUpsidePotential  : +0.0167,
      priceToHigh             : -0.0085,
      concernLevel            : -0.0005,
      marketCap               : +0.0019,
      sentimentScore          : +0.0017,
      upgradesLast30d         : +0.0063,
      filingTypeFactor        : +0.0025,
      toneChangeDelta         : -0.0048,
      epsSurprise             : -0.0005,
    },
    scorePercentiles: {
      p10: -0.0189,
      p25: -0.0141,
      p50: -0.0062,
      p75: +0.0069,
      p90: +0.0242,
      mean: -0.0000,
      std: +0.0228,
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
      majorDowngrades         : { mean:         0.0582, std:         0.2570 },
      analystUpsidePotential  : { mean:        32.3393, std:        54.7132 },
      priceToHigh             : { mean:         0.8688, std:         0.1098 },
      concernLevel            : { mean:         5.3315, std:         0.7724 },
      marketCap               : { mean:     5.2582e+10, std:     4.2372e+10 },
      sentimentScore          : { mean:         0.1170, std:         0.1923 },
      upgradesLast30d         : { mean:         0.1491, std:         0.4155 },
      filingTypeFactor        : { mean:         0.7284, std:         0.4449 },
      toneChangeDelta         : { mean:        -0.0120, std:         0.2329 },
      epsSurprise             : { mean:         3.6463, std:        11.5908 },
    },
    weights: {
      priceToLow              : -0.0007,
      majorDowngrades         : -0.0003,
      analystUpsidePotential  : +0.0175,
      priceToHigh             : -0.0013,
      concernLevel            : +0.0008,
      marketCap               : +0.0016,
      sentimentScore          : -0.0004,
      upgradesLast30d         : -0.0012,
      filingTypeFactor        : -0.0083,
      toneChangeDelta         : -0.0002,
      epsSurprise             : +0.0086,
    },
    scorePercentiles: {
      p10: -0.0200,
      p25: -0.0130,
      p50: -0.0037,
      p75: +0.0088,
      p90: +0.0212,
      mean: -0.0000,
      std: +0.0217,
    },
    sampleCount: 2320,
  },
  'mid': {
    featureStats: {
      priceToLow              : { mean:         1.3703, std:         0.4115 },
      majorDowngrades         : { mean:         0.0149, std:         0.1376 },
      analystUpsidePotential  : { mean:        19.9556, std:        43.9068 },
      priceToHigh             : { mean:         0.8101, std:         0.1416 },
      concernLevel            : { mean:         5.3158, std:         0.8293 },
      marketCap               : { mean:      5.4459e+9, std:      2.2370e+9 },
      sentimentScore          : { mean:         0.0930, std:         0.1806 },
      upgradesLast30d         : { mean:         0.0499, std:         0.3036 },
      filingTypeFactor        : { mean:         0.7439, std:         0.4367 },
      toneChangeDelta         : { mean:        -0.0118, std:         0.2023 },
      epsSurprise             : { mean:         5.4218, std:        16.4576 },
    },
    weights: {
      priceToLow              : -0.0016,
      majorDowngrades         : -0.0033,
      analystUpsidePotential  : +0.0305,
      priceToHigh             : -0.0037,
      concernLevel            : +0.0072,
      marketCap               : +0.0076,
      sentimentScore          : +0.0029,
      upgradesLast30d         : -0.0042,
      filingTypeFactor        : -0.0039,
      toneChangeDelta         : -0.0005,
      epsSurprise             : +0.0128,
    },
    scorePercentiles: {
      p10: -0.0415,
      p25: -0.0217,
      p50: -0.0021,
      p75: +0.0184,
      p90: +0.0405,
      mean: -0.0000,
      std: +0.0368,
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
      epsSurprise             : { mean:         2.7639, std:        22.9694 },
    },
    weights: {
      priceToLow              : -0.0070,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0358,
      priceToHigh             : -0.0014,
      concernLevel            : +0.0073,
      marketCap               : +0.0080,
      sentimentScore          : -0.0023,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0015,
      toneChangeDelta         : -0.0010,
      epsSurprise             : +0.0135,
    },
    scorePercentiles: {
      p10: -0.0434,
      p25: -0.0244,
      p50: -0.0032,
      p75: +0.0178,
      p90: +0.0426,
      mean: +0.0000,
      std: +0.0395,
    },
    sampleCount: 406,
  },
  'mega': {
    featureStats: {
      priceToLow              : { mean:         1.4748, std:         0.4649 },
      majorDowngrades         : { mean:         0.0439, std:         0.2051 },
      analystUpsidePotential  : { mean:        54.2539, std:        71.9435 },
      priceToHigh             : { mean:         0.8795, std:         0.1160 },
      concernLevel            : { mean:         5.3102, std:         0.7704 },
      marketCap               : { mean:     7.7823e+11, std:     9.1576e+11 },
      sentimentScore          : { mean:         0.1195, std:         0.1963 },
      upgradesLast30d         : { mean:         0.1754, std:         0.4314 },
      filingTypeFactor        : { mean:         0.7398, std:         0.4394 },
      toneChangeDelta         : { mean:        -0.0033, std:         0.2304 },
      epsSurprise             : { mean:         2.6584, std:         9.7746 },
    },
    weights: {
      priceToLow              : -0.0008,
      majorDowngrades         : -0.0015,
      analystUpsidePotential  : +0.0100,
      priceToHigh             : -0.0019,
      concernLevel            : +0.0066,
      marketCap               : +0.0014,
      sentimentScore          : +0.0058,
      upgradesLast30d         : -0.0048,
      filingTypeFactor        : -0.0060,
      toneChangeDelta         : -0.0068,
      epsSurprise             : -0.0002,
    },
    scorePercentiles: {
      p10: -0.0159,
      p25: -0.0115,
      p50: -0.0016,
      p75: +0.0087,
      p90: +0.0198,
      mean: -0.0000,
      std: +0.0158,
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
      majorDowngrades         : { mean:         0.0464, std:         0.2366 },
      analystUpsidePotential  : { mean:        35.9677, std:        41.7032 },
      priceToHigh             : { mean:         0.8893, std:         0.0958 },
      concernLevel            : { mean:         5.2592, std:         0.7051 },
      marketCap               : { mean:     5.0874e+10, std:     3.7492e+10 },
      sentimentScore          : { mean:         0.0963, std:         0.1806 },
      upgradesLast30d         : { mean:         0.1567, std:         0.4320 },
      filingTypeFactor        : { mean:         0.7253, std:         0.4468 },
      toneChangeDelta         : { mean:        -0.0028, std:         0.2160 },
      epsSurprise             : { mean:         3.1561, std:         9.0439 },
    },
    weights: {
      priceToLow              : -0.0040,
      majorDowngrades         : -0.0013,
      analystUpsidePotential  : +0.0206,
      priceToHigh             : -0.0012,
      concernLevel            : +0.0002,
      marketCap               : +0.0015,
      sentimentScore          : +0.0012,
      upgradesLast30d         : -0.0062,
      filingTypeFactor        : -0.0037,
      toneChangeDelta         : +0.0020,
      epsSurprise             : +0.0118,
    },
    scorePercentiles: {
      p10: -0.0240,
      p25: -0.0148,
      p50: -0.0049,
      p75: +0.0097,
      p90: +0.0333,
      mean: +0.0000,
      std: +0.0263,
    },
    sampleCount: 517,
  },
  'Healthcare:large': {
    featureStats: {
      priceToLow              : { mean:         1.2948, std:         0.1853 },
      majorDowngrades         : { mean:         0.0512, std:         0.2358 },
      analystUpsidePotential  : { mean:        25.3929, std:        31.0262 },
      priceToHigh             : { mean:         0.8415, std:         0.1293 },
      concernLevel            : { mean:         5.3522, std:         0.8926 },
      marketCap               : { mean:     7.2144e+10, std:     5.6794e+10 },
      sentimentScore          : { mean:         0.1360, std:         0.2014 },
      upgradesLast30d         : { mean:         0.1433, std:         0.4378 },
      filingTypeFactor        : { mean:         0.7201, std:         0.4497 },
      toneChangeDelta         : { mean:        -0.0160, std:         0.2579 },
      epsSurprise             : { mean:         4.2370, std:         8.2720 },
    },
    weights: {
      priceToLow              : +0.0004,
      majorDowngrades         : -0.0011,
      analystUpsidePotential  : +0.0142,
      priceToHigh             : -0.0051,
      concernLevel            : +0.0022,
      marketCap               : +0.0023,
      sentimentScore          : +0.0004,
      upgradesLast30d         : +0.0054,
      filingTypeFactor        : -0.0047,
      toneChangeDelta         : -0.0009,
      epsSurprise             : +0.0149,
    },
    scorePercentiles: {
      p10: -0.0250,
      p25: -0.0157,
      p50: -0.0041,
      p75: +0.0125,
      p90: +0.0299,
      mean: -0.0000,
      std: +0.0238,
    },
    sampleCount: 293,
  },
  'Technology:large': {
    featureStats: {
      priceToLow              : { mean:         1.4478, std:         0.6291 },
      majorDowngrades         : { mean:         0.0519, std:         0.2383 },
      analystUpsidePotential  : { mean:        47.7697, std:       116.1165 },
      priceToHigh             : { mean:         0.8545, std:         0.1154 },
      concernLevel            : { mean:         5.2637, std:         0.6803 },
      marketCap               : { mean:     6.9652e+10, std:     5.2282e+10 },
      sentimentScore          : { mean:         0.1076, std:         0.1858 },
      upgradesLast30d         : { mean:         0.1630, std:         0.4432 },
      filingTypeFactor        : { mean:         0.7481, std:         0.4349 },
      toneChangeDelta         : { mean:        -0.0131, std:         0.2323 },
      epsSurprise             : { mean:         4.6837, std:         9.1400 },
    },
    weights: {
      priceToLow              : +0.0042,
      majorDowngrades         : -0.0034,
      analystUpsidePotential  : +0.0142,
      priceToHigh             : +0.0071,
      concernLevel            : +0.0030,
      marketCap               : +0.0058,
      sentimentScore          : -0.0028,
      upgradesLast30d         : -0.0008,
      filingTypeFactor        : +0.0034,
      toneChangeDelta         : -0.0007,
      epsSurprise             : +0.0074,
    },
    scorePercentiles: {
      p10: -0.0209,
      p25: -0.0119,
      p50: -0.0023,
      p75: +0.0068,
      p90: +0.0252,
      mean: +0.0000,
      std: +0.0210,
    },
    sampleCount: 270,
  },
  'Financials:mid': {
    featureStats: {
      priceToLow              : { mean:         1.3240, std:         0.1865 },
      majorDowngrades         : { mean:         0.0115, std:         0.1068 },
      analystUpsidePotential  : { mean:        21.7954, std:        25.0450 },
      priceToHigh             : { mean:         0.8530, std:         0.0926 },
      concernLevel            : { mean:         5.2261, std:         0.7983 },
      marketCap               : { mean:      5.0843e+9, std:      2.2929e+9 },
      sentimentScore          : { mean:         0.0776, std:         0.1688 },
      upgradesLast30d         : { mean:         0.0153, std:         0.1231 },
      filingTypeFactor        : { mean:         0.7510, std:         0.4333 },
      toneChangeDelta         : { mean:        -0.0086, std:         0.1898 },
      epsSurprise             : { mean:         4.0889, std:         9.6995 },
    },
    weights: {
      priceToLow              : -0.0049,
      majorDowngrades         : -0.0010,
      analystUpsidePotential  : +0.0036,
      priceToHigh             : +0.0052,
      concernLevel            : +0.0092,
      marketCap               : +0.0029,
      sentimentScore          : +0.0008,
      upgradesLast30d         : -0.0035,
      filingTypeFactor        : -0.0015,
      toneChangeDelta         : +0.0008,
      epsSurprise             : +0.0087,
    },
    scorePercentiles: {
      p10: -0.0154,
      p25: -0.0089,
      p50: -0.0011,
      p75: +0.0087,
      p90: +0.0187,
      mean: +0.0000,
      std: +0.0149,
    },
    sampleCount: 261,
  },
  'Consumer Discretionary:large': {
    featureStats: {
      priceToLow              : { mean:         1.4300, std:         0.3214 },
      majorDowngrades         : { mean:         0.0757, std:         0.3320 },
      analystUpsidePotential  : { mean:        44.6826, std:        51.1266 },
      priceToHigh             : { mean:         0.8698, std:         0.1039 },
      concernLevel            : { mean:         5.3028, std:         0.8022 },
      marketCap               : { mean:     4.9955e+10, std:     4.0744e+10 },
      sentimentScore          : { mean:         0.1333, std:         0.1987 },
      upgradesLast30d         : { mean:         0.1434, std:         0.3941 },
      filingTypeFactor        : { mean:         0.7371, std:         0.4411 },
      toneChangeDelta         : { mean:        -0.0120, std:         0.2386 },
      epsSurprise             : { mean:         4.3406, std:        11.1996 },
    },
    weights: {
      priceToLow              : +0.0012,
      majorDowngrades         : +0.0119,
      analystUpsidePotential  : +0.0177,
      priceToHigh             : +0.0015,
      concernLevel            : -0.0004,
      marketCap               : -0.0013,
      sentimentScore          : -0.0028,
      upgradesLast30d         : -0.0035,
      filingTypeFactor        : +0.0039,
      toneChangeDelta         : -0.0036,
      epsSurprise             : +0.0091,
    },
    scorePercentiles: {
      p10: -0.0258,
      p25: -0.0156,
      p50: -0.0053,
      p75: +0.0118,
      p90: +0.0293,
      mean: -0.0000,
      std: +0.0245,
    },
    sampleCount: 251,
  },
  'Consumer Discretionary:mid': {
    featureStats: {
      priceToLow              : { mean:         1.4543, std:         0.4315 },
      majorDowngrades         : { mean:         0.0049, std:         0.0700 },
      analystUpsidePotential  : { mean:        22.0247, std:        52.1109 },
      priceToHigh             : { mean:         0.7810, std:         0.1467 },
      concernLevel            : { mean:         5.2686, std:         0.7786 },
      marketCap               : { mean:      5.2609e+9, std:      1.9994e+9 },
      sentimentScore          : { mean:         0.0863, std:         0.1790 },
      upgradesLast30d         : { mean:         0.0735, std:         0.3431 },
      filingTypeFactor        : { mean:         0.7549, std:         0.4312 },
      toneChangeDelta         : { mean:        -0.0088, std:         0.2163 },
      epsSurprise             : { mean:         5.5866, std:        20.9006 },
    },
    weights: {
      priceToLow              : +0.0011,
      majorDowngrades         : +0.0044,
      analystUpsidePotential  : +0.0432,
      priceToHigh             : -0.0139,
      concernLevel            : +0.0019,
      marketCap               : +0.0065,
      sentimentScore          : -0.0027,
      upgradesLast30d         : -0.0004,
      filingTypeFactor        : +0.0061,
      toneChangeDelta         : +0.0068,
      epsSurprise             : +0.0132,
    },
    scorePercentiles: {
      p10: -0.0515,
      p25: -0.0359,
      p50: -0.0088,
      p75: +0.0276,
      p90: +0.0586,
      mean: -0.0000,
      std: +0.0521,
    },
    sampleCount: 204,
  },
  'Financials:large': {
    featureStats: {
      priceToLow              : { mean:         1.2948, std:         0.1597 },
      majorDowngrades         : { mean:         0.0449, std:         0.2078 },
      analystUpsidePotential  : { mean:        20.2353, std:        23.2748 },
      priceToHigh             : { mean:         0.8969, std:         0.0917 },
      concernLevel            : { mean:         5.1916, std:         0.6761 },
      marketCap               : { mean:     5.3977e+10, std:     3.7460e+10 },
      sentimentScore          : { mean:         0.1247, std:         0.1936 },
      upgradesLast30d         : { mean:         0.1348, std:         0.4169 },
      filingTypeFactor        : { mean:         0.7079, std:         0.4560 },
      toneChangeDelta         : { mean:        -0.0228, std:         0.2421 },
      epsSurprise             : { mean:         3.8246, std:        10.2858 },
    },
    weights: {
      priceToLow              : -0.0054,
      majorDowngrades         : -0.0063,
      analystUpsidePotential  : +0.0063,
      priceToHigh             : -0.0011,
      concernLevel            : -0.0021,
      marketCap               : +0.0023,
      sentimentScore          : -0.0044,
      upgradesLast30d         : +0.0025,
      filingTypeFactor        : -0.0053,
      toneChangeDelta         : -0.0009,
      epsSurprise             : +0.0069,
    },
    scorePercentiles: {
      p10: -0.0193,
      p25: -0.0096,
      p50: +0.0011,
      p75: +0.0099,
      p90: +0.0184,
      mean: -0.0000,
      std: +0.0157,
    },
    sampleCount: 178,
  },
  'Utilities:large': {
    featureStats: {
      priceToLow              : { mean:         1.3905, std:         0.4430 },
      majorDowngrades         : { mean:         0.0565, std:         0.2315 },
      analystUpsidePotential  : { mean:        35.4713, std:        45.6246 },
      priceToHigh             : { mean:         0.9120, std:         0.0996 },
      concernLevel            : { mean:         5.3294, std:         0.7890 },
      marketCap               : { mean:     3.5601e+10, std:     2.1882e+10 },
      sentimentScore          : { mean:         0.0856, std:         0.1735 },
      upgradesLast30d         : { mean:         0.1017, std:         0.3031 },
      filingTypeFactor        : { mean:         0.7401, std:         0.4398 },
      toneChangeDelta         : { mean:        -0.0288, std:         0.2059 },
      epsSurprise             : { mean:         1.7811, std:        13.3371 },
    },
    weights: {
      priceToLow              : -0.0050,
      majorDowngrades         : -0.0006,
      analystUpsidePotential  : +0.0158,
      priceToHigh             : +0.0015,
      concernLevel            : -0.0025,
      marketCap               : +0.0026,
      sentimentScore          : -0.0021,
      upgradesLast30d         : +0.0003,
      filingTypeFactor        : -0.0204,
      toneChangeDelta         : +0.0033,
      epsSurprise             : -0.0045,
    },
    scorePercentiles: {
      p10: -0.0252,
      p25: -0.0190,
      p50: -0.0103,
      p75: +0.0248,
      p90: +0.0375,
      mean: +0.0000,
      std: +0.0286,
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
      epsSurprise             : { mean:         4.9344, std:        24.8901 },
    },
    weights: {
      priceToLow              : -0.0047,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0349,
      priceToHigh             : -0.0011,
      concernLevel            : +0.0120,
      marketCap               : +0.0038,
      sentimentScore          : -0.0022,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0067,
      toneChangeDelta         : +0.0003,
      epsSurprise             : +0.0058,
    },
    scorePercentiles: {
      p10: -0.0411,
      p25: -0.0236,
      p50: -0.0049,
      p75: +0.0192,
      p90: +0.0404,
      mean: -0.0000,
      std: +0.0369,
    },
    sampleCount: 170,
  },
  'Real Estate:large': {
    featureStats: {
      priceToLow              : { mean:         1.2524, std:         0.1764 },
      majorDowngrades         : { mean:         0.0449, std:         0.2077 },
      analystUpsidePotential  : { mean:        18.6349, std:        27.8567 },
      priceToHigh             : { mean:         0.8808, std:         0.0774 },
      concernLevel            : { mean:         5.3308, std:         0.7498 },
      marketCap               : { mean:     3.9711e+10, std:     3.4907e+10 },
      sentimentScore          : { mean:         0.1574, std:         0.2114 },
      upgradesLast30d         : { mean:         0.1346, std:         0.3608 },
      filingTypeFactor        : { mean:         0.7051, std:         0.4575 },
      toneChangeDelta         : { mean:        -0.0157, std:         0.2606 },
      epsSurprise             : { mean:         3.6433, std:        20.6405 },
    },
    weights: {
      priceToLow              : -0.0020,
      majorDowngrades         : -0.0011,
      analystUpsidePotential  : +0.0065,
      priceToHigh             : +0.0034,
      concernLevel            : +0.0007,
      marketCap               : +0.0022,
      sentimentScore          : +0.0013,
      upgradesLast30d         : -0.0002,
      filingTypeFactor        : -0.0100,
      toneChangeDelta         : +0.0012,
      epsSurprise             : +0.0009,
    },
    scorePercentiles: {
      p10: -0.0148,
      p25: -0.0106,
      p50: -0.0052,
      p75: +0.0111,
      p90: +0.0177,
      mean: -0.0000,
      std: +0.0139,
    },
    sampleCount: 156,
  },
  'Consumer Staples:large': {
    featureStats: {
      priceToLow              : { mean:         1.1684, std:         0.1253 },
      majorDowngrades         : { mean:         0.0694, std:         0.2551 },
      analystUpsidePotential  : { mean:         6.2344, std:        23.2342 },
      priceToHigh             : { mean:         0.8456, std:         0.1093 },
      concernLevel            : { mean:         5.6354, std:         0.8346 },
      marketCap               : { mean:     4.1109e+10, std:     2.5334e+10 },
      sentimentScore          : { mean:         0.1264, std:         0.1992 },
      upgradesLast30d         : { mean:         0.1389, std:         0.3666 },
      filingTypeFactor        : { mean:         0.7361, std:         0.4423 },
      toneChangeDelta         : { mean:        -0.0031, std:         0.2351 },
      epsSurprise             : { mean:         1.7523, std:         6.7067 },
    },
    weights: {
      priceToLow              : -0.0026,
      majorDowngrades         : -0.0027,
      analystUpsidePotential  : +0.0135,
      priceToHigh             : -0.0012,
      concernLevel            : -0.0015,
      marketCap               : +0.0021,
      sentimentScore          : +0.0042,
      upgradesLast30d         : -0.0008,
      filingTypeFactor        : -0.0110,
      toneChangeDelta         : +0.0064,
      epsSurprise             : +0.0040,
    },
    scorePercentiles: {
      p10: -0.0283,
      p25: -0.0152,
      p50: -0.0005,
      p75: +0.0154,
      p90: +0.0279,
      mean: +0.0000,
      std: +0.0219,
    },
    sampleCount: 144,
  },
  'Materials:large': {
    featureStats: {
      priceToLow              : { mean:         1.2794, std:         0.1887 },
      majorDowngrades         : { mean:         0.1471, std:         0.4133 },
      analystUpsidePotential  : { mean:        23.4678, std:        25.4983 },
      priceToHigh             : { mean:         0.8538, std:         0.1159 },
      concernLevel            : { mean:         5.4566, std:         0.8368 },
      marketCap               : { mean:     3.6493e+10, std:     2.2793e+10 },
      sentimentScore          : { mean:         0.1136, std:         0.1928 },
      upgradesLast30d         : { mean:         0.2794, std:         0.5669 },
      filingTypeFactor        : { mean:         0.7279, std:         0.4467 },
      toneChangeDelta         : { mean:        -0.0121, std:         0.2145 },
      epsSurprise             : { mean:         3.3765, std:        14.0070 },
    },
    weights: {
      priceToLow              : -0.0048,
      majorDowngrades         : -0.0007,
      analystUpsidePotential  : +0.0112,
      priceToHigh             : +0.0020,
      concernLevel            : +0.0004,
      marketCap               : +0.0058,
      sentimentScore          : -0.0014,
      upgradesLast30d         : -0.0026,
      filingTypeFactor        : -0.0089,
      toneChangeDelta         : -0.0025,
      epsSurprise             : +0.0015,
    },
    scorePercentiles: {
      p10: -0.0191,
      p25: -0.0109,
      p50: -0.0005,
      p75: +0.0090,
      p90: +0.0230,
      mean: +0.0000,
      std: +0.0167,
    },
    sampleCount: 136,
  },
  'Energy:large': {
    featureStats: {
      priceToLow              : { mean:         1.2839, std:         0.2295 },
      majorDowngrades         : { mean:         0.0305, std:         0.1727 },
      analystUpsidePotential  : { mean:        38.9094, std:        29.3332 },
      priceToHigh             : { mean:         0.8154, std:         0.1116 },
      concernLevel            : { mean:         5.5122, std:         0.7711 },
      marketCap               : { mean:     5.0590e+10, std:     3.6894e+10 },
      sentimentScore          : { mean:         0.1340, std:         0.2040 },
      upgradesLast30d         : { mean:         0.1069, std:         0.3340 },
      filingTypeFactor        : { mean:         0.7252, std:         0.4481 },
      toneChangeDelta         : { mean:        -0.0137, std:         0.2320 },
      epsSurprise             : { mean:         4.8229, std:        13.7756 },
    },
    weights: {
      priceToLow              : -0.0001,
      majorDowngrades         : +0.0037,
      analystUpsidePotential  : +0.0181,
      priceToHigh             : -0.0011,
      concernLevel            : +0.0109,
      marketCap               : -0.0041,
      sentimentScore          : -0.0032,
      upgradesLast30d         : +0.0015,
      filingTypeFactor        : -0.0178,
      toneChangeDelta         : -0.0060,
      epsSurprise             : +0.0115,
    },
    scorePercentiles: {
      p10: -0.0361,
      p25: -0.0225,
      p50: -0.0035,
      p75: +0.0174,
      p90: +0.0426,
      mean: -0.0000,
      std: +0.0315,
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
      epsSurprise             : { mean:         5.7350, std:        14.9574 },
    },
    weights: {
      priceToLow              : -0.0032,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0041,
      priceToHigh             : +0.0017,
      concernLevel            : +0.0064,
      marketCap               : +0.0046,
      sentimentScore          : +0.0033,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0116,
      toneChangeDelta         : -0.0034,
      epsSurprise             : +0.0031,
    },
    scorePercentiles: {
      p10: -0.0190,
      p25: -0.0125,
      p50: -0.0037,
      p75: +0.0149,
      p90: +0.0231,
      mean: +0.0000,
      std: +0.0167,
    },
    sampleCount: 120,
  },
  'Industrials:mid': {
    featureStats: {
      priceToLow              : { mean:         1.4383, std:         0.3708 },
      majorDowngrades         : { mean:         0.0105, std:         0.1026 },
      analystUpsidePotential  : { mean:        24.6436, std:        45.7650 },
      priceToHigh             : { mean:         0.7882, std:         0.1579 },
      concernLevel            : { mean:         5.2989, std:         0.7605 },
      marketCap               : { mean:      5.1309e+9, std:      2.5310e+9 },
      sentimentScore          : { mean:         0.0458, std:         0.1332 },
      upgradesLast30d         : { mean:         0.0632, std:         0.4330 },
      filingTypeFactor        : { mean:         0.7368, std:         0.4427 },
      toneChangeDelta         : { mean:        -0.0016, std:         0.1811 },
      epsSurprise             : { mean:         5.4321, std:        18.8951 },
    },
    weights: {
      priceToLow              : -0.0071,
      majorDowngrades         : +0.0053,
      analystUpsidePotential  : +0.0165,
      priceToHigh             : -0.0017,
      concernLevel            : -0.0040,
      marketCap               : -0.0005,
      sentimentScore          : +0.0035,
      upgradesLast30d         : +0.0011,
      filingTypeFactor        : -0.0010,
      toneChangeDelta         : -0.0044,
      epsSurprise             : +0.0083,
    },
    scorePercentiles: {
      p10: -0.0287,
      p25: -0.0112,
      p50: +0.0004,
      p75: +0.0135,
      p90: +0.0267,
      mean: -0.0000,
      std: +0.0214,
    },
    sampleCount: 95,
  },
  'Technology:mega': {
    featureStats: {
      priceToLow              : { mean:         1.7447, std:         0.6249 },
      majorDowngrades         : { mean:         0.0215, std:         0.1458 },
      analystUpsidePotential  : { mean:       109.2426, std:       108.0012 },
      priceToHigh             : { mean:         0.8790, std:         0.1152 },
      concernLevel            : { mean:         5.2774, std:         0.6681 },
      marketCap               : { mean:     1.3238e+12, std:     1.4700e+12 },
      sentimentScore          : { mean:         0.1104, std:         0.1984 },
      upgradesLast30d         : { mean:         0.3548, std:         0.5832 },
      filingTypeFactor        : { mean:         0.7634, std:         0.4273 },
      toneChangeDelta         : { mean:        -0.0078, std:         0.2024 },
      epsSurprise             : { mean:         2.5655, std:         3.6086 },
    },
    weights: {
      priceToLow              : -0.0015,
      majorDowngrades         : -0.0024,
      analystUpsidePotential  : +0.0069,
      priceToHigh             : +0.0039,
      concernLevel            : -0.0054,
      marketCap               : +0.0026,
      sentimentScore          : +0.0026,
      upgradesLast30d         : -0.0047,
      filingTypeFactor        : -0.0033,
      toneChangeDelta         : -0.0026,
      epsSurprise             : -0.0055,
    },
    scorePercentiles: {
      p10: -0.0138,
      p25: -0.0085,
      p50: +0.0006,
      p75: +0.0062,
      p90: +0.0135,
      mean: +0.0000,
      std: +0.0114,
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
      epsSurprise             : { mean:         6.3783, std:        18.3037 },
    },
    weights: {
      priceToLow              : +0.0042,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0135,
      priceToHigh             : +0.0043,
      concernLevel            : +0.0105,
      marketCap               : +0.0053,
      sentimentScore          : +0.0013,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0091,
      toneChangeDelta         : -0.0040,
      epsSurprise             : +0.0115,
    },
    scorePercentiles: {
      p10: -0.0288,
      p25: -0.0142,
      p50: -0.0015,
      p75: +0.0132,
      p90: +0.0250,
      mean: -0.0000,
      std: +0.0228,
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
      epsSurprise             : { mean:         3.1972, std:        17.8946 },
    },
    weights: {
      priceToLow              : -0.0066,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0064,
      priceToHigh             : -0.0071,
      concernLevel            : +0.0027,
      marketCap               : +0.0004,
      sentimentScore          : -0.0001,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0025,
      toneChangeDelta         : +0.0012,
      epsSurprise             : +0.0128,
    },
    scorePercentiles: {
      p10: -0.0227,
      p25: -0.0075,
      p50: +0.0019,
      p75: +0.0093,
      p90: +0.0195,
      mean: -0.0000,
      std: +0.0198,
    },
    sampleCount: 75,
  },
  'Communication Services:large': {
    featureStats: {
      priceToLow              : { mean:         1.3483, std:         0.2973 },
      majorDowngrades         : { mean:         0.0597, std:         0.2387 },
      analystUpsidePotential  : { mean:        43.3550, std:        69.6911 },
      priceToHigh             : { mean:         0.8505, std:         0.1377 },
      concernLevel            : { mean:         5.2985, std:         0.6995 },
      marketCap               : { mean:     5.3589e+10, std:     4.9177e+10 },
      sentimentScore          : { mean:         0.0918, std:         0.1731 },
      upgradesLast30d         : { mean:         0.1194, std:         0.3702 },
      filingTypeFactor        : { mean:         0.7463, std:         0.4384 },
      toneChangeDelta         : { mean:         0.0045, std:         0.2449 },
      epsSurprise             : { mean:         4.8437, std:        17.3276 },
    },
    weights: {
      priceToLow              : +0.0046,
      majorDowngrades         : -0.0033,
      analystUpsidePotential  : +0.0050,
      priceToHigh             : -0.0051,
      concernLevel            : +0.0018,
      marketCap               : -0.0003,
      sentimentScore          : +0.0044,
      upgradesLast30d         : +0.0070,
      filingTypeFactor        : +0.0019,
      toneChangeDelta         : -0.0039,
      epsSurprise             : -0.0005,
    },
    scorePercentiles: {
      p10: -0.0121,
      p25: -0.0087,
      p50: -0.0031,
      p75: +0.0031,
      p90: +0.0183,
      mean: +0.0000,
      std: +0.0133,
    },
    sampleCount: 67,
  },
  'Consumer Staples:mega': {
    featureStats: {
      priceToLow              : { mean:         1.2651, std:         0.2108 },
      majorDowngrades         : { mean:         0.0566, std:         0.2333 },
      analystUpsidePotential  : { mean:        29.0539, std:        29.8771 },
      priceToHigh             : { mean:         0.8984, std:         0.1072 },
      concernLevel            : { mean:         5.1340, std:         0.8537 },
      marketCap               : { mean:     4.4153e+11, std:     2.6109e+11 },
      sentimentScore          : { mean:         0.0991, std:         0.1836 },
      upgradesLast30d         : { mean:         0.0189, std:         0.1374 },
      filingTypeFactor        : { mean:         0.7358, std:         0.4451 },
      toneChangeDelta         : { mean:        -0.0028, std:         0.1962 },
      epsSurprise             : { mean:         2.8066, std:         9.4758 },
    },
    weights: {
      priceToLow              : +0.0025,
      majorDowngrades         : -0.0022,
      analystUpsidePotential  : +0.0043,
      priceToHigh             : +0.0040,
      concernLevel            : -0.0027,
      marketCap               : -0.0029,
      sentimentScore          : +0.0009,
      upgradesLast30d         : +0.0029,
      filingTypeFactor        : -0.0019,
      toneChangeDelta         : -0.0022,
      epsSurprise             : -0.0053,
    },
    scorePercentiles: {
      p10: -0.0083,
      p25: -0.0048,
      p50: +0.0007,
      p75: +0.0069,
      p90: +0.0135,
      mean: +0.0000,
      std: +0.0131,
    },
    sampleCount: 53,
  },
  'Healthcare:mid': {
    featureStats: {
      priceToLow              : { mean:         1.2881, std:         0.2647 },
      majorDowngrades         : { mean:         0.0400, std:         0.1979 },
      analystUpsidePotential  : { mean:        -8.7936, std:        31.4020 },
      priceToHigh             : { mean:         0.7354, std:         0.1503 },
      concernLevel            : { mean:         5.7080, std:         0.9075 },
      marketCap               : { mean:      7.2789e+9, std:      2.3601e+9 },
      sentimentScore          : { mean:         0.1200, std:         0.2010 },
      upgradesLast30d         : { mean:         0.0600, std:         0.2399 },
      filingTypeFactor        : { mean:         0.7000, std:         0.4629 },
      toneChangeDelta         : { mean:        -0.0240, std:         0.1642 },
      epsSurprise             : { mean:         1.5812, std:        14.9546 },
    },
    weights: {
      priceToLow              : +0.0018,
      majorDowngrades         : -0.0002,
      analystUpsidePotential  : +0.0093,
      priceToHigh             : -0.0020,
      concernLevel            : +0.0029,
      marketCap               : +0.0071,
      sentimentScore          : +0.0039,
      upgradesLast30d         : -0.0022,
      filingTypeFactor        : -0.0110,
      toneChangeDelta         : +0.0020,
      epsSurprise             : +0.0092,
    },
    scorePercentiles: {
      p10: -0.0274,
      p25: -0.0134,
      p50: +0.0010,
      p75: +0.0186,
      p90: +0.0253,
      mean: -0.0000,
      std: +0.0210,
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
      epsSurprise             : { mean:        -1.2068, std:        18.8774 },
    },
    weights: {
      priceToLow              : -0.0058,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0107,
      priceToHigh             : +0.0038,
      concernLevel            : -0.0052,
      marketCap               : +0.0038,
      sentimentScore          : +0.0034,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0021,
      toneChangeDelta         : -0.0083,
      epsSurprise             : +0.0088,
    },
    scorePercentiles: {
      p10: -0.0217,
      p25: -0.0124,
      p50: -0.0006,
      p75: +0.0117,
      p90: +0.0225,
      mean: +0.0000,
      std: +0.0167,
    },
    sampleCount: 50,
  },
  'Technology:mid': {
    featureStats: {
      priceToLow              : { mean:         1.2634, std:         0.1847 },
      majorDowngrades         : { mean:         0.1220, std:         0.3997 },
      analystUpsidePotential  : { mean:         4.8386, std:        47.5340 },
      priceToHigh             : { mean:         0.6703, std:         0.1551 },
      concernLevel            : { mean:         5.3732, std:         0.8149 },
      marketCap               : { mean:      5.7102e+9, std:      2.2571e+9 },
      sentimentScore          : { mean:         0.1500, std:         0.2095 },
      upgradesLast30d         : { mean:         0.2439, std:         0.7342 },
      filingTypeFactor        : { mean:         0.7805, std:         0.4191 },
      toneChangeDelta         : { mean:         0.0073, std:         0.2486 },
      epsSurprise             : { mean:         8.8734, std:        15.1791 },
    },
    weights: {
      priceToLow              : +0.0031,
      majorDowngrades         : -0.0066,
      analystUpsidePotential  : +0.0048,
      priceToHigh             : -0.0064,
      concernLevel            : +0.0093,
      marketCap               : +0.0006,
      sentimentScore          : +0.0005,
      upgradesLast30d         : -0.0047,
      filingTypeFactor        : -0.0016,
      toneChangeDelta         : +0.0013,
      epsSurprise             : -0.0008,
    },
    scorePercentiles: {
      p10: -0.0153,
      p25: -0.0087,
      p50: +0.0002,
      p75: +0.0073,
      p90: +0.0156,
      mean: +0.0000,
      std: +0.0120,
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
      epsSurprise             : { mean:        -1.7937, std:        25.4901 },
    },
    weights: {
      priceToLow              : -0.0022,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0194,
      priceToHigh             : -0.0125,
      concernLevel            : +0.0116,
      marketCap               : -0.0049,
      sentimentScore          : -0.0016,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : +0.0008,
      toneChangeDelta         : +0.0013,
      epsSurprise             : +0.0085,
    },
    scorePercentiles: {
      p10: -0.0370,
      p25: -0.0268,
      p50: -0.0099,
      p75: +0.0228,
      p90: +0.0461,
      mean: -0.0000,
      std: +0.0368,
    },
    sampleCount: 38,
  },
  'Consumer Discretionary:mega': {
    featureStats: {
      priceToLow              : { mean:         1.4440, std:         0.3855 },
      majorDowngrades         : { mean:         0.0263, std:         0.1622 },
      analystUpsidePotential  : { mean:        29.2720, std:        35.7782 },
      priceToHigh             : { mean:         0.8207, std:         0.1694 },
      concernLevel            : { mean:         5.4342, std:         0.7412 },
      marketCap               : { mean:     1.0066e+12, std:     7.7266e+11 },
      sentimentScore          : { mean:         0.1263, std:         0.1989 },
      upgradesLast30d         : { mean:         0.1316, std:         0.3426 },
      filingTypeFactor        : { mean:         0.7368, std:         0.4463 },
      toneChangeDelta         : { mean:         0.0079, std:         0.2789 },
      epsSurprise             : { mean:         4.2637, std:        14.8242 },
    },
    weights: {
      priceToLow              : -0.0060,
      majorDowngrades         : -0.0080,
      analystUpsidePotential  : +0.0185,
      priceToHigh             : -0.0078,
      concernLevel            : +0.0018,
      marketCap               : +0.0008,
      sentimentScore          : +0.0049,
      upgradesLast30d         : -0.0024,
      filingTypeFactor        : +0.0047,
      toneChangeDelta         : -0.0010,
      epsSurprise             : -0.0062,
    },
    scorePercentiles: {
      p10: -0.0277,
      p25: -0.0166,
      p50: -0.0046,
      p75: +0.0089,
      p90: +0.0229,
      mean: +0.0000,
      std: +0.0277,
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
      upgradesLast30d         : { mean:         0.0541, std:         0.2292 },
      filingTypeFactor        : { mean:         0.7838, std:         0.4173 },
      toneChangeDelta         : { mean:         0.0162, std:         0.1993 },
      epsSurprise             : { mean:         7.6889, std:        15.3412 },
    },
    weights: {
      priceToLow              : +0.0030,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0087,
      priceToHigh             : -0.0032,
      concernLevel            : -0.0039,
      marketCap               : +0.0005,
      sentimentScore          : -0.0006,
      upgradesLast30d         : -0.0004,
      filingTypeFactor        : +0.0038,
      toneChangeDelta         : -0.0003,
      epsSurprise             : +0.0015,
    },
    scorePercentiles: {
      p10: -0.0172,
      p25: -0.0077,
      p50: +0.0002,
      p75: +0.0061,
      p90: +0.0152,
      mean: -0.0000,
      std: +0.0133,
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
      upgradesLast30d         : { mean:         0.2222, std:         0.4847 },
      filingTypeFactor        : { mean:         0.6944, std:         0.4672 },
      toneChangeDelta         : { mean:        -0.0056, std:         0.2759 },
      epsSurprise             : { mean:         2.1325, std:         4.6083 },
    },
    weights: {
      priceToLow              : +0.0005,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0037,
      priceToHigh             : +0.0049,
      concernLevel            : +0.0063,
      marketCap               : +0.0027,
      sentimentScore          : -0.0012,
      upgradesLast30d         : -0.0026,
      filingTypeFactor        : -0.0074,
      toneChangeDelta         : -0.0044,
      epsSurprise             : +0.0119,
    },
    scorePercentiles: {
      p10: -0.0195,
      p25: -0.0115,
      p50: -0.0019,
      p75: +0.0141,
      p90: +0.0195,
      mean: -0.0000,
      std: +0.0176,
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
      epsSurprise             : { mean:         4.9156, std:        29.1192 },
    },
    weights: {
      priceToLow              : -0.0012,
      majorDowngrades         : +0.0000,
      analystUpsidePotential  : +0.0050,
      priceToHigh             : -0.0010,
      concernLevel            : -0.0074,
      marketCap               : +0.0043,
      sentimentScore          : +0.0002,
      upgradesLast30d         : +0.0000,
      filingTypeFactor        : -0.0127,
      toneChangeDelta         : +0.0019,
      epsSurprise             : +0.0113,
    },
    scorePercentiles: {
      p10: -0.0193,
      p25: -0.0127,
      p50: -0.0043,
      p75: +0.0169,
      p90: +0.0243,
      mean: -0.0000,
      std: +0.0193,
    },
    sampleCount: 34,
  },
  'Financials:mega': {
    featureStats: {
      priceToLow              : { mean:         1.3065, std:         0.2226 },
      majorDowngrades         : { mean:         0.1212, std:         0.3314 },
      analystUpsidePotential  : { mean:        28.5360, std:        18.1674 },
      priceToHigh             : { mean:         0.9054, std:         0.0924 },
      concernLevel            : { mean:         5.0667, std:         0.7619 },
      marketCap               : { mean:     4.6206e+11, std:     1.7796e+11 },
      sentimentScore          : { mean:         0.1348, std:         0.2067 },
      upgradesLast30d         : { mean:         0.1515, std:         0.3641 },
      filingTypeFactor        : { mean:         0.7576, std:         0.4352 },
      toneChangeDelta         : { mean:        -0.0152, std:         0.2757 },
      epsSurprise             : { mean:         1.7967, std:         2.0207 },
    },
    weights: {
      priceToLow              : +0.0005,
      majorDowngrades         : +0.0026,
      analystUpsidePotential  : +0.0046,
      priceToHigh             : +0.0036,
      concernLevel            : -0.0029,
      marketCap               : -0.0016,
      sentimentScore          : +0.0019,
      upgradesLast30d         : +0.0035,
      filingTypeFactor        : +0.0029,
      toneChangeDelta         : +0.0013,
      epsSurprise             : +0.0018,
    },
    scorePercentiles: {
      p10: -0.0138,
      p25: -0.0076,
      p50: +0.0000,
      p75: +0.0048,
      p90: +0.0140,
      mean: -0.0000,
      std: +0.0113,
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
    epsSurprise?: number | null;          // EPS surprise % at most recent earnings; 0 if unknown
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

  // Winsorize EPS surprise to [-50, 50] to dampen extreme outliers; 0 when unknown
  const epsSurprise = filing.epsSurprise != null
    ? Math.max(-50, Math.min(50, filing.epsSurprise))
    : 0;

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
    epsSurprise,
  };
}
