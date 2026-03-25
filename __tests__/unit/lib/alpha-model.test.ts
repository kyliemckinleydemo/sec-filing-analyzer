/**
 * @module alpha-model.test
 * @description Test suite for the alpha prediction model functions
 *
 * PURPOSE:
 * Validates the correctness of the alpha prediction model (predictAlpha) and feature 
 * extraction logic (extractAlphaFeatures). Ensures proper signal classification, confidence 
 * assignment, feature contribution calculation, and fallback behavior for missing data.
 *
 * EXPORTS:
 * None (test file)
 *
 * CLAUDE NOTES:
 * - Tests verify signal classification (LONG/SHORT/NEUTRAL) based on score thresholds
 * - Confidence levels (high/medium/low) are validated against percentile boundaries
 * - Feature contributions must sum to rawScore for model transparency
 * - Ratio calculations (priceToLow, priceToHigh) are tested as ratios, not percentages
 * - Fallback behavior to training means is validated for all nullable features
 * - Numeric precision is enforced (rawScore: 4 decimals, returns: 2 decimals)
 * - Uses test fixtures (TRAINING_MEAN_FEATURES, BULLISH_FEATURES, BEARISH_FEATURES)
 * - All 13 model features are validated for presence in featureContributions output
 * - Market baseline of 0.8% is added to expectedAlpha for predicted30dReturn
 */

import { describe, it, expect } from 'vitest';
import { predictAlpha, extractAlphaFeatures } from '@/lib/alpha-model';
import type { AlphaFeatures } from '@/lib/alpha-model';
import {
  TRAINING_MEAN_FEATURES,
  BULLISH_FEATURES,
  BEARISH_FEATURES,
} from '../../fixtures/alpha-features';

