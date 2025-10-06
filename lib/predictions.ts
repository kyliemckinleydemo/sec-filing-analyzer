/**
 * Prediction Engine
 * Pattern-based prediction system for stock price movements post-filing
 */

export interface PredictionFeatures {
  // From AI Analysis
  riskScoreDelta: number;
  sentimentScore: number;
  riskCountNew: number;

  // From Filing Meta
  filingType: '10-K' | '10-Q' | '8-K';
  eventType?: '8-K-earnings-announcement' | '8-K-earnings-release' | '8-K-other';

  // Financial Metrics (NEW)
  hasFinancialMetrics?: boolean;
  guidanceDirection?: 'raised' | 'lowered' | 'maintained';

  // Historical Pattern
  avgHistoricalReturn: number; // Average return for similar filings
}

export interface Prediction {
  predicted7dReturn: number;
  confidence: number;
  reasoning: string;
  features: PredictionFeatures;
}

class PredictionEngine {
  /**
   * Pattern-based prediction (MVP approach)
   *
   * This uses simple heuristics based on:
   * - Risk score changes
   * - Sentiment analysis
   * - Filing type patterns
   * - Historical averages
   */
  async predict(
    features: Partial<PredictionFeatures>
  ): Promise<Prediction> {
    // Base prediction starts at 0%
    let prediction = 0;
    const reasoningParts: string[] = [];

    // Factor 1: Risk Score Impact (-2% to +2%)
    const riskDelta = features.riskScoreDelta || 0;
    const riskImpact = -riskDelta * 0.3; // Lower risk = positive impact
    prediction += riskImpact;

    if (Math.abs(riskDelta) > 1) {
      reasoningParts.push(
        `Risk ${riskDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(riskDelta).toFixed(1)} points (${riskImpact > 0 ? '+' : ''}${riskImpact.toFixed(2)}% impact)`
      );
    }

    // Factor 2: Sentiment Impact (-3% to +3%)
    const sentiment = features.sentimentScore || 0;
    const sentimentImpact = sentiment * 3; // Strong sentiment = strong impact
    prediction += sentimentImpact;

    if (Math.abs(sentiment) > 0.2) {
      reasoningParts.push(
        `${sentiment > 0 ? 'Positive' : 'Negative'} sentiment (${sentimentImpact > 0 ? '+' : ''}${sentimentImpact.toFixed(2)}% impact)`
      );
    }

    // Factor 3: Filing Type Patterns with 8-K Event Classification
    let filingTypeImpact = 0;
    switch (features.filingType) {
      case '10-K':
        filingTypeImpact = 0.5; // Annual filings slightly positive
        reasoningParts.push('10-K annual filing (typically +0.5% avg)');
        break;
      case '10-Q':
        filingTypeImpact = 0.2; // Quarterly filings neutral
        reasoningParts.push('10-Q quarterly filing (typically +0.2% avg)');
        break;
      case '8-K':
        // Distinguish between different 8-K event types
        if (features.eventType === '8-K-earnings-announcement') {
          // Just announcing earnings date - minimal impact
          filingTypeImpact = 0.1;
          reasoningParts.push('8-K earnings announcement (pre-release, typically +0.1% avg)');
        } else if (features.eventType === '8-K-earnings-release') {
          // Actual earnings with financial metrics
          if (features.hasFinancialMetrics) {
            // Actual earnings data available - significant impact based on surprises
            filingTypeImpact = 0.0; // Neutral base, sentiment/guidance drives it
            reasoningParts.push('8-K earnings release with financial data');

            // Guidance impact
            if (features.guidanceDirection === 'raised') {
              const guidanceImpact = 1.5;
              filingTypeImpact += guidanceImpact;
              reasoningParts.push(`Raised guidance (+${guidanceImpact.toFixed(1)}% impact)`);
            } else if (features.guidanceDirection === 'lowered') {
              const guidanceImpact = -1.5;
              filingTypeImpact += guidanceImpact;
              reasoningParts.push(`Lowered guidance (${guidanceImpact.toFixed(1)}% impact)`);
            }
          } else {
            // Earnings referenced but no actual data yet
            filingTypeImpact = -0.3;
            reasoningParts.push('8-K earnings release (data in external exhibit, typically -0.3% avg)');
          }
        } else {
          // Other 8-K events (leadership, M&A, etc)
          filingTypeImpact = -0.5;
          reasoningParts.push('8-K material event (typically -0.5% avg)');
        }
        break;
    }
    prediction += filingTypeImpact;

    // Factor 4: Historical Average
    const historical = features.avgHistoricalReturn || 0;
    if (historical !== 0) {
      prediction += historical * 0.3; // Weight historical by 30%
      reasoningParts.push(
        `Historical pattern suggests ${historical > 0 ? '+' : ''}${historical.toFixed(2)}% avg return`
      );
    }

    // Calculate confidence based on feature availability
    let confidence = 0.5; // Base confidence

    if (features.riskScoreDelta !== undefined) confidence += 0.15;
    if (features.sentimentScore !== undefined) confidence += 0.15;
    if (features.avgHistoricalReturn !== undefined) confidence += 0.20;

    confidence = Math.min(confidence, 0.95); // Cap at 95%

    // Cap prediction at realistic bounds (-10% to +10%)
    prediction = Math.max(-10, Math.min(10, prediction));

    return {
      predicted7dReturn: prediction,
      confidence,
      reasoning: reasoningParts.join('; '),
      features: features as PredictionFeatures,
    };
  }

  /**
   * Classify 8-K filing based on content summary
   */
  classify8KEvent(filingContentSummary?: string): '8-K-earnings-announcement' | '8-K-earnings-release' | '8-K-other' {
    if (!filingContentSummary) {
      return '8-K-other';
    }

    const lowerContent = filingContentSummary.toLowerCase();

    // Check if it's an earnings announcement (just announcing the call/date)
    if (
      lowerContent.includes('announcing') &&
      (lowerContent.includes('earnings call') || lowerContent.includes('earnings conference'))
    ) {
      return '8-K-earnings-announcement';
    }

    // Check if it's an actual earnings release
    if (
      (lowerContent.includes('item 2.02') || lowerContent.includes('results of operations')) &&
      (lowerContent.includes('financial results') ||
       lowerContent.includes('earnings') ||
       lowerContent.includes('press release') ||
       lowerContent.includes('quarterly results'))
    ) {
      return '8-K-earnings-release';
    }

    // Other events (leadership changes, M&A, etc)
    return '8-K-other';
  }

  /**
   * Get historical average for similar filings
   * In production, this would query actual historical data
   */
  async getHistoricalPattern(
    ticker: string,
    filingType: string
  ): Promise<number> {
    // Mock data - in production, query database
    const patterns: Record<string, number> = {
      '10-K': 0.8,
      '10-Q': 0.3,
      '8-K': -0.2,
    };

    return patterns[filingType] || 0;
  }
}

export const predictionEngine = new PredictionEngine();
