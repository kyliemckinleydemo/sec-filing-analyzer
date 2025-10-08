/**
 * Yahoo Finance integration via Python yfinance library
 * Calls the Python script and returns parsed data
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export interface YahooFinanceData {
  ticker: string;
  success: boolean;
  error?: string;

  // Consensus Estimates
  consensusEPS?: number;
  consensusRevenue?: number;

  // Valuation Metrics
  peRatio?: number;
  marketCap?: number;
  marketCapB?: number; // in billions

  // Additional Context
  analystCount?: number;
  sector?: string;
  industry?: string;
  currentPrice?: number;
}

class YahooFinancePythonClient {
  private scriptPath: string;

  constructor() {
    // Path to the Python script
    this.scriptPath = path.join(process.cwd(), 'scripts', 'fetch-consensus.py');
  }

  /**
   * Fetch data from Yahoo Finance using Python yfinance
   */
  async fetchData(ticker: string, filingDate?: Date): Promise<YahooFinanceData | null> {
    try {
      console.log(`[Yahoo Finance] Fetching data for ${ticker}...`);

      const filingDateStr = filingDate ? filingDate.toISOString().split('T')[0] : '';
      const command = filingDateStr
        ? `python3 "${this.scriptPath}" ${ticker} ${filingDateStr}`
        : `python3 "${this.scriptPath}" ${ticker}`;

      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000, // 30 second timeout
      });

      if (stderr && !stderr.includes('[*********************100%]')) {
        console.warn(`[Yahoo Finance] Warning:`, stderr);
      }

      const data: YahooFinanceData = JSON.parse(stdout);

      if (!data.success) {
        console.error(`[Yahoo Finance] Error:`, data.error);
        return null;
      }

      console.log(`[Yahoo Finance] ✅ Data fetched: P/E=${data.peRatio}, MarketCap=$${(data.marketCapB || 0).toFixed(1)}B`);
      return data;
    } catch (error: any) {
      console.error(`[Yahoo Finance] Failed to fetch data:`, error.message);
      return null;
    }
  }

  /**
   * Calculate earnings surprises by comparing actual vs consensus
   */
  calculateSurprises(
    actualEPS: number,
    actualRevenue: number,
    consensusEPS?: number,
    consensusRevenue?: number
  ): {
    epsSurprise?: 'beat' | 'miss' | 'inline';
    epsSurpriseMagnitude?: number;
    revenueSurprise?: 'beat' | 'miss' | 'inline';
    revenueSurpriseMagnitude?: number;
    surprisesArray: string[];
  } {
    const result: any = {
      surprisesArray: [],
    };

    // EPS Surprise
    if (consensusEPS && consensusEPS > 0 && actualEPS != null) {
      const epsDiff = actualEPS - consensusEPS;
      const epsDiffPct = (epsDiff / Math.abs(consensusEPS)) * 100;

      result.epsSurpriseMagnitude = epsDiffPct;

      if (epsDiffPct > 2) {
        result.epsSurprise = 'beat';
        result.surprisesArray.push(
          `EPS beat consensus by ${epsDiffPct.toFixed(1)}% ($${actualEPS.toFixed(2)} vs $${consensusEPS.toFixed(2)} expected)`
        );
      } else if (epsDiffPct < -2) {
        result.epsSurprise = 'miss';
        result.surprisesArray.push(
          `EPS missed consensus by ${Math.abs(epsDiffPct).toFixed(1)}% ($${actualEPS.toFixed(2)} vs $${consensusEPS.toFixed(2)} expected)`
        );
      } else {
        result.epsSurprise = 'inline';
        result.surprisesArray.push(`EPS in line with consensus ($${actualEPS.toFixed(2)} vs $${consensusEPS.toFixed(2)})`);
      }
    }

    // Revenue Surprise
    if (consensusRevenue && consensusRevenue > 0 && actualRevenue != null) {
      const revDiff = actualRevenue - consensusRevenue;
      const revDiffPct = (revDiff / consensusRevenue) * 100;

      result.revenueSurpriseMagnitude = revDiffPct;

      if (revDiffPct > 2) {
        result.revenueSurprise = 'beat';
        result.surprisesArray.push(
          `Revenue beat consensus by ${revDiffPct.toFixed(1)}% ($${(actualRevenue / 1e9).toFixed(2)}B vs $${(consensusRevenue / 1e9).toFixed(2)}B expected)`
        );
      } else if (revDiffPct < -2) {
        result.revenueSurprise = 'miss';
        result.surprisesArray.push(
          `Revenue missed consensus by ${Math.abs(revDiffPct).toFixed(1)}% ($${(actualRevenue / 1e9).toFixed(2)}B vs $${(consensusRevenue / 1e9).toFixed(2)}B expected)`
        );
      } else {
        result.revenueSurprise = 'inline';
        result.surprisesArray.push(`Revenue in line with consensus ($${(actualRevenue / 1e9).toFixed(2)}B vs $${(consensusRevenue / 1e9).toFixed(2)}B)`);
      }
    }

    return result;
  }
}

export const yahooFinancePythonClient = new YahooFinancePythonClient();