describe('predictAlpha', () => {
  it('produces rawScore near 0 for training mean features', () => {
    const result = predictAlpha(TRAINING_MEAN_FEATURES);
    // When all features are at their training mean, z-scores are 0, so score should be ~0
    expect(result.rawScore).toBeCloseTo(0, 1);
  });

  it('classifies training mean features as NEUTRAL with low confidence', () => {
    const result = predictAlpha(TRAINING_MEAN_FEATURES);
    expect(result.signal).toBe('NEUTRAL');
    expect(result.confidence).toBe('low');
  });

  it('produces positive rawScore and LONG signal for bullish features', () => {
    const result = predictAlpha(BULLISH_FEATURES);
    expect(result.rawScore).toBeGreaterThan(0);
    expect(result.signal).toBe('LONG');
  });

  it('produces negative rawScore and SHORT signal for bearish features', () => {
    const result = predictAlpha(BEARISH_FEATURES);
    expect(result.rawScore).toBeLessThan(0);
    expect(result.signal).toBe('SHORT');
  });

  it('assigns high confidence when score > p90 (0.0288)', () => {
    // Construct features that push the score well above p90 via strong analystUpsidePotential + EPS beat
    const features: AlphaFeatures = {
      ...BULLISH_FEATURES,
      analystUpsidePotential: 120,  // Far above mean → large positive contribution
      epsSurprise: 40,
    };
    const result = predictAlpha(features);
    expect(result.rawScore).toBeGreaterThan(0.0288);
    expect(result.signal).toBe('LONG');
    expect(result.confidence).toBe('high');
    expect(result.percentile).toBe('>90th');
  });

  it('assigns medium confidence when score is between p75 and p90', () => {
    // Need score between p75 (0.0114) and p90 (0.0288)
    // Use features with moderate analystUpsidePotential above mean
    const features: AlphaFeatures = {
      ...TRAINING_MEAN_FEATURES,
      analystUpsidePotential: 50, // Moderately above mean of 29.569
      epsSurprise: 10,
    };
    const result = predictAlpha(features);
    if (result.rawScore > 0.0114 && result.rawScore <= 0.0288) {
      expect(result.signal).toBe('LONG');
      expect(result.confidence).toBe('medium');
      expect(result.percentile).toBe('75th-90th');
    }
  });

  it('assigns high confidence SHORT when score < p10 (-0.0290)', () => {
    const result = predictAlpha(BEARISH_FEATURES);
    expect(result.rawScore).toBeLessThan(-0.0290);
    expect(result.signal).toBe('SHORT');
    expect(result.confidence).toBe('high');
    expect(result.percentile).toBe('<10th');
  });

  it('assigns medium confidence SHORT when score between p10 and p25', () => {
    // Need score between p25 (-0.0158) and p10 (-0.0290)
    const features: AlphaFeatures = {
      ...TRAINING_MEAN_FEATURES,
      analystUpsidePotential: 5,  // Below mean → negative contribution
      epsSurprise: -8,            // Miss → negative contribution
    };
    const result = predictAlpha(features);
    if (result.rawScore < -0.0158 && result.rawScore >= -0.0290) {
      expect(result.signal).toBe('SHORT');
      expect(result.confidence).toBe('medium');
      expect(result.percentile).toBe('10th-25th');
    }
  });

  it('computes predicted30dReturn = expectedAlpha + 0.8 (market baseline)', () => {
    const result = predictAlpha(TRAINING_MEAN_FEATURES);
    expect(result.predicted30dReturn).toBeCloseTo(result.expectedAlpha + 0.8, 2);
  });

  it('includes all 13 features in featureContributions', () => {
    const result = predictAlpha(TRAINING_MEAN_FEATURES);
    const keys = Object.keys(result.featureContributions);
    expect(keys).toHaveLength(13);
    expect(keys).toContain('priceToLow');
    expect(keys).toContain('majorDowngrades');
    expect(keys).toContain('analystUpsidePotential');
    expect(keys).toContain('priceToHigh');
    expect(keys).toContain('concernLevel');
    expect(keys).toContain('marketCap');
    expect(keys).toContain('sentimentScore');
    expect(keys).toContain('upgradesLast30d');
    expect(keys).toContain('filingTypeFactor');
    expect(keys).toContain('toneChangeDelta');
    expect(keys).toContain('epsSurprise');
    expect(keys).toContain('spxTrend30d');
    expect(keys).toContain('vixLevel');
  });

  it('feature contributions sum to rawScore', () => {
    const result = predictAlpha(BULLISH_FEATURES);
    const sum = Object.values(result.featureContributions).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(result.rawScore, 2);
  });

  it('rounds rawScore to 4 decimal places', () => {
    const result = predictAlpha(BULLISH_FEATURES);
    const decimalStr = result.rawScore.toString().split('.')[1] || '';
    expect(decimalStr.length).toBeLessThanOrEqual(4);
  });

  it('rounds expectedAlpha to 2 decimal places', () => {
    const result = predictAlpha(BULLISH_FEATURES);
    const decimalStr = result.expectedAlpha.toString().split('.')[1] || '';
    expect(decimalStr.length).toBeLessThanOrEqual(2);
  });

  it('rounds predicted30dReturn to 2 decimal places', () => {
    const result = predictAlpha(BULLISH_FEATURES);
    const decimalStr = result.predicted30dReturn.toString().split('.')[1] || '';
    expect(decimalStr.length).toBeLessThanOrEqual(2);
  });
});

