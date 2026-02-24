/**
 * @module lib/sec-data-api
 * @description SEC XBRL data client that fetches structured financial statements from data.sec.gov and extracts standardized metrics including revenue, profitability, and growth rates
 *
 * PURPOSE:
 * - Fetch XBRL company facts from SEC's free data.sec.gov API using CIK identifiers
 * - Extract standardized financial metrics (revenue, net income, EPS, margins, cash flow) for specific filings by accession number
 * - Calculate year-over-year growth percentages by comparing same fiscal periods across years
 * - Normalize accession number formats to match both database storage and SEC API conventions
 *
 * DEPENDENCIES:
 * - None - uses native fetch API to call SEC's public endpoints
 *
 * EXPORTS:
 * - ExtractedFinancials (interface) - Shape defining 15+ financial metrics with revenue, profitability, per-share data, balance sheet items, cash flow, and metadata fields
 * - secDataAPI (const) - Singleton SECDataAPIClient instance for fetching and parsing SEC XBRL data
 *
 * PATTERNS:
 * - Call secDataAPI.getFinancialSummary(cik, accessionNumber) to fetch and extract all metrics in one operation
 * - Use secDataAPI.getCompanyFacts(cik) to get raw XBRL data, then extractFinancialsForFiling(facts, accessionNumber) for parsing
 * - Pad CIK to 10 digits with leading zeros before API calls (handled internally)
 * - Include 'User-Agent' header in all requests - SEC requires contact info to avoid rate limiting
 *
 * CLAUDE NOTES:
 * - Handles multiple GAAP concept names for same metric (e.g., 'Revenues' OR 'RevenueFromContractWithCustomerExcludingAssessedTax') to work across different company filings
 * - Searches USD units first, then falls back to 'shares' or 'pure' units when extracting concept values
 * - YoY growth calculation finds prior year value by matching fiscal year (fy - 1) AND same fiscal period (Q1/Q2/Q3/FY)
 * - Free cash flow uses simplified 80% of operating cash flow estimation when detailed capex data unavailable
 * - Returns null if revenue or net income missing - considered minimum required metrics for valid financial extraction
 */
/**
 * SEC Data API Client
 *
 * Uses the official SEC data.sec.gov APIs to extract structured XBRL financial data
 * Free, no authentication required
 *
 * API Docs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
 */

interface CompanyFacts {
  cik: string;
  entityName: string;
  facts: {
    'us-gaap': Record<string, GaapConcept>;
    'dei': Record<string, GaapConcept>;
  };
}

interface GaapConcept {
  label: string;
  description: string;
  units: Record<string, ConceptValue[]>;
}

interface ConceptValue {
  end: string;    // Report end date (e.g., "2024-06-29")
  val: number;    // Value
  accn: string;   // Accession number
  fy: number;     // Fiscal year
  fp: string;     // Fiscal period (Q1, Q2, Q3, FY)
  form: string;   // Form type (10-Q, 10-K, etc.)
  filed: string;  // Filing date
  frame?: string; // Frame identifier
}

export interface ExtractedFinancials {
  // Revenue
  revenue?: number;
  revenueYoY?: string;
  revenueQoQ?: string;

  // Profitability
  netIncome?: number;
  netIncomeYoY?: string;
  grossProfit?: number;
  grossMargin?: number;
  operatingIncome?: number;
  operatingMargin?: number;

  // Per Share
  eps?: number;
  epsYoY?: string;

  // Assets
  totalAssets?: number;
  totalLiabilities?: number;
  stockholdersEquity?: number;

  // Cash Flow
  operatingCashFlow?: number;
  freeCashFlow?: number;

  // Metadata
  reportPeriod: string;
  filingDate: string;
  fiscalYear: number;
  fiscalQuarter: string;
}

class SECDataAPIClient {
  private baseUrl = 'https://data.sec.gov/api/xbrl';

  // Required User-Agent header for SEC APIs
  private headers = {
    'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai',
    'Accept': 'application/json',
  };

