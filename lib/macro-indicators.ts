/**
 * @module lib/macro-indicators
 * @description Fetches macroeconomic indicators (DXY dollar index and GDP proxy trends) by executing a Python script and parsing the JSON output to assess equity market bias
 *
 * PURPOSE:
 * - Execute external Python script (fetch-macro-indicators.py) with filing date parameter
 * - Parse DXY dollar index current value, 30-day change percentage, and year-average comparison
 * - Calculate dollar strength classification (weak/neutral/strong) and GDP proxy trend
 * - Determine equity flow bias (bullish/neutral/bearish) based on dollar weakness and GDP outlook
 * - Return null on script execution failures or invalid data with console error logging
 *
 * DEPENDENCIES:
 * - child_process - Executes external Python script with filing date argument
 * - util - Promisifies exec for async/await pattern in fetchIndicators method
 * - path - Resolves absolute path to fetch-macro-indicators.py in scripts directory
 *
 * EXPORTS:
 * - MacroIndicators (interface) - Shape containing success flag, optional error, dollarIndex value, dollar30dChange percentage, dollarVsYearAvg comparison, strength classifications, equityFlowBias, and filingDate string
 * - macroIndicatorsClient (const) - Singleton instance of MacroIndicatorsClient class ready for immediate use
 *
 * PATTERNS:
 * - Import macroIndicatorsClient from '@/lib/macro-indicators' and call fetchIndicators(new Date('2024-01-15'))
 * - Check returned object for success=true before accessing dollarIndex or equityFlowBias properties
 * - Handle null returns gracefully as script failures return null instead of throwing
 * - Pass Date objects to fetchIndicators - method converts to YYYY-MM-DD format for Python script
 *
 * CLAUDE NOTES:
 * - Weak dollar (negative 30-day change) correlates with bullish equity flows as capital shifts from USD to stocks
 * - Python script execution has 30-second timeout with stderr warnings filtered except yfinance progress bars
 * - Constructor resolves scriptPath once at instantiation relative to process.cwd()/scripts directory
 * - Console logs provide real-time status with emoji indicators for successful fetches showing dollar strength and GDP trends
 */
/**
 * Macro Economic Indicators
 * Fetches DXY dollar index and GDP proxy trends
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export interface MacroIndicators {
  success: boolean;
  error?: string;
  dollarIndex?: number;
  dollar30dChange?: number; // % change (negative = weakening = bullish)
  dollarVsYearAvg?: number;
  dollarStrength?: 'weak' | 'neutral' | 'strong';
  gdpProxyTrend?: 'weak' | 'neutral' | 'strong';
  equityFlowBias?: 'bullish' | 'neutral' | 'bearish';
  filingDate?: string;
}

class MacroIndicatorsClient {
  private scriptPath: string;

  constructor() {
    this.scriptPath = path.join(process.cwd(), 'scripts', 'fetch-macro-indicators.py');
  }

  /**
   * Fetch macro indicators for a filing date
   *
   * Key insights:
   * - Weak dollar = bullish for stocks (capital flows from USD to equities)
   * - Strong dollar = bearish for stocks (capital stays in USD assets)
   * - GDP optimism = bullish for stocks
   */
  async fetchIndicators(filingDate: Date): Promise<MacroIndicators | null> {
    try {
      const filingDateStr = filingDate.toISOString().split('T')[0];
      console.log(`[Macro] Fetching DXY and GDP indicators for ${filingDateStr}...`);

      const command = `python3 "${this.scriptPath}" ${filingDateStr}`;

      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000, // 30 second timeout
      });

      if (stderr && !stderr.includes('[*********************100%]')) {
        console.warn(`[Macro] Warning:`, stderr);
      }

      const data: MacroIndicators = JSON.parse(stdout);

      if (!data.success) {
        console.error(`[Macro] Error:`, data.error);
        return null;
      }

      console.log(
        `[Macro] ✅ Dollar: ${data.dollarStrength} (${data.dollar30dChange?.toFixed(2)}%), ` +
        `GDP: ${data.gdpProxyTrend}, Equity flow: ${data.equityFlowBias}`
      );
      return data;
    } catch (error: any) {
      console.error(`[Macro] Failed to fetch:`, error.message);
      return null;
    }
  }
}

export const macroIndicatorsClient = new MacroIndicatorsClient();
