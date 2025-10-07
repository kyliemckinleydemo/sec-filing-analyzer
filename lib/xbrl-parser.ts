/**
 * Inline XBRL Parser for SEC Filings
 *
 * Extracts financial data from inline XBRL tags in 10-K/10-Q HTML filings
 */

export interface XBRLFinancials {
  // Income Statement
  revenue?: number;
  revenueLabel?: string;
  costOfRevenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  eps?: number;
  epsLabel?: string;

  // Balance Sheet
  totalAssets?: number;
  currentAssets?: number;
  totalLiabilities?: number;
  currentLiabilities?: number;
  stockholdersEquity?: number;

  // Cash Flow
  operatingCashFlow?: number;
  investingCashFlow?: number;
  financingCashFlow?: number;

  // Period info
  periodEndDate?: string;
  fiscalPeriod?: string;
}

export class XBRLParser {
  /**
   * Extract inline XBRL financial data from HTML
   */
  parseInlineXBRL(html: string): XBRLFinancials {
    const financials: XBRLFinancials = {};

    // Extract period end date
    const periodMatch = html.match(/name="dei:DocumentPeriodEndDate"[^>]*>([^<]+)</i);
    if (periodMatch) {
      financials.periodEndDate = periodMatch[1].trim();
    }

    // Extract fiscal period (Q1, Q2, Q3, FY)
    const fiscalMatch = html.match(/name="dei:DocumentFiscalPeriodFocus"[^>]*>([^<]+)</i);
    if (fiscalMatch) {
      financials.fiscalPeriod = fiscalMatch[1].trim();
    }

    // Income Statement Items
    financials.revenue = this.extractXBRLValue(html, [
      'Revenues',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'SalesRevenueNet'
    ]);

    financials.costOfRevenue = this.extractXBRLValue(html, [
      'CostOfRevenue',
      'CostOfGoodsAndServicesSold'
    ]);

    financials.grossProfit = this.extractXBRLValue(html, ['GrossProfit']);

    financials.operatingIncome = this.extractXBRLValue(html, [
      'OperatingIncomeLoss',
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest'
    ]);

    financials.netIncome = this.extractXBRLValue(html, [
      'NetIncomeLoss',
      'ProfitLoss'
    ]);

    // EPS - look for both basic and diluted
    financials.eps = this.extractXBRLValue(html, [
      'EarningsPerShareBasic',
      'EarningsPerShareDiluted'
    ]);

    // Balance Sheet Items
    financials.totalAssets = this.extractXBRLValue(html, ['Assets']);

    financials.currentAssets = this.extractXBRLValue(html, ['AssetsCurrent']);

    financials.totalLiabilities = this.extractXBRLValue(html, [
      'Liabilities',
      'LiabilitiesAndStockholdersEquity'
    ]);

    financials.currentLiabilities = this.extractXBRLValue(html, ['LiabilitiesCurrent']);

    financials.stockholdersEquity = this.extractXBRLValue(html, [
      'StockholdersEquity',
      'ShareholdersEquityIncludingPortionAttributableToNoncontrollingInterest'
    ]);

    // Cash Flow Items
    financials.operatingCashFlow = this.extractXBRLValue(html, [
      'NetCashProvidedByUsedInOperatingActivities',
      'CashProvidedByUsedInOperatingActivities'
    ]);

    financials.investingCashFlow = this.extractXBRLValue(html, [
      'NetCashProvidedByUsedInInvestingActivities'
    ]);

    financials.financingCashFlow = this.extractXBRLValue(html, [
      'NetCashProvidedByUsedInFinancingActivities'
    ]);

    return financials;
  }

  /**
   * Extract a single XBRL value, trying multiple concept names
   * Handles scale attributes (e.g., scale="6" means millions)
   */
  private extractXBRLValue(html: string, conceptNames: string[]): number | undefined {
    for (const conceptName of conceptNames) {
      // Try multiple XBRL tag formats - capture the entire tag to extract scale
      const patterns = [
        // ix:nonfraction format (most common) - match entire opening tag
        new RegExp(`<ix:nonfraction([^>]*name="us-gaap:${conceptName}"[^>]*)>\\s*([\\d,.-]+)\\s*</ix:nonfraction>`, 'i'),
        // ix:nonFraction (alternative capitalization)
        new RegExp(`<ix:nonFraction([^>]*name="us-gaap:${conceptName}"[^>]*)>\\s*([\\d,.-]+)\\s*</ix:nonFraction>`, 'i'),
      ];

      for (const pattern of patterns) {
        const matches = html.match(pattern);
        if (matches && matches[2]) {
          // Extract the value
          const valueStr = matches[2].replace(/,/g, ''); // Remove commas
          let value = parseFloat(valueStr);

          if (isNaN(value)) continue;

          // Check for scale attribute (e.g., scale="6" means multiply by 10^6)
          const tagAttributes = matches[1];
          const scaleMatch = tagAttributes.match(/scale="(-?\d+)"/i);
          if (scaleMatch) {
            const scale = parseInt(scaleMatch[1]);
            value = value * Math.pow(10, scale);
          }

          return value;
        }
      }
    }

    return undefined;
  }

  /**
   * Format financials for display
   */
  formatFinancials(financials: XBRLFinancials): {
    revenue?: string;
    netIncome?: string;
    eps?: string;
    grossMargin?: string;
    operatingMargin?: string;
  } {
    const formatted: any = {};

    if (financials.revenue) {
      formatted.revenue = `$${(financials.revenue / 1e9).toFixed(2)}B`;
    }

    if (financials.netIncome) {
      formatted.netIncome = `$${(financials.netIncome / 1e9).toFixed(2)}B`;
    }

    if (financials.eps) {
      formatted.eps = `$${financials.eps.toFixed(2)}`;
    }

    if (financials.revenue && financials.grossProfit) {
      const margin = (financials.grossProfit / financials.revenue) * 100;
      formatted.grossMargin = `${margin.toFixed(1)}%`;
    }

    if (financials.revenue && financials.operatingIncome) {
      const margin = (financials.operatingIncome / financials.revenue) * 100;
      formatted.operatingMargin = `${margin.toFixed(1)}%`;
    }

    return formatted;
  }

  /**
   * Get summary of extracted data for logging
   */
  getSummary(financials: XBRLFinancials): string {
    const parts: string[] = [];

    if (financials.revenue) parts.push(`Revenue: $${(financials.revenue / 1e9).toFixed(2)}B`);
    if (financials.netIncome) parts.push(`Net Income: $${(financials.netIncome / 1e9).toFixed(2)}B`);
    if (financials.eps) parts.push(`EPS: $${financials.eps.toFixed(2)}`);
    if (financials.periodEndDate) parts.push(`Period: ${financials.periodEndDate}`);

    return parts.length > 0 ? parts.join(', ') : 'No financial data extracted';
  }
}

export const xbrlParser = new XBRLParser();
