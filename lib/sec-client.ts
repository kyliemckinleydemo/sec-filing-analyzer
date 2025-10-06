/**
 * SEC EDGAR API Client
 *
 * IMPORTANT: SEC requires:
 * 1. User-Agent header with contact info
 * 2. Rate limit: 10 requests/second MAX
 *
 * Reference: https://www.sec.gov/os/webmaster-faq#developers
 */

interface CompanyData {
  cik: string;
  name: string;
  ticker?: string;
  filings: FilingItem[];
}

interface FilingItem {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string;
  form: string;
  primaryDocument: string;
  primaryDocDescription: string;
  filingUrl: string;
}

class SECClient {
  private baseUrl = 'https://data.sec.gov';
  private userAgent = 'SEC Filing Analyzer/1.0 (educational project)';
  private requestQueue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private MIN_INTERVAL = 110; // 110ms = ~9 req/sec (safe margin)

  private padCIK(cik: string): string {
    return cik.padStart(10, '0');
  }

  private async rateLimitedFetch<T>(url: string): Promise<T> {
    // Ensure minimum time between requests
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_INTERVAL) {
      await new Promise(resolve =>
        setTimeout(resolve, this.MIN_INTERVAL - timeSinceLastRequest)
      );
    }

    this.lastRequestTime = Date.now();

    const response = await fetch(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`SEC API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getCompanyByTicker(ticker: string): Promise<{ cik: string; name: string } | null> {
    try {
      // Known CIKs for common tickers (fallback)
      const knownCIKs: Record<string, { cik: string; name: string }> = {
        'AAPL': { cik: '0000320193', name: 'Apple Inc.' },
        'MSFT': { cik: '0000789019', name: 'Microsoft Corporation' },
        'GOOGL': { cik: '0001652044', name: 'Alphabet Inc.' },
        'AMZN': { cik: '0001018724', name: 'Amazon.com, Inc.' },
        'TSLA': { cik: '0001318605', name: 'Tesla, Inc.' },
        'META': { cik: '0001326801', name: 'Meta Platforms, Inc.' },
        'NVDA': { cik: '0001045810', name: 'NVIDIA Corporation' },
        'JPM': { cik: '0000019617', name: 'JPMorgan Chase & Co.' },
        'V': { cik: '0001403161', name: 'Visa Inc.' },
        'WMT': { cik: '0000104169', name: 'Walmart Inc.' },
      };

      // Check if we have a known CIK
      const upperTicker = ticker.toUpperCase();
      if (knownCIKs[upperTicker]) {
        return knownCIKs[upperTicker];
      }

      // Try to fetch from SEC API
      try {
        const url = `${this.baseUrl}/files/company_tickers.json`;
        const data = await this.rateLimitedFetch<Record<string, any>>(url);

        // Find company by ticker
        const company = Object.values(data).find(
          (c: any) => c.ticker?.toUpperCase() === upperTicker
        );

        if (!company) return null;

        return {
          cik: String(company.cik_str).padStart(10, '0'),
          name: company.title,
        };
      } catch (apiError) {
        console.error('SEC API error, using fallback data:', apiError);
        return null;
      }
    } catch (error) {
      console.error('Error fetching company by ticker:', error);
      return null;
    }
  }

  async getCompanyFilings(cik: string, formTypes?: string[]): Promise<CompanyData> {
    const paddedCIK = this.padCIK(cik);
    const url = `${this.baseUrl}/submissions/CIK${paddedCIK}.json`;

    const data = await this.rateLimitedFetch<any>(url);

    const filings = data.filings?.recent || {};
    const allFilings: FilingItem[] = [];

    const accessionNumbers = filings.accessionNumber || [];
    const filingDates = filings.filingDate || [];
    const reportDates = filings.reportDate || [];
    const forms = filings.form || [];
    const primaryDocuments = filings.primaryDocument || [];
    const primaryDocDescriptions = filings.primaryDocDescription || [];

    for (let i = 0; i < accessionNumbers.length; i++) {
      const form = forms[i];

      // Filter by form type if specified
      if (formTypes && !formTypes.includes(form)) continue;

      const accessionNumber = accessionNumbers[i].replace(/-/g, '');

      allFilings.push({
        accessionNumber: accessionNumbers[i],
        filingDate: filingDates[i],
        reportDate: reportDates[i] || undefined,
        form,
        primaryDocument: primaryDocuments[i],
        primaryDocDescription: primaryDocDescriptions[i],
        filingUrl: `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accessionNumber}/${primaryDocuments[i]}`,
      });
    }

    return {
      cik: paddedCIK,
      name: data.name,
      ticker: data.tickers?.[0],
      filings: allFilings,
    };
  }

  async getFilingContent(accessionNumber: string, cik: string): Promise<string> {
    const paddedCIK = this.padCIK(cik);
    const cleanAccession = accessionNumber.replace(/-/g, '');

    // Apply rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_INTERVAL) {
      await new Promise(resolve =>
        setTimeout(resolve, this.MIN_INTERVAL - timeSinceLastRequest)
      );
    }

    this.lastRequestTime = Date.now();

    // Try to fetch the primary document
    const url = `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${paddedCIK}&accession_number=${accessionNumber}&xbrl_type=v`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': this.userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch filing content: ${response.status}`);
    }

    return response.text();
  }

  async getCompanyFacts(cik: string): Promise<any> {
    const paddedCIK = this.padCIK(cik);
    const url = `${this.baseUrl}/api/xbrl/companyfacts/CIK${paddedCIK}.json`;

    try {
      return await this.rateLimitedFetch<any>(url);
    } catch (error) {
      console.error('Error fetching company facts:', error);
      return null;
    }
  }
}

// Export singleton
export const secClient = new SECClient();
export type { CompanyData, FilingItem };
