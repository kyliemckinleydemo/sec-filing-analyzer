/**
 * Utility to check if a filing has financial data
 * 10-K and 10-Q always have financials
 * 8-K only if it's an earnings release with financial metrics
 */

export function hasFinancials(filing: {
  filingType: string;
  analysisData: string | null;
}): boolean {
  // 10-K and 10-Q always have financials
  if (filing.filingType === '10-K' || filing.filingType === '10-Q') {
    return true;
  }

  // For 8-K, check if analysis contains financial metrics
  if (filing.filingType === '8-K' && filing.analysisData) {
    try {
      const analysis = JSON.parse(filing.analysisData);
      const fm = analysis.financialMetrics;

      // Check for any financial data indicators
      const hasFinancialData =
        // Structured data from Yahoo Finance (earnings, revenue)
        fm?.structuredData ||
        // EPS/Revenue surprises
        fm?.surprises?.length > 0 ||
        // Revenue growth metrics (only if it's a number or meaningful string, not "Not disclosed")
        (fm?.revenueGrowth !== undefined &&
         fm?.revenueGrowth !== null &&
         fm?.revenueGrowth !== 'Not disclosed' &&
         fm?.revenueGrowth !== 'not_disclosed') ||
        // Key financial metrics
        fm?.keyMetrics?.length > 0 ||
        // Guidance (only if it's a meaningful direction, not "not_provided")
        (fm?.guidanceDirection &&
         fm?.guidanceDirection !== 'not_provided' &&
         fm?.guidanceDirection !== 'Not provided') ||
        (fm?.guidanceChange &&
         fm?.guidanceChange !== 'not_provided' &&
         fm?.guidanceChange !== 'Not provided');

      return !!hasFinancialData;
    } catch (e) {
      return false;
    }
  }

  return false;
}
