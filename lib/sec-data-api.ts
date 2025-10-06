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
    'User-Agent': 'SEC Filing Analyzer support@example.com',
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
      const revenueYoY = this.calculateYoYGrowth(gaap['Revenues'] || gaap['RevenueFromContractWithCustomerExcludingAssessedTax'], revenue);
      const netIncomeYoY = this.calculateYoYGrowth(gaap['NetIncomeLoss'], netIncome);
      const epsYoY = this.calculateYoYGrowth(gaap['EarningsPerShareBasic'] || gaap['EarningsPerShareDiluted'], eps);

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
    currentValue: ConceptValue
  ): string | undefined {
    if (!concept?.units) return undefined;

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
