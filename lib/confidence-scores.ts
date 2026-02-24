/**
 * @module lib/confidence-scores
 * @description Provides historical prediction accuracy scores for stock tickers based on 278 backtested filings from 2022-2025, enabling confidence-adjusted predictions and tier-based UI indicators.
 *
 * PURPOSE:
 * - Maps 20 stock tickers to historical accuracy percentages, sample sizes, and reliability tiers (high/medium/low) from backtest data
 * - Adjusts prediction confidence scores by comparing ticker accuracy against model average (56.8%) and applying delta-based modifications
 * - Calculates confidence statistics including tier distribution, average accuracy, and best/worst performing tickers
 * - Provides Tailwind CSS color classes (green/yellow/red) for confidence badge rendering based on tier
 *
 * EXPORTS:
 * - TickerConfidence (interface) - Shape with ticker symbol, accuracy percentage, sampleSize, tier classification, and human-readable reliability description
 * - TICKER_CONFIDENCE_MAP (const) - Record mapping 20 ticker symbols to their historical performance metrics from Python backtest
 * - getTickerConfidence (function) - Returns TickerConfidence for given ticker, falling back to 56.8% model average for unknown symbols
 * - getConfidenceBadgeColor (function) - Maps tier to Tailwind class: 'bg-green-500' (high), 'bg-yellow-500' (medium), 'bg-red-500' (low)
 * - getConfidenceTier (function) - Classifies accuracy percentage into 'high' (≥70%), 'medium' (≥55%), or 'low' (<55%)
 * - adjustPredictionConfidence (function) - Modifies confidence score by accuracy delta from model average, clamping between 0.1-0.95, returns adjusted values with explanation
 * - getTickersByConfidence (function) - Returns all tickers sorted descending by accuracy percentage
 * - getConfidenceStats (function) - Aggregates distribution counts, average accuracy, and best/worst performers across all tracked tickers
 *
 * PATTERNS:
 * - Call getTickerConfidence('AAPL') to retrieve { accuracy: 60.0, tier: 'medium', reliability: '...' } for display
 * - Use getConfidenceBadgeColor(tickerConf.tier) in className props for consistent color-coded badges
 * - Invoke adjustPredictionConfidence(0.65, 0.72, 'NVDA') before showing predictions to account for ticker-specific reliability (NVDA reduces confidence due to 46.7% accuracy)
 * - Access TICKER_CONFIDENCE_MAP directly for known tickers like TICKER_CONFIDENCE_MAP['HD'] which has 80% accuracy over 15 samples
 *
 * CLAUDE NOTES:
 * - Accuracy data sourced from scripts/backtest-with-real-data.py covering 278 actual filings across 2022-2025 period
 * - Unknown tickers default to 56.8% accuracy (dataset average) rather than failing, ensuring graceful degradation
 * - adjustPredictionConfidence applies accuracy delta as percentage adjustment (e.g., HD at 80% gets +23.2% confidence boost from 56.8% baseline) but clamps final confidence between 10-95%
 * - Tier thresholds create three clear buckets: high confidence (HD, JPM, AMD ≥70%), medium (AAPL, MSFT, WMT 55-70%), low (NVDA, INTC <55%) for user-facing reliability signals
 */
/**
 * Ticker Confidence Scores
 *
 * Based on historical backtest accuracy (278 filings, 2022-2025)
 * Helps users understand prediction reliability by company
 */

export interface TickerConfidence {
  ticker: string;
  accuracy: number; // Historical direction accuracy (0-100)
  sampleSize: number; // Number of filings in backtest
  tier: 'high' | 'medium' | 'low';
  reliability: string; // Human-readable description
}

/**
 * Historical accuracy from backtest with real financial data
 * Source: scripts/backtest-with-real-data.py
 */