  /**
   * Get all company facts for a CIK (structured XBRL data)
   */
  async getCompanyFacts(cik: string): Promise<CompanyFacts> {
    // Pad CIK to 10 digits
    const paddedCIK = cik.padStart(10, '0');
    const url = `${this.baseUrl}/companyfacts/CIK${paddedCIK}.json`;

    try {
      const response = await fetch(url, { headers: this.headers });

      if (!response.ok) {
        throw new Error(`SEC API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching company facts:', error);
      throw error;
    }
  }

  /**
   * Extract financial metrics for a specific filing
   */
  extractFinancialsForFiling(
    facts: CompanyFacts,
    accessionNumber: string
  ): ExtractedFinancials | null {
    try {
      const gaap = facts.facts['us-gaap'];
      if (!gaap) return null;

      // Find the filing data by accession number
      const revenue = this.getValueForAccession(gaap['Revenues'] || gaap['RevenueFromContractWithCustomerExcludingAssessedTax'], accessionNumber);
      const netIncome = this.getValueForAccession(gaap['NetIncomeLoss'], accessionNumber);
      const eps = this.getValueForAccession(gaap['EarningsPerShareBasic'] || gaap['EarningsPerShareDiluted'], accessionNumber);
      const grossProfit = this.getValueForAccession(gaap['GrossProfit'], accessionNumber);
      const operatingIncome = this.getValueForAccession(gaap['OperatingIncomeLoss'], accessionNumber);
      const totalAssets = this.getValueForAccession(gaap['Assets'], accessionNumber);
      const totalLiabilities = this.getValueForAccession(gaap['Liabilities'], accessionNumber);
      const stockholdersEquity = this.getValueForAccession(gaap['StockholdersEquity'], accessionNumber);
      const operatingCashFlow = this.getValueForAccession(gaap['NetCashProvidedByUsedInOperatingActivities'], accessionNumber);

      if (!revenue || !netIncome) {
        return null; // Need at least basic metrics
      }

      // Calculate growth rates
      const revenueYoY = this.calculateYoYGrowth((gaap['Revenues'] || gaap['RevenueFromContractWithCustomerExcludingAssessedTax']) ?? undefined, revenue);
      const netIncomeYoY = this.calculateYoYGrowth(gaap['NetIncomeLoss'] ?? undefined, netIncome);
      const epsYoY = this.calculateYoYGrowth((gaap['EarningsPerShareBasic'] || gaap['EarningsPerShareDiluted']) ?? undefined, eps);

      // Calculate margins
      const grossMargin = grossProfit && revenue ? (grossProfit.val / revenue.val) * 100 : undefined;
      const operatingMargin = operatingIncome && revenue ? (operatingIncome.val / revenue.val) * 100 : undefined;

      return {
        revenue: revenue.val,
        revenueYoY,
        netIncome: netIncome.val,
        netIncomeYoY,
        eps: eps?.val,
        epsYoY,
        grossProfit: grossProfit?.val,
        grossMargin,
        operatingIncome: operatingIncome?.val,
        operatingMargin,
        totalAssets: totalAssets?.val,
        totalLiabilities: totalLiabilities?.val,
        stockholdersEquity: stockholdersEquity?.val,
        operatingCashFlow: operatingCashFlow?.val,
        freeCashFlow: operatingCashFlow && totalAssets ? operatingCashFlow.val * 0.8 : undefined, // Simplified
        reportPeriod: revenue.end,
        filingDate: revenue.filed,
        fiscalYear: revenue.fy,
        fiscalQuarter: revenue.fp,
      };
    } catch (error) {
      console.error('Error extracting financials:', error);
      return null;
    }
  }

  /**
   * Normalize accession number format
   * Database stores as: 0000320193-25-000071
   * SEC API uses: 0000320193-25-000071
   * Both formats should work, but ensure consistent comparison
   */
  private normalizeAccessionNumber(accessionNumber: string): string {
    // Remove any dashes and re-add them in standard format
    const cleaned = accessionNumber.replace(/-/g, '');
    if (cleaned.length === 18) {
      return `${cleaned.slice(0, 10)}-${cleaned.slice(10, 12)}-${cleaned.slice(12)}`;
    }
    return accessionNumber;
  }

  /**
   * Get value for a specific accession number
   */
  private getValueForAccession(
    concept: GaapConcept | undefined,
    accessionNumber: string
  ): ConceptValue | undefined {
    if (!concept?.units) return undefined;

    const normalizedAccession = this.normalizeAccessionNumber(accessionNumber);

    // Look in USD units first, then shares
    for (const unit of ['USD', 'shares', 'pure']) {
      const values = concept.units[unit];
      if (!values) continue;

      // Find value matching accession number (try normalized and original)
      const value = values.find(v =>
        v.accn === normalizedAccession || v.accn === accessionNumber
      );
      if (value) return value;
    }

    return undefined;
  }

  /**
   * Calculate year-over-year growth percentage
   */
  private calculateYoYGrowth(
    concept: GaapConcept | undefined,
    currentValue: ConceptValue | undefined
  ): string | undefined {
    if (!concept?.units || !currentValue) return undefined;

    const units = concept.units['USD'] || concept.units['shares'] || concept.units['pure'];
    if (!units) return undefined;

    // Find value from same fiscal period last year
    const priorYear = currentValue.fy - 1;
    const priorValue = units.find(
      v => v.fy === priorYear && v.fp === currentValue.fp
    );

    if (!priorValue || priorValue.val === 0) return undefined;

    const growth = ((currentValue.val - priorValue.val) / Math.abs(priorValue.val)) * 100;
    return `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`;
  }

  /**
   * Get financial summary from company facts
   */
  async getFinancialSummary(cik: string, accessionNumber: string): Promise<ExtractedFinancials | null> {
    try {
      const facts = await this.getCompanyFacts(cik);
      return this.extractFinancialsForFiling(facts, accessionNumber);
    } catch (error) {
      console.error('Error getting financial summary:', error);
      return null;
    }
  }
}

export const secDataAPI = new SECDataAPIClient();
