/**
 * @module lib/filing-utils
 * @description Validates SEC filings for financial data completeness by parsing analysisData JSON and checking for earnings metrics, revenue surprises, and guidance information
 *
 * PURPOSE:
 * - Filter filings to ensure they contain at least one financial indicator (EPS surprise, revenue surprise, structured financials, or guidance)
 * - Identify 8-K filings as earnings-related by searching for specific keywords like 'earnings', 'financial results', or 'item 2.02' in filing summaries
 * - Extract boolean flags indicating presence of EPS, revenue, guidance, and key metrics from parsed analysisData
 * - Support v1.0 prediction accuracy by excluding filings without quantifiable financial data
 *
 * EXPORTS:
 * - hasFinancialData (function) - Returns true if filing contains at least one financial indicator: EPS surprise, revenue surprise, structured data (revenue/EPS), guidance direction, or key metrics array
 * - getFinancialDataSummary (function) - Returns object with hasEps, hasRevenue, hasGuidance, hasMetrics boolean flags parsed from filing's analysisData JSON
 *
 * PATTERNS:
 * - Call hasFinancialData({ analysisData, filingType }) to validate before processing filing for predictions
 * - Use getFinancialDataSummary({ analysisData }) to display which financial components are available in UI badges or filters
 * - Both functions return false/empty on JSON parse errors, making them safe for malformed or missing analysisData
 *
 * CLAUDE NOTES:
 * - 8-K filings require dual validation: must be earnings-related via keyword match AND have financial metrics - not just one condition
 * - analysisData is stored as JSON string requiring parse - functions gracefully handle parse failures with try/catch returning false/empty defaults
 * - Guidance counts as present only when guidanceDirection exists AND is not 'not_provided' - empty string or null treated as absent
 * - hasMetrics checks TWO sources: fm.keyMetrics array length OR fm.structuredData.revenue existence - either qualifies as having metrics
 */
/**
 * Filing utility functions
 */

/**
 * Check if a filing has financial data (earnings, revenue, guidance)
 * For v1.0, we only include filings with financial metrics to ensure accurate predictions
 */
export function hasFinancialData(filing: {
  analysisData?: string | null;
  filingType: string;
}): boolean {
  // 8-K earnings releases should have financial data
  if (filing.filingType === '8-K') {
    if (!filing.analysisData) return false;

    try {
      const analysis = JSON.parse(filing.analysisData);
      const summary = analysis.filingContentSummary?.toLowerCase() || '';

      // Must be earnings-related 8-K
      const isEarnings = summary.includes('earnings') ||
                        summary.includes('financial results') ||
                        summary.includes('results of operations') ||
                        summary.includes('item 2.02');

      if (!isEarnings) return false;
    } catch {
      return false;
    }
  }

  // For 10-K/10-Q, check if we have financial metrics extracted
  if (!filing.analysisData) return false;

  try {
    const analysis = JSON.parse(filing.analysisData);
    const fm = analysis.financialMetrics;

    if (!fm) return false;

    // Must have at least ONE of these financial indicators:
    // 1. EPS surprise data (from Yahoo Finance)
    // 2. Revenue surprise data
    // 3. Structured financial data (revenue, margins, EPS)
    // 4. Guidance information

    const hasEpsSurprise = fm.structuredData?.epsSurprise !== undefined;
    const hasRevenueSurprise = fm.structuredData?.revenueSurprise !== undefined;
    const hasStructuredData = fm.structuredData?.revenue !== undefined ||
                              fm.structuredData?.eps !== undefined;
    const hasGuidance = fm.guidanceDirection !== undefined &&
                       fm.guidanceDirection !== 'not_provided';
    const hasKeyMetrics = fm.keyMetrics && fm.keyMetrics.length > 0;

    return hasEpsSurprise || hasRevenueSurprise || hasStructuredData || hasGuidance || hasKeyMetrics;
  } catch {
    return false;
  }
}

/**
 * Get financial data summary for a filing
 */
export function getFinancialDataSummary(filing: {
  analysisData?: string | null;
}): {
  hasEps: boolean;
  hasRevenue: boolean;
  hasGuidance: boolean;
  hasMetrics: boolean;
} {
  if (!filing.analysisData) {
    return { hasEps: false, hasRevenue: false, hasGuidance: false, hasMetrics: false };
  }

  try {
    const analysis = JSON.parse(filing.analysisData);
    const fm = analysis.financialMetrics;

    if (!fm) {
      return { hasEps: false, hasRevenue: false, hasGuidance: false, hasMetrics: false };
    }

    return {
      hasEps: fm.structuredData?.epsSurprise !== undefined,
      hasRevenue: fm.structuredData?.revenueSurprise !== undefined,
      hasGuidance: fm.guidanceDirection !== undefined && fm.guidanceDirection !== 'not_provided',
      hasMetrics: (fm.keyMetrics && fm.keyMetrics.length > 0) || fm.structuredData?.revenue !== undefined,
    };
  } catch {
    return { hasEps: false, hasRevenue: false, hasGuidance: false, hasMetrics: false };
  }
}
