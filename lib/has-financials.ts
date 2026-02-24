/**
 * @module lib/has-financials
 * @description Determines whether an SEC filing contains financial data by checking filing type and parsing analysis metadata for earnings metrics
 *
 * PURPOSE:
 * - Return true for 10-K and 10-Q filings which always contain financial statements
 * - Parse 8-K analysisData JSON to detect presence of earnings metrics like revenue, EPS, guidance, and YoY growth
 * - Filter out placeholder values ('Not disclosed', 'not_provided') to ensure actual financial data exists
 * - Return false for 8-K filings without analysis data or any other filing types
 *
 * EXPORTS:
 * - hasFinancials (function) - Returns boolean indicating whether filing object contains actual financial metrics based on type and parsed analysis
 *
 * PATTERNS:
 * - Pass filing object with filingType string and analysisData JSON string: hasFinancials({ filingType: '8-K', analysisData: '{...}' })
 * - Use to conditionally render financial charts or tables: if (hasFinancials(filing)) { <FinancialDashboard /> }
 * - Safe to call with null analysisData - will return false for 8-K, true for 10-K/10-Q
 *
 * CLAUDE NOTES:
 * - Checks 12 different structuredData fields (revenue, netIncome, eps, margins, YoY changes, consensus, surprises) to ensure comprehensive detection
 * - Explicitly filters sentinel values like 'Not disclosed' and 'not_provided' to avoid false positives from placeholder data
 * - Try-catch around JSON.parse prevents crashes if analysisData is malformed, defaulting to false
 * - Only checks fm?.surprises?.length and fm?.keyMetrics?.length for non-empty arrays, not their contents
 */
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
        // Structured data with actual financial metrics (not just sector/industry metadata)
        (fm?.structuredData && (
          fm.structuredData.revenue !== undefined ||
          fm.structuredData.netIncome !== undefined ||
          fm.structuredData.eps !== undefined ||
          fm.structuredData.grossMargin !== undefined ||
          fm.structuredData.operatingMargin !== undefined ||
          fm.structuredData.revenueYoY !== undefined ||
          fm.structuredData.netIncomeYoY !== undefined ||
          fm.structuredData.epsYoY !== undefined ||
          fm.structuredData.consensusEPS !== undefined ||
          fm.structuredData.consensusRevenue !== undefined ||
          fm.structuredData.epsSurprisePercent !== undefined ||
          fm.structuredData.revenueSurprisePercent !== undefined
        )) ||
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