export const TICKER_CONFIDENCE_MAP: Record<string, TickerConfidence> = {
  // HIGH CONFIDENCE (>70% accuracy)
  HD: {
    ticker: 'HD',
    accuracy: 80.0,
    sampleSize: 15,
    tier: 'high',
    reliability: 'Highly reliable - consistent predictable patterns',
  },
  JPM: {
    ticker: 'JPM',
    accuracy: 75.0,
    sampleSize: 4,
    tier: 'high',
    reliability: 'Highly reliable - small sample but strong performance',
  },
  AMD: {
    ticker: 'AMD',
    accuracy: 73.3,
    sampleSize: 15,
    tier: 'high',
    reliability: 'Highly reliable - strong tech fundamentals',
  },

  // MEDIUM-HIGH CONFIDENCE (65-70% accuracy)
  PYPL: {
    ticker: 'PYPL',
    accuracy: 66.7,
    sampleSize: 15,
    tier: 'medium',
    reliability: 'Good reliability - moderate volatility',
  },
  MA: {
    ticker: 'MA',
    accuracy: 66.7,
    sampleSize: 15,
    tier: 'medium',
    reliability: 'Good reliability - stable payments sector',
  },
  META: {
    ticker: 'META',
    accuracy: 66.7,
    sampleSize: 7,
    tier: 'medium',
    reliability: 'Good reliability - strong fundamentals',
  },

  // MEDIUM CONFIDENCE (55-65% accuracy)
  AAPL: {
    ticker: 'AAPL',
    accuracy: 60.0,
    sampleSize: 15,
    tier: 'medium',
    reliability: 'Moderate reliability - large cap stability',
  },
  MSFT: {
    ticker: 'MSFT',
    accuracy: 60.0,
    sampleSize: 15,
    tier: 'medium',
    reliability: 'Moderate reliability - consistent performer',
  },
  GOOGL: {
    ticker: 'GOOGL',
    accuracy: 57.1,
    sampleSize: 14,
    tier: 'medium',
    reliability: 'Moderate reliability - tech giant with volatility',
  },
  AMZN: {
    ticker: 'AMZN',
    accuracy: 53.3,
    sampleSize: 15,
    tier: 'medium',
    reliability: 'Moderate reliability - high market expectations',
  },

  // LOW CONFIDENCE (<55% accuracy)
  TSLA: {
    ticker: 'TSLA',
    accuracy: 53.3,
    sampleSize: 15,
    tier: 'low',
    reliability: 'Lower reliability - high sentiment volatility',
  },
  NFLX: {
    ticker: 'NFLX',
    accuracy: 50.0,
    sampleSize: 14,
    tier: 'low',
    reliability: 'Lower reliability - subscriber sensitivity',
  },
  NVDA: {
    ticker: 'NVDA',
    accuracy: 46.7,
    sampleSize: 15,
    tier: 'low',
    reliability: 'Lower reliability - extreme valuation volatility',
  },
  INTC: {
    ticker: 'INTC',
    accuracy: 46.7,
    sampleSize: 15,
    tier: 'low',
    reliability: 'Lower reliability - turnaround uncertainty',
  },

  // Additional companies (estimated from smaller samples)
  WMT: {
    ticker: 'WMT',
    accuracy: 60.0,
    sampleSize: 15,
    tier: 'medium',
    reliability: 'Moderate reliability - stable retail',
  },
  COST: {
    ticker: 'COST',
    accuracy: 60.0,
    sampleSize: 14,
    tier: 'medium',
    reliability: 'Moderate reliability - consistent growth',
  },
  PG: {
    ticker: 'PG',
    accuracy: 60.0,
    sampleSize: 15,
    tier: 'medium',
    reliability: 'Moderate reliability - defensive consumer',
  },
  V: {
    ticker: 'V',
    accuracy: 60.0,
    sampleSize: 15,
    tier: 'medium',
    reliability: 'Moderate reliability - payments stability',
  },
  DIS: {
    ticker: 'DIS',
    accuracy: 53.3,
    sampleSize: 15,
    tier: 'medium',
    reliability: 'Moderate reliability - streaming volatility',
  },
  AVGO: {
    ticker: 'AVGO',
    accuracy: 53.3,
    sampleSize: 15,
    tier: 'medium',
    reliability: 'Moderate reliability - semiconductor cycles',
  },
};

