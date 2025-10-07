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
