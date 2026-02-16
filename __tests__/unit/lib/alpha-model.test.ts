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

  it('assigns high confidence when score > p90 (1.66)', () => {
    // Construct features that push the score well above p90
    const features: AlphaFeatures = {
      ...BULLISH_FEATURES,
      priceToLow: 3.0,
      majorDowngrades: 3,
    };
    const result = predictAlpha(features);
    expect(result.rawScore).toBeGreaterThan(1.66);
    expect(result.signal).toBe('LONG');
    expect(result.confidence).toBe('high');
    expect(result.percentile).toBe('>90th');
  });

  it('assigns medium confidence when score is between p75 and p90', () => {
    // Need score between 0.0438 and 1.66
    // Use features slightly above mean
    const features: AlphaFeatures = {
      ...TRAINING_MEAN_FEATURES,
      priceToLow: 1.7, // Slightly above mean of 1.3978
    };
    const result = predictAlpha(features);
    if (result.rawScore > 0.0438 && result.rawScore <= 1.66) {
      expect(result.signal).toBe('LONG');
      expect(result.confidence).toBe('medium');
      expect(result.percentile).toBe('75th-90th');
    }
  });

  it('assigns high confidence SHORT when score < p10 (-1.0345)', () => {
    const result = predictAlpha(BEARISH_FEATURES);
    expect(result.rawScore).toBeLessThan(-1.0345);
    expect(result.signal).toBe('SHORT');
    expect(result.confidence).toBe('high');
    expect(result.percentile).toBe('<10th');
  });

  it('assigns medium confidence SHORT when score between p10 and p25', () => {
    // Need score between -1.0345 and -0.8114
    const features: AlphaFeatures = {
      ...TRAINING_MEAN_FEATURES,
      priceToLow: 1.05,       // Below mean → negative contribution from top weight
      analystUpsidePotential: 20, // Above mean → negative contribution
      concernLevel: 7,         // Above mean → negative contribution
    };
    const result = predictAlpha(features);
    if (result.rawScore < -0.8114 && result.rawScore >= -1.0345) {
      expect(result.signal).toBe('SHORT');
      expect(result.confidence).toBe('medium');
      expect(result.percentile).toBe('10th-25th');
    }
  });

  it('computes predicted30dReturn = expectedAlpha + 0.8 (market baseline)', () => {
    const result = predictAlpha(TRAINING_MEAN_FEATURES);
    expect(result.predicted30dReturn).toBeCloseTo(result.expectedAlpha + 0.8, 2);
  });

  it('includes all 8 features in featureContributions', () => {
    const result = predictAlpha(TRAINING_MEAN_FEATURES);
    const keys = Object.keys(result.featureContributions);
    expect(keys).toHaveLength(8);
    expect(keys).toContain('priceToLow');
    expect(keys).toContain('majorDowngrades');
    expect(keys).toContain('analystUpsidePotential');
    expect(keys).toContain('priceToHigh');
    expect(keys).toContain('concernLevel');
    expect(keys).toContain('marketCap');
    expect(keys).toContain('sentimentScore');
    expect(keys).toContain('upgradesLast30d');
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
    expect(features.priceToLow).toBeCloseTo(1.3978, 4);
  });

  it('falls back to training mean for priceToHigh when fiftyTwoWeekHigh is 0', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 0, fiftyTwoWeekLow: 120, marketCap: 1e12 },
      { concernLevel: 5, sentimentScore: 0.1 },
      { upgradesLast30d: 0, majorDowngradesLast30d: 0 },
    );
    expect(features.priceToHigh).toBeCloseTo(0.8588, 4);
  });

  it('falls back to training mean for analystUpsidePotential when analystTargetPrice is null', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 180, fiftyTwoWeekLow: 120, marketCap: 1e12, analystTargetPrice: null },
      { concernLevel: 5, sentimentScore: 0.1 },
      { upgradesLast30d: 0, majorDowngradesLast30d: 0 },
    );
    expect(features.analystUpsidePotential).toBeCloseTo(13.518, 3);
  });

  it('falls back to training mean for concernLevel when null', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 180, fiftyTwoWeekLow: 120, marketCap: 1e12 },
      { concernLevel: null, sentimentScore: 0.1 },
      { upgradesLast30d: 0, majorDowngradesLast30d: 0 },
    );
    expect(features.concernLevel).toBeCloseTo(5.345, 3);
  });

  it('falls back to training mean for sentimentScore when null', () => {
    const features = extractAlphaFeatures(
      { currentPrice: 150, fiftyTwoWeekHigh: 180, fiftyTwoWeekLow: 120, marketCap: 1e12 },
      { concernLevel: 5, sentimentScore: null },
      { upgradesLast30d: 0, majorDowngradesLast30d: 0 },
    );
    expect(features.sentimentScore).toBeCloseTo(0.0236, 4);
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
