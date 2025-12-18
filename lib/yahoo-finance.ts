/**
 * Financial Data API Client
 * Fetches analyst consensus estimates from Financial Modeling Prep API
 * Free tier available: https://site.financialmodelingprep.com/developer/docs
 */

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

interface FMPEarningsData {
  symbol: string;
  date: string; // Earnings date
  epsActual: number | null;
  epsEstimated: number | null;
  revenueActual: number | null;
  revenueEstimated: number | null;
  lastUpdated: string;
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
  private apiKey: string | undefined;
  private baseUrl = 'https://financialmodelingprep.com';

  constructor() {
    this.apiKey = process.env.FMP_API_KEY; // Financial Modeling Prep API key
    if (!this.apiKey) {
      console.warn('[FMP API] No API key configured. Set FMP_API_KEY in .env.local for analyst estimates.');
      console.warn('[FMP API] Get free API key at: https://site.financialmodelingprep.com/developer/docs');
    }
  }

  /**
   * Fetch analyst estimates and actuals for a given ticker and quarter
   * Uses FMP /stable/earnings endpoint (2025+ API)
   */
  async getAnalystEstimates(
    ticker: string,
    filingDate: Date
  ): Promise<AnalystEstimates | null> {
    if (!this.apiKey) {
      console.log(`[FMP API] Skipping analyst estimates - no API key configured`);
      return null;
    }

    try {
      console.log(`[FMP API] Fetching earnings data for ${ticker}...`);

      // Use new /stable/earnings endpoint (free tier: limit=5)
      const url = `${this.baseUrl}/stable/earnings?symbol=${ticker}&limit=5&apikey=${this.apiKey}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SEC Filing Analyzer',
        },
      });

      if (!response.ok) {
        console.error(`[FMP API] HTTP ${response.status}: ${response.statusText}`);
        return null;
      }

      const data: FMPEarningsData[] = await response.json();

      if (!data || data.length === 0) {
        console.log(`[FMP API] No earnings data found for ${ticker}`);
        return null;
      }

      // Find the earnings report closest to the filing date
      const filingTime = filingDate.getTime();
      let closestEarnings: FMPEarningsData | null = null;
      let smallestDiff = Infinity;

      for (const earnings of data) {
        // Skip if no estimate data
        if (!earnings.epsEstimated && !earnings.revenueEstimated) {
          continue;
        }

        const earningsDate = new Date(earnings.date);
        const diff = Math.abs(earningsDate.getTime() - filingTime);

        if (diff < smallestDiff) {
          smallestDiff = diff;
          closestEarnings = earnings;
        }
      }

      if (!closestEarnings) {
        console.log(`[FMP API] No earnings with estimates found for ${ticker}`);
        return null;
      }

      // Only use earnings within 45 days of filing (10-K/Q usually filed within 30-40 days)
      if (smallestDiff > 45 * 24 * 60 * 60 * 1000) {
        console.log(`[FMP API] Closest earnings is ${Math.round(smallestDiff / (24 * 60 * 60 * 1000))} days away - too far`);
        return null;
      }

      const earningsDate = new Date(closestEarnings.date);
      const quarter = `Q${Math.floor(earningsDate.getMonth() / 3) + 1}`;
      const year = earningsDate.getFullYear();

      // Calculate surprises if we have both estimated and actual
      let epsSurprise: number | undefined;
      let revenueSurprise: number | undefined;

      if (closestEarnings.epsActual && closestEarnings.epsEstimated) {
        epsSurprise = ((closestEarnings.epsActual - closestEarnings.epsEstimated) / Math.abs(closestEarnings.epsEstimated)) * 100;
      }

      if (closestEarnings.revenueActual && closestEarnings.revenueEstimated) {
        revenueSurprise = ((closestEarnings.revenueActual - closestEarnings.revenueEstimated) / closestEarnings.revenueEstimated) * 100;
      }

      console.log(`[FMP API] Found ${quarter} ${year}: EPS ${closestEarnings.epsEstimated} → ${closestEarnings.epsActual || 'pending'}`);

      return {
        ticker,
        fiscalQuarter: `${quarter} ${year}`,
        fiscalYear: year,
        consensusEPS: closestEarnings.epsEstimated || undefined,
        consensusRevenue: closestEarnings.revenueEstimated || undefined,
        actualEPS: closestEarnings.epsActual || undefined,
        actualRevenue: closestEarnings.revenueActual || undefined,
        epsSurprise,
        revenueSurprise,
        earningsDate,
      };
    } catch (error: any) {
      console.error(`[FMP API] Error fetching earnings data:`, error.message);
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
