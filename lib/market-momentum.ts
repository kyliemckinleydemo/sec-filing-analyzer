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
