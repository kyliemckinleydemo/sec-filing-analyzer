/**
 * @module yahoo-finance
 * @description Yahoo Finance API client for fetching analyst consensus estimates and earnings data
 *
 * PURPOSE:
 * - Retrieves analyst consensus estimates (EPS, revenue) from Yahoo Finance
 * - Matches earnings data to SEC filing dates for earnings surprise analysis
 * - Compares actual results against consensus to determine beat/miss/inline outcomes
 * - Provides formatted earnings surprise data for AI model consumption
 *
 * EXPORTS:
 * - AnalystEstimates: Interface for consensus and actual earnings data
 * - EarningsComparison: Interface for beat/miss classification and surprise percentages
 * - financialDataClient: Singleton client instance for fetching and analyzing earnings data
 *
 * CLAUDE NOTES:
 * - Uses Yahoo Finance earningsHistory module (EPS only - revenue from XBRL)
 * - Matches earnings to filings within 45-day window (typical 10-K/Q filing delay)
 * - Beat/miss threshold: ±2% (inline if within this range)
 * - EPS surprise calculated as: (actual - estimate) / |estimate| * 100
 * - Revenue estimates NOT available in earningsHistory - must use XBRL parsing
 * - Returns null if no matching earnings data found or date mismatch too large
 */

/**
 * Financial Data API Client
 * Fetches analyst consensus estimates from Yahoo Finance earningsHistory
 */

import yahooFinance from './yahoo-finance-singleton';

export interface AnalystEstimates {
  ticker: string;
  fiscalQuarter: string; // e.g., "Q3 2025"
  fiscalYear: number;

  // Consensus estimates (before earnings)
  consensusEPS?: number;
  consensusRevenue?: number;

  // Actual results (after earnings)
  actualEPS?: number;
  actualRevenue?: number;

  // Calculated surprises
  epsSurprise?: number; // % difference
  revenueSurprise?: number; // % difference

  // Additional context
  earningsDate?: Date;
  analystCount?: number;
}

export interface EarningsComparison {
  epsBeat: boolean;
  revenueBeat: boolean;
  epsSurprisePercent: number;
  revenueSurprisePercent: number;
  classification: {
    eps: 'beat' | 'miss' | 'inline';
    revenue: 'beat' | 'miss' | 'inline';
  };
}

class FinancialDataClient {
  /**
   * Fetch analyst estimates and actuals for a given ticker and quarter
   * Uses Yahoo Finance earningsHistory module
   */
  async getAnalystEstimates(
    ticker: string,
    filingDate: Date
  ): Promise<AnalystEstimates | null> {
    try {
      console.log(`[Yahoo Finance] Fetching earnings data for ${ticker}...`);

      const summary = await yahooFinance.quoteSummary(ticker, {
        modules: ['earningsHistory'],
      });

      const history = summary.earningsHistory?.history;
      if (!history || history.length === 0) {
        console.log(`[Yahoo Finance] No earnings data found for ${ticker}`);
        return null;
      }

      // Find the earnings report closest to the filing date
      const filingTime = filingDate.getTime();
      let closestEarnings: (typeof history)[number] | null = null;
      let smallestDiff = Infinity;

      for (const entry of history) {
        // Skip if no estimate data
        if (entry.epsEstimate == null) {
          continue;
        }

        const earningsDate = entry.quarter ? new Date(entry.quarter) : null;
        if (!earningsDate) continue;

        const diff = Math.abs(earningsDate.getTime() - filingTime);

        if (diff < smallestDiff) {
          smallestDiff = diff;
          closestEarnings = entry;
        }
      }

      if (!closestEarnings) {
        console.log(`[Yahoo Finance] No earnings with estimates found for ${ticker}`);
        return null;
      }

      // Only use earnings within 45 days of filing (10-K/Q usually filed within 30-40 days)
      if (smallestDiff > 45 * 24 * 60 * 60 * 1000) {
        console.log(`[Yahoo Finance] Closest earnings is ${Math.round(smallestDiff / (24 * 60 * 60 * 1000))} days away - too far`);
        return null;
      }

      const earningsDate = closestEarnings.quarter ? new Date(closestEarnings.quarter) : new Date();
      const quarter = `Q${Math.floor(earningsDate.getMonth() / 3) + 1}`;
      const year = earningsDate.getFullYear();

      // Calculate EPS surprise if we have both estimated and actual
      let epsSurprise: number | undefined;

      if (closestEarnings.epsActual != null && closestEarnings.epsEstimate != null && closestEarnings.epsEstimate !== 0) {
        epsSurprise = ((closestEarnings.epsActual - closestEarnings.epsEstimate) / Math.abs(closestEarnings.epsEstimate)) * 100;
      }

      // Revenue estimates are not available in Yahoo earningsHistory;
      // revenue surprise relies on XBRL data in the earnings calculator

      console.log(`[Yahoo Finance] Found ${quarter} ${year}: EPS ${closestEarnings.epsEstimate} → ${closestEarnings.epsActual ?? 'pending'}`);

      return {
        ticker,
        fiscalQuarter: `${quarter} ${year}`,
        fiscalYear: year,
        consensusEPS: closestEarnings.epsEstimate ?? undefined,
        actualEPS: closestEarnings.epsActual ?? undefined,
        epsSurprise,
        earningsDate,
      };
    } catch (error: any) {
      console.error(`[Yahoo Finance] Error fetching earnings data:`, error.message);
      return null;
    }
  }

