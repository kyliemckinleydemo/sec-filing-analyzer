/**
 * @module lib/baseline-features
 * @description Extracts 6 standardized features from earnings data (actual vs. estimated EPS) to feed into production baseline prediction model
 *
 * PURPOSE:
 * - Calculate EPS surprise percentage using formula: ((actual - estimated) / |estimated|) * 100
 * - Generate binary indicators for beats/misses at 2% and 10% thresholds
 * - Validate earnings data contains non-null, non-NaN actualEPS and estimatedEPS values
 * - Format extracted features as human-readable strings with percentage notation
 *
 * EXPORTS:
 * - BaselineFeatures (interface) - Shape with epsSurprise, surpriseMagnitude, and 4 binary flags (epsBeat, epsMiss, largeBeat, largeMiss)
 * - EarningsData (interface) - Input shape requiring actualEPS and estimatedEPS numbers
 * - extractBaselineFeatures (function) - Converts EarningsData into complete BaselineFeatures object
 * - validateEarningsData (function) - Type guard checking if partial earnings data is valid and complete
 * - formatFeatures (function) - Returns multi-line string with percentages and Yes/No for binary flags
 * - interpretFeatures (function) - Returns single-line natural language summary of earnings outcome
 *
 * PATTERNS:
 * - Call validateEarningsData() before extractBaselineFeatures() to ensure data integrity
 * - Use extractBaselineFeatures({ actualEPS: 2.50, estimatedEPS: 2.30 }) to get all 6 features at once
 * - Pass extracted features to formatFeatures() for logging or interpretFeatures() for user-facing messages
 * - EPS surprise values are capped between -1000% and 1000% to prevent infinity from zero estimates
 *
 * CLAUDE NOTES:
 * - Binary thresholds are hardcoded: 2% separates beat/miss, 10% separates large events
 * - Zero estimated EPS is handled specially by treating actualEPS * 100 as the surprise percentage
 * - interpretFeatures() returns hierarchical interpretation checking large events before small ones
 * - All 6 features match exact requirements of production baseline model - modification breaks compatibility
 */
/**
 * Baseline Model Feature Extraction
 *
 * Extracts the 6 features required by the production baseline model:
 * 1. epsSurprise - Raw EPS surprise percentage
 * 2. surpriseMagnitude - Absolute value of surprise
 * 3. epsBeat - Binary: surprise > 2%
 * 4. epsMiss - Binary: surprise < -2%
 * 5. largeBeat - Binary: surprise > 10%
 * 6. largeMiss - Binary: surprise < -10%
 */

export interface BaselineFeatures {
  epsSurprise: number;
  surpriseMagnitude: number;
  epsBeat: number;
  epsMiss: number;
  largeBeat: number;
  largeMiss: number;
}

export interface EarningsData {
  actualEPS: number;
  estimatedEPS: number;
}

/**
 * Calculate EPS surprise percentage
 * Formula: ((actual - estimated) / |estimated|) * 100
 */
function calculateEpsSurprise(actualEPS: number, estimatedEPS: number): number {
  // Handle edge cases
  if (estimatedEPS === 0) {
    // If estimate is 0, use actual as surprise
    return actualEPS * 100;
  }

  const surprise = ((actualEPS - estimatedEPS) / Math.abs(estimatedEPS)) * 100;

  // Cap extreme values (avoid infinite surprises)
  return Math.max(-1000, Math.min(1000, surprise));
}

/**
 * Extract all baseline features from earnings data
 */
export function extractBaselineFeatures(earnings: EarningsData): BaselineFeatures {
  const { actualEPS, estimatedEPS } = earnings;

  // Calculate raw surprise
  const epsSurprise = calculateEpsSurprise(actualEPS, estimatedEPS);

  // Calculate magnitude (absolute value)
  const surpriseMagnitude = Math.abs(epsSurprise);

  // Calculate binary features
  const epsBeat = epsSurprise > 2 ? 1 : 0;
  const epsMiss = epsSurprise < -2 ? 1 : 0;
  const largeBeat = epsSurprise > 10 ? 1 : 0;
  const largeMiss = epsSurprise < -10 ? 1 : 0;

  return {
    epsSurprise,
    surpriseMagnitude,
    epsBeat,
    epsMiss,
    largeBeat,
    largeMiss
  };
}

/**
 * Validate that earnings data is present and valid
 */
export function validateEarningsData(earnings: Partial<EarningsData>): earnings is EarningsData {
  if (earnings.actualEPS === undefined || earnings.actualEPS === null) {
    return false;
  }
  if (earnings.estimatedEPS === undefined || earnings.estimatedEPS === null) {
    return false;
  }
  if (isNaN(earnings.actualEPS) || isNaN(earnings.estimatedEPS)) {
    return false;
  }
  return true;
}

/**
 * Format features for display
 */
export function formatFeatures(features: BaselineFeatures): string {
  return `
EPS Surprise: ${features.epsSurprise.toFixed(1)}%
Magnitude: ${features.surpriseMagnitude.toFixed(1)}%
Beat: ${features.epsBeat ? 'Yes' : 'No'}
Miss: ${features.epsMiss ? 'Yes' : 'No'}
Large Beat: ${features.largeBeat ? 'Yes' : 'No'}
Large Miss: ${features.largeMiss ? 'Yes' : 'No'}
  `.trim();
}

/**
 * Get human-readable interpretation of features
 */
export function interpretFeatures(features: BaselineFeatures): string {
  if (features.largeMiss) {
    return "Large earnings miss (<-10%) - Strong bearish signal";
  }
  if (features.largeBeat) {
    return "Large earnings beat (>10%) - Moderate bullish signal";
  }
  if (features.epsMiss) {
    return "Earnings miss (<-2%) - Slightly negative";
  }
  if (features.epsBeat) {
    return "Earnings beat (>2%) - Slightly positive";
  }
  return "Earnings in-line (within 2% of estimate)";
}