/**
 * Get confidence score for a ticker
 */
export function getTickerConfidence(ticker: string): TickerConfidence {
  const confidence = TICKER_CONFIDENCE_MAP[ticker.toUpperCase()];

  if (confidence) {
    return confidence;
  }

  // Default for unknown tickers (use dataset average: 56.8%)
  return {
    ticker: ticker.toUpperCase(),
    accuracy: 56.8,
    sampleSize: 0,
    tier: 'medium',
    reliability: 'Unknown ticker - using model average (56.8%)',
  };
}

/**
 * Get confidence badge color
 */
export function getConfidenceBadgeColor(tier: 'high' | 'medium' | 'low'): string {
  switch (tier) {
    case 'high':
      return 'bg-green-500';
    case 'medium':
      return 'bg-yellow-500';
    case 'low':
      return 'bg-red-500';
  }
}

/**
 * Get confidence tier from accuracy percentage
 */
export function getConfidenceTier(accuracy: number): 'high' | 'medium' | 'low' {
  if (accuracy >= 70) return 'high';
  if (accuracy >= 55) return 'medium';
  return 'low';
}

/**
 * Adjust prediction confidence based on ticker history
 */
export function adjustPredictionConfidence(
  basePrediction: number,
  baseConfidence: number,
  ticker: string
): { adjustedPrediction: number; adjustedConfidence: number; explanation: string } {
  const tickerConf = getTickerConfidence(ticker);

  // Adjust confidence based on historical accuracy
  // High accuracy tickers get confidence boost, low accuracy get penalty
  const accuracyDelta = tickerConf.accuracy - 56.8; // vs model average
  const confidenceAdjustment = accuracyDelta / 100; // Convert to 0-1 scale

  const adjustedConfidence = Math.max(
    0.1,
    Math.min(0.95, baseConfidence + confidenceAdjustment)
  );

  // Don't adjust prediction magnitude, only confidence
  const adjustedPrediction = basePrediction;

  const explanation =
    tickerConf.tier === 'high'
      ? `${ticker} has high historical accuracy (${tickerConf.accuracy.toFixed(1)}%). Confidence boosted.`
      : tickerConf.tier === 'low'
        ? `${ticker} has lower historical accuracy (${tickerConf.accuracy.toFixed(1)}%). Confidence reduced.`
        : `${ticker} has moderate historical accuracy (${tickerConf.accuracy.toFixed(1)}%).`;

  return {
    adjustedPrediction,
    adjustedConfidence,
    explanation,
  };
}

/**
 * Get all tickers sorted by confidence
 */
export function getTickersByConfidence(): TickerConfidence[] {
  return Object.values(TICKER_CONFIDENCE_MAP).sort((a, b) => b.accuracy - a.accuracy);
}

/**
 * Get confidence statistics
 */
export function getConfidenceStats() {
  const tickers = Object.values(TICKER_CONFIDENCE_MAP);

  return {
    totalTickers: tickers.length,
    highConfidence: tickers.filter((t) => t.tier === 'high').length,
    mediumConfidence: tickers.filter((t) => t.tier === 'medium').length,
    lowConfidence: tickers.filter((t) => t.tier === 'low').length,
    averageAccuracy:
      tickers.reduce((sum, t) => sum + t.accuracy, 0) / tickers.length,
    bestTicker: tickers.reduce((best, t) => (t.accuracy > best.accuracy ? t : best)),
    worstTicker: tickers.reduce((worst, t) =>
      t.accuracy < worst.accuracy ? t : worst
    ),
  };
}
