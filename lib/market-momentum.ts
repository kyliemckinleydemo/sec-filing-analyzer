/**
 * @module lib/market-momentum
 * @description Python yfinance integration that calculates SPY 30-day market returns and volatility metrics preceding a given filing date
 *
 * PURPOSE:
 * - Execute Python script to fetch SPY (S&P 500 ETF) historical data from yfinance
 * - Calculate 30-day returns, annualized volatility, and market regime classification for filing dates
 * - Determine flight-to-quality conditions based on market volatility thresholds
 * - Provide market context for analyzing filing behavior during different market conditions
 *
 * DEPENDENCIES:
 * - child_process - Spawns Python subprocess to execute yfinance data fetching script
 * - util - Promisifies exec for async/await pattern instead of callbacks
 * - path - Resolves absolute path to fetch-market-momentum.py in scripts directory
 *
 * EXPORTS:
 * - MarketMomentumData (interface) - Shape with success flag, SPY 30d return percentage, volatility, regime classification (bull/flat/bear), and flight-to-quality boolean
 * - marketMomentumClient (const) - Singleton instance exposing fetchMomentum method for retrieving market data
 *
 * PATTERNS:
 * - Import marketMomentumClient and call await marketMomentumClient.fetchMomentum(new Date('2024-01-15'))
 * - Check returned data.success before using data.marketMomentum to handle Python script failures
 * - Pass filing date as Date object; method converts to YYYY-MM-DD format for Python script
 *
 * CLAUDE NOTES:
 * - Depends on external Python script at scripts/fetch-market-momentum.py - will fail if script missing or python3 not installed
 * - 30-second timeout prevents hanging on slow network or yfinance API issues
 * - Ignores stderr containing '[*********************100%]' because yfinance prints progress bars to stderr
 * - Returns null on any error rather than throwing, requiring callers to handle missing data gracefully
 */
/**
 * Market Momentum integration via Python yfinance library
 * Fetches SPY 30-day return prior to filing date
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export interface MarketMomentumData {
  success: boolean;
  error?: string;
  marketMomentum?: number;
  spy30dReturn?: number;
  volatility?: number; // Annualized volatility %
  regime?: 'bull' | 'flat' | 'bear'; // Market regime classification
  flightToQuality?: boolean; // High volatility environment
  filingDate?: string;
  tradingDays?: number;
}

class MarketMomentumClient {
  private scriptPath: string;

  constructor() {
    this.scriptPath = path.join(process.cwd(), 'scripts', 'fetch-market-momentum.py');
  }

  /**
   * Fetch market momentum (SPY 30-day return) for a filing date
   */
  async fetchMomentum(filingDate: Date): Promise<MarketMomentumData | null> {
    try {
      const filingDateStr = filingDate.toISOString().split('T')[0];
      console.log(`[Market Momentum] Fetching SPY 30d return for ${filingDateStr}...`);

      const command = `python3 "${this.scriptPath}" ${filingDateStr}`;

      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000, // 30 second timeout
      });

      if (stderr && !stderr.includes('[*********************100%]')) {
        console.warn(`[Market Momentum] Warning:`, stderr);
      }

      const data: MarketMomentumData = JSON.parse(stdout);

      if (!data.success) {
        console.error(`[Market Momentum] Error:`, data.error);
        return null;
      }

      console.log(`[Market Momentum] ✅ SPY 30d return: ${data.marketMomentum?.toFixed(2)}%`);
      return data;
    } catch (error: any) {
      console.error(`[Market Momentum] Failed to fetch:`, error.message);
      return null;
    }
  }
}

export const marketMomentumClient = new MarketMomentumClient();
