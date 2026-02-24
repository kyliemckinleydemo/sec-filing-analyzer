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
 */
export const TRAINING_MEAN_FEATURES: AlphaFeatures = {
  priceToLow: 1.3978,
  majorDowngrades: 0.1029,
  analystUpsidePotential: 13.518,
  priceToHigh: 0.8588,
  concernLevel: 5.345,
  marketCap: 682_892_847_207,
  sentimentScore: 0.0236,
  upgradesLast30d: 0.1941,
};

/**
 * Bullish features — high priceToLow (momentum), near priceToHigh (strength),
 * major downgrades (contrarian recovery), low concern
 */
export const BULLISH_FEATURES: AlphaFeatures = {
  priceToLow: 2.5,           // Far above 52W low — strong momentum
  majorDowngrades: 2,         // Major bank downgrades → contrarian recovery signal
  analystUpsidePotential: 5,  // Low upside target (not a value trap)
  priceToHigh: 0.98,          // Near 52W high — strength continues
  concernLevel: 2,            // Low AI concern
  marketCap: 2_000_000_000_000, // Large-cap
  sentimentScore: 0.8,        // Positive sentiment
  upgradesLast30d: 0,         // Low upgrades (negligible weight)
};

/**
 * Bearish features — low priceToLow, high analyst upside (value trap),
 * high concern, negative sentiment
 */
export const BEARISH_FEATURES: AlphaFeatures = {
  priceToLow: 1.02,          // Barely above 52W low — weak
  majorDowngrades: 0,         // No contrarian signal
  analystUpsidePotential: 40, // High upside target → value trap
  priceToHigh: 0.65,          // Far from 52W high — weakness
  concernLevel: 9,            // High AI concern
  marketCap: 50_000_000,      // Small-cap (negative size effect)
  sentimentScore: -0.8,       // Negative sentiment
  upgradesLast30d: 3,         // Lots of upgrades (slightly negative weight)
};