  /**
   * Compare actual results vs consensus estimates
   */
  compareToConsensus(
    actualEPS: number,
    actualRevenue: number,
    consensusEPS: number,
    consensusRevenue: number
  ): EarningsComparison {
    const epsSurprisePercent = ((actualEPS - consensusEPS) / Math.abs(consensusEPS)) * 100;
    const revenueSurprisePercent = ((actualRevenue - consensusRevenue) / consensusRevenue) * 100;

    // Classification: beat if > +2%, miss if < -2%, inline otherwise
    const classifyEPS = (): 'beat' | 'miss' | 'inline' => {
      if (epsSurprisePercent > 2) return 'beat';
      if (epsSurprisePercent < -2) return 'miss';
      return 'inline';
    };

    const classifyRevenue = (): 'beat' | 'miss' | 'inline' => {
      if (revenueSurprisePercent > 2) return 'beat';
      if (revenueSurprisePercent < -2) return 'miss';
      return 'inline';
    };

    return {
      epsBeat: actualEPS > consensusEPS,
      revenueBeat: actualRevenue > consensusRevenue,
      epsSurprisePercent,
      revenueSurprisePercent,
      classification: {
        eps: classifyEPS(),
        revenue: classifyRevenue(),
      },
    };
  }

  /**
   * Generate earnings surprises array for Claude analysis
   * This formats the data in a way that the prediction model can extract
   */
  generateSurprisesArray(comparison: EarningsComparison): string[] {
    const surprises: string[] = [];

    if (comparison.classification.eps === 'beat') {
      surprises.push(`EPS beat consensus by ${comparison.epsSurprisePercent.toFixed(1)}%`);
    } else if (comparison.classification.eps === 'miss') {
      surprises.push(`EPS missed consensus by ${Math.abs(comparison.epsSurprisePercent).toFixed(1)}%`);
    }

    if (comparison.classification.revenue === 'beat') {
      surprises.push(`Revenue beat consensus by ${comparison.revenueSurprisePercent.toFixed(1)}%`);
    } else if (comparison.classification.revenue === 'miss') {
      surprises.push(`Revenue missed consensus by ${Math.abs(comparison.revenueSurprisePercent).toFixed(1)}%`);
    }

    return surprises;
  }
}

export const financialDataClient = new FinancialDataClient();