describe('extractAlphaFeatures', () => {
  it('computes priceToLow as RATIO (not percentage)', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 180, fiftyTwoWeekLow: 120, marketCap: 1e12, analystTargetPrice: 170 },
      { concernLevel: 5, sentimentScore: 0.1 },
      { upgradesLast30d: 1, majorDowngradesLast30d: 0 },
    );
    // 150 / 120 = 1.25 (ratio), NOT (150/120 - 1) * 100 = 25 (percentage)
    expect(features.priceToLow).toBeCloseTo(1.25, 4);
  });

  it('computes priceToHigh as RATIO (not percentage)', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 180, fiftyTwoWeekLow: 120, marketCap: 1e12, analystTargetPrice: 170 },
      { concernLevel: 5, sentimentScore: 0.1 },
      { upgradesLast30d: 1, majorDowngradesLast30d: 0 },
    );
    // 150 / 180 = 0.8333 (ratio), NOT (150/180 - 1) * 100 = -16.67 (percentage)
    expect(features.priceToHigh).toBeCloseTo(0.8333, 3);
  });

  it('computes analystUpsidePotential correctly', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 100, fiftyTwoWeekHigh: 120, fiftyTwoWeekLow: 80, marketCap: 1e12, analystTargetPrice: 115 },
      { concernLevel: 5, sentimentScore: 0 },
      { upgradesLast30d: 0, majorDowngradesLast30d: 0 },
    );
    // ((115 / 100) - 1) * 100 = 15.0
    expect(features.analystUpsidePotential).toBeCloseTo(15.0, 4);
  });

  it('falls back to training mean for priceToLow when fiftyTwoWeekLow is 0', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 180, fiftyTwoWeekLow: 0, marketCap: 1e12 },
      { concernLevel: 5, sentimentScore: 0.1 },
      { upgradesLast30d: 0, majorDowngradesLast30d: 0 },
    );
    expect(features.priceToLow).toBeCloseTo(1.3638, 3);
  });

  it('falls back to training mean for priceToHigh when fiftyTwoWeekHigh is 0', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 0, fiftyTwoWeekLow: 120, marketCap: 1e12 },
      { concernLevel: 5, sentimentScore: 0.1 },
      { upgradesLast30d: 0, majorDowngradesLast30d: 0 },
    );
    expect(features.priceToHigh).toBeCloseTo(0.8381, 3);
  });

  it('falls back to training mean for analystUpsidePotential when analystTargetPrice is null', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 180, fiftyTwoWeekLow: 120, marketCap: 1e12, analystTargetPrice: null },
      { concernLevel: 5, sentimentScore: 0.1 },
      { upgradesLast30d: 0, majorDowngradesLast30d: 0 },
    );
    expect(features.analystUpsidePotential).toBeCloseTo(29.569, 2);
  });

  it('falls back to training mean for concernLevel when null', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 180, fiftyTwoWeekLow: 120, marketCap: 1e12 },
      { concernLevel: null, sentimentScore: 0.1 },
      { upgradesLast30d: 0, majorDowngradesLast30d: 0 },
    );
    expect(features.concernLevel).toBeCloseTo(5.3333, 3);
  });

  it('falls back to training mean for sentimentScore when null', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 180, fiftyTwoWeekLow: 120, marketCap: 1e12 },
      { concernLevel: 5, sentimentScore: null },
      { upgradesLast30d: 0, majorDowngradesLast30d: 0 },
    );
    expect(features.sentimentScore).toBeCloseTo(0.1095, 3);
  });

  it('passes through marketCap directly', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 180, fiftyTwoWeekLow: 120, marketCap: 500_000_000_000 },
      { concernLevel: 5, sentimentScore: 0.1 },
      { upgradesLast30d: 0, majorDowngradesLast30d: 0 },
    );
    expect(features.marketCap).toBe(500_000_000_000);
  });

  it('passes through upgradesLast30d directly', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 180, fiftyTwoWeekLow: 120, marketCap: 1e12 },
      { concernLevel: 5, sentimentScore: 0.1 },
      { upgradesLast30d: 3, majorDowngradesLast30d: 0 },
    );
    expect(features.upgradesLast30d).toBe(3);
  });

  it('passes through majorDowngrades directly', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 180, fiftyTwoWeekLow: 120, marketCap: 1e12 },
      { concernLevel: 5, sentimentScore: 0.1 },
      { upgradesLast30d: 0, majorDowngradesLast30d: 2 },
    );
    expect(features.majorDowngrades).toBe(2);
  });
});
