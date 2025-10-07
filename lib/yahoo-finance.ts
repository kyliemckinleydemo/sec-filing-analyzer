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

interface FMPAnalystEstimate {
  date: string;
  symbol: string;
  estimatedRevenueAvg: number;
  estimatedRevenueLow: number;
  estimatedRevenueHigh: number;
  estimatedEpsAvg: number;
  estimatedEpsLow: number;
  estimatedEpsHigh: number;
  numberAnalystEstimatedRevenue: number;
  numberAnalystsEstimatedEps: number;
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
  private baseUrl = 'https://financialmodelingprep.com/api/v3';

  constructor() {
    this.apiKey = process.env.FMP_API_KEY; // Financial Modeling Prep API key
    if (!this.apiKey) {
      console.warn('[FMP API] No API key configured. Set FMP_API_KEY in .env.local for analyst estimates.');
      console.warn('[FMP API] Get free API key at: https://site.financialmodelingprep.com/developer/docs');
    }
  }

  /**
   * Fetch analyst estimates for a given ticker and quarter
   * Uses Financial Modeling Prep API (free tier available)
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
      console.log(`[FMP API] Fetching quarterly estimates for ${ticker}...`);

      const url = `${this.baseUrl}/analyst-estimates/${ticker}?period=quarter&limit=8&apikey=${this.apiKey}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SEC Filing Analyzer',
        },
      });

      if (!response.ok) {
        console.error(`[FMP API] HTTP ${response.status}: ${response.statusText}`);
        return null;
      }

      const data: FMPAnalystEstimate[] = await response.json();

      if (!data || data.length === 0) {
        console.log(`[FMP API] No analyst estimates found for ${ticker}`);
        return null;
      }

      // Find the estimate closest to the filing date
      const filingTime = filingDate.getTime();
      let closestEstimate: FMPAnalystEstimate | null = null;
      let smallestDiff = Infinity;

      for (const estimate of data) {
        const estimateDate = new Date(estimate.date);
        const diff = Math.abs(estimateDate.getTime() - filingTime);

        if (diff < smallestDiff) {
          smallestDiff = diff;
          closestEstimate = estimate;
        }
      }

      if (!closestEstimate) {
        return null;
      }

      // Only use estimates within 90 days of filing
      if (smallestDiff > 90 * 24 * 60 * 60 * 1000) {
        console.log(`[FMP API] Closest estimate is ${Math.round(smallestDiff / (24 * 60 * 60 * 1000))} days away - too far`);
        return null;
      }

      const estimateDate = new Date(closestEstimate.date);
      const quarter = `Q${Math.floor(estimateDate.getMonth() / 3) + 1} ${estimateDate.getFullYear()}`;

      console.log(`[FMP API] Found estimates for ${quarter}: EPS ${closestEstimate.estimatedEpsAvg}, Revenue $${(closestEstimate.estimatedRevenueAvg / 1e9).toFixed(2)}B`);

      return {
        ticker,
        fiscalQuarter: quarter,
        fiscalYear: estimateDate.getFullYear(),
        consensusEPS: closestEstimate.estimatedEpsAvg,
        consensusRevenue: closestEstimate.estimatedRevenueAvg,
        analystCount: closestEstimate.numberAnalystsEstimatedEps,
        earningsDate: estimateDate,
      };
    } catch (error: any) {
      console.error(`[FMP API] Error fetching analyst estimates:`, error.message);
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
