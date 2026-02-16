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
