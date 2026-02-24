/**
 * @module lib/company-financials
 * @description Extracts financial metrics from filing analysis data and maps them to Company model fields
 *
 * PURPOSE:
 * - Parse AI analysis JSON to extract structured financial data (revenue, net income, EPS, margins)
 * - Convert YoY growth strings (e.g., "+12.5%", "-3.2%") to numeric percentages
 * - Determine fiscal quarter label from filing date and report date
 * - Return a Prisma-compatible update object for the Company model
 *
 * EXPORTS:
 * - extractCompanyFinancials (function) - Parses analysis JSON and returns Company update data or null
 *
 * CLAUDE NOTES:
 * - Only called for 10-Q and 10-K filings (not 8-K)
 * - Returns null if no structured financial data found in analysis
 * - YoY fields may be strings like "+12.5%", "-3.2%", or "N/A" — parsePercentage handles all cases
 * - Quarter determination: uses reportDate if available, falls back to filingDate
 */

/**
 * Parse a percentage string like "+12.5%", "-3.2%", "N/A" to a number or null
 */
function parsePercentage(value: string | undefined | null): number | null {
  if (!value || value === 'N/A' || value === 'n/a') return null;
  const cleaned = value.replace(/[%,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Determine fiscal quarter label from a date (e.g., "Q3 2025")
 */
function getQuarterLabel(date: Date): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `Q${quarter} ${date.getFullYear()}`;
}

/**
 * Extract company financial metrics from filing analysis JSON
 * and return a Prisma-compatible update object for the Company model.
 *
 * @param analysisJSON - Stringified FilingAnalysis object
 * @param filingType - "10-Q" or "10-K"
 * @param filingDate - Date the filing was submitted to SEC
 * @param reportDate - Fiscal period end date (may be null)
 * @returns Company update data or null if no structured data found
 */
export function extractCompanyFinancials(
  analysisJSON: string,
  filingType: string,
  filingDate: Date | null,
  reportDate: Date | null
): Record<string, number | string | null> | null {
  try {
    const analysis = JSON.parse(analysisJSON);
    const structured = analysis?.financialMetrics?.structuredData;

    if (!structured) return null;

    const update: Record<string, number | string | null> = {};

    if (structured.revenue != null) update.latestRevenue = structured.revenue;
    if (structured.netIncome != null) update.latestNetIncome = structured.netIncome;
    if (structured.eps != null) update.latestEPS = structured.eps;
    if (structured.grossMargin != null) update.latestGrossMargin = structured.grossMargin;
    if (structured.operatingMargin != null) update.latestOperatingMargin = structured.operatingMargin;

    const revenueYoY = parsePercentage(structured.revenueYoY);
    if (revenueYoY != null) update.latestRevenueYoY = revenueYoY;

    const netIncomeYoY = parsePercentage(structured.netIncomeYoY);
    if (netIncomeYoY != null) update.latestNetIncomeYoY = netIncomeYoY;

    const epsYoY = parsePercentage(structured.epsYoY);
    if (epsYoY != null) update.latestEPSYoY = epsYoY;

    // Determine quarter label from report date or filing date
    const referenceDate = reportDate || filingDate;
    if (referenceDate) {
      update.latestQuarter = getQuarterLabel(new Date(referenceDate));
    }

    // Only return if we extracted at least one meaningful field
    if (Object.keys(update).length === 0) return null;

    return update;
  } catch (error: any) {
    console.error(`[Company Financials] Error parsing analysis:`, error.message);
    return null;
  }
}
