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
