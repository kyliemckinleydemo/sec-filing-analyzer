/**
 * @module __tests__/fixtures/alpha-features
 * @description Provides three pre-configured test fixtures representing neutral, bullish, and bearish market scenarios for alpha model validation and testing
 *
 * PURPOSE:
 * - Supply TRAINING_MEAN_FEATURES with average values to produce neutral (rawScore ~0) classification for baseline testing
 * - Define BULLISH_FEATURES with high momentum indicators (priceToLow 2.5, priceToHigh 0.98) and contrarian signals (2 major downgrades) for positive alpha scenarios
 * - Define BEARISH_FEATURES with weak momentum (priceToLow 1.02), value trap signals (40% upside potential), and high concern (level 9) for negative alpha scenarios
 *
 * DEPENDENCIES:
 * - @/lib/alpha-model - Imports AlphaFeatures type defining the 8-field structure (priceToLow, majorDowngrades, analystUpsidePotential, priceToHigh, concernLevel, marketCap, sentimentScore, upgradesLast30d)
 *
 * EXPORTS:
 * - TRAINING_MEAN_FEATURES (const) - AlphaFeatures object with mean values from training data producing neutral signal (rawScore ~0)
 * - BULLISH_FEATURES (const) - AlphaFeatures object with strong momentum (2.5x 52W low, 0.98x 52W high) and contrarian recovery signals (2 major downgrades)
 * - BEARISH_FEATURES (const) - AlphaFeatures object with weak momentum (1.02x 52W low), value trap indicator (40% upside), and high concern (level 9)
 *
 * PATTERNS:
 * - Import fixtures in alpha model tests: import { TRAINING_MEAN_FEATURES, BULLISH_FEATURES } from '@tests/fixtures/alpha-features'
 * - Pass to alpha model scoring function to validate expected signal classifications: expect(scoreFeatures(BULLISH_FEATURES).signal).toBe('BUY')
 * - Use TRAINING_MEAN_FEATURES as baseline control to verify model produces neutral signals for average market conditions
 *
 * CLAUDE NOTES:
 * - Bullish fixture uses contrarian logic where majorDowngrades=2 indicates banks downgraded but creates recovery opportunity (not bearish signal)
 * - Bearish fixture's analystUpsidePotential=40 represents value trap - high analyst targets when stock is weak often precede further decline
 * - Training mean marketCap of ~$683B and bullish $2T vs bearish $50M suggests model incorporates size premium favoring large-caps
 * - All three fixtures use realistic value ranges (priceToLow 1.02-2.5, sentimentScore -0.8 to 0.8) matching production data distributions
 */
import type { AlphaFeatures } from '@/lib/alpha-model';

/**
 * Training mean features — should produce rawScore ~0, NEUTRAL signal
 * Values are exact global training means from FEATURE_STATS in lib/alpha-model.ts (v2, 4009 samples)
 */
export const TRAINING_MEAN_FEATURES: AlphaFeatures = {
  priceToLow: 1.3638,
  majorDowngrades: 0.0409,
  analystUpsidePotential: 29.569,
  priceToHigh: 0.8381,
  concernLevel: 5.3333,
  marketCap: 98_179_000_000,
  sentimentScore: 0.1095,
  upgradesLast30d: 0.1130,
  filingTypeFactor: 0.7378,
  toneChangeDelta: -0.0113,
  epsSurprise: 3.8894,
  spxTrend30d: 1.8286,
  vixLevel: 18.1503,
};

/**
 * Bullish features — v2 global model signal drivers:
 * high analystUpsidePotential (+0.0239 weight), strong EPS beat (+0.0104),
 * high concernLevel (+0.0050), elevated VIX (+0.0058), bull market (+0.0100)
 */
export const BULLISH_FEATURES: AlphaFeatures = {
  priceToLow: 1.0,              // Below mean (negative weight → positive contribution)
  majorDowngrades: 0,
  analystUpsidePotential: 80,   // High upside target (positive weight in v2)
  priceToHigh: 0.70,            // Below mean
  concernLevel: 8,              // High concern (positive weight in v2)
  marketCap: 100_000_000_000,
  sentimentScore: 0.8,          // Positive sentiment
  upgradesLast30d: 0,
  filingTypeFactor: 0.5,        // 10-Q
  toneChangeDelta: 0.2,         // Improving tone vs prior filing
  epsSurprise: 25,              // Strong EPS beat
  spxTrend30d: 4.0,             // Market in uptrend
  vixLevel: 25,                 // Elevated fear
};

/**
 * Bearish features — v2 global model signal drivers:
 * low analystUpsidePotential (+0.0239 weight → negative contribution), big EPS miss (+0.0104),
 * low concernLevel (+0.0050 → negative contribution), bear market (+0.0100), low VIX (+0.0058)
 */
export const BEARISH_FEATURES: AlphaFeatures = {
  priceToLow: 2.5,              // Above mean (negative weight → negative contribution)
  majorDowngrades: 0,
  analystUpsidePotential: 5,    // Low upside target (positive weight → negative contribution)
  priceToHigh: 0.98,            // Above mean
  concernLevel: 2,              // Low concern (positive weight → negative contribution)
  marketCap: 50_000_000,
  sentimentScore: -0.5,         // Negative sentiment
  upgradesLast30d: 0,
  filingTypeFactor: 0.5,        // 10-Q
  toneChangeDelta: -0.2,        // Worsening tone vs prior filing
  epsSurprise: -40,             // Large EPS miss
  spxTrend30d: -4.0,            // Market in drawdown
  vixLevel: 14,                 // Low fear (positive weight → negative contribution)
};
