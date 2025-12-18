/**
 * Yahoo Finance Client - Fetches earnings data via Python/yfinance
 * Uses the proven yfinance library for free earnings surprise data (70-90% coverage)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export interface YFinanceEarnings {
  date: string; // ISO date string
  epsEstimate: number | null;
  epsActual: number | null;
  epsSurprise: number | null; // Surprise as decimal (0.0252 = 2.52%)
  revenueEstimate: number | null;
  revenueActual: number | null;
  revenueSurprise: number | null;
}

export interface YFinanceResponse {
  ticker: string;
  success: boolean;
  count?: number;
  data: YFinanceEarnings[];
  error?: string;
}

class YFinanceClient {
  private pythonScript: string;

  constructor() {
    this.pythonScript = path.join(__dirname, '../scripts/python/fetch-earnings-yfinance.py');
  }

  /**
   * Fetch earnings history for a ticker
   * Returns historical earnings with actual vs estimated EPS
   */
  async getEarningsHistory(ticker: string): Promise<YFinanceResponse> {
    try {
      const { stdout } = await execAsync(`python3 "${this.pythonScript}" ${ticker}`, {
        timeout: 30000, // 30 second timeout
      });

      const result: YFinanceResponse = JSON.parse(stdout);
      return result;
    } catch (error: any) {
      console.error(`[yfinance] Error fetching earnings for ${ticker}:`, error.message);
      return {
        ticker,
        success: false,
        data: [],
        error: error.message,
      };
    }
  }

  /**
   * Find the earnings report closest to a given filing date
   * Used to match SEC filings with earnings announcements
   */
  findClosestEarnings(
    earningsHistory: YFinanceEarnings[],
    filingDate: Date,
    maxDaysDiff: number = 45
  ): YFinanceEarnings | null {
    if (earningsHistory.length === 0) {
      return null;
    }

    const filingTime = filingDate.getTime();
    let closest: YFinanceEarnings | null = null;
    let smallestDiff = Infinity;

    for (const earnings of earningsHistory) {
      const earningsDate = new Date(earnings.date);
      const diff = Math.abs(earningsDate.getTime() - filingTime);

      if (diff < smallestDiff) {
        smallestDiff = diff;
        closest = earnings;
      }
    }

    // Only return if within maxDaysDiff days
    const daysDiff = smallestDiff / (1000 * 60 * 60 * 24);
    if (daysDiff > maxDaysDiff) {
      return null;
    }

    return closest;
  }

  /**
   * Convert YFinance earnings to our database format
   */
  toAnalystEstimates(earnings: YFinanceEarnings) {
    return {
      consensusEPS: earnings.epsEstimate,
      actualEPS: earnings.epsActual,
      epsSurprise: earnings.epsSurprise ? earnings.epsSurprise * 100 : null, // Convert to percentage
      consensusRevenue: earnings.revenueEstimate,
      actualRevenue: earnings.revenueActual,
      revenueSurprise: earnings.revenueSurprise,
    };
  }
}

export const yfinanceClient = new YFinanceClient();
