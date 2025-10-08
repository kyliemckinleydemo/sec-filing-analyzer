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

  // In-memory cache for company tickers (loaded once, cached for session)
  private tickerCache: Record<string, any> | null = null;
  private tickerCacheExpiry: number = 0;
  private readonly TICKER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

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

  /**
   * Load all company tickers from SEC API with caching
   * The SEC endpoint contains ~15,000 companies and rarely changes
   *
   * NOTE: Uses www.sec.gov which has stricter rate limits
   * Consider using submissions API or local ticker cache file instead
   */
  private async loadTickerData(): Promise<Record<string, any>> {
    // Return cached data if still valid
    const now = Date.now();
    if (this.tickerCache && now < this.tickerCacheExpiry) {
      console.log(`[SEC Client] Using cached ticker data (${Object.keys(this.tickerCache).length} companies)`);
      return this.tickerCache;
    }

    console.log(`[SEC Client] Loading fresh ticker data from SEC...`);

    // Try multiple endpoints with retry logic
    const endpoints = [
      'https://www.sec.gov/files/company_tickers.json',
      'https://www.sec.gov/files/company_tickers_exchange.json',
    ];

    // Add rate limiting before fetching ticker data
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_INTERVAL) {
      await new Promise(resolve =>
        setTimeout(resolve, this.MIN_INTERVAL - timeSinceLastRequest)
      );
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      for (const url of endpoints) {
        try {
          console.log(`[SEC Client] Attempt ${attempt + 1}: Fetching from ${url}...`);

          this.lastRequestTime = Date.now();
          const response = await fetch(url, {
            headers: {
              'User-Agent': this.userAgent,
              'Accept': 'application/json',
            },
          });

          if (!response.ok) {
            console.warn(`[SEC Client] Failed: ${response.status} ${response.statusText}`);

            // If rate limited, wait longer before retry
            if (response.status === 403 || response.status === 429) {
              console.log(`[SEC Client] Rate limited, waiting 5s before retry...`);
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
            continue;
          }

          const data = await response.json();
          const companyCount = Object.keys(data).length;
          console.log(`[SEC Client] ✅ Successfully loaded ${companyCount} companies`);

          // Cache the data
          this.tickerCache = data;
          this.tickerCacheExpiry = now + this.TICKER_CACHE_TTL;

          return data;
        } catch (error: any) {
          console.warn(`[SEC Client] Error fetching from ${url}:`, error.message);
        }
      }

      // Wait before retry (exponential backoff)
      if (attempt < 2) {
        const waitTime = Math.pow(2, attempt) * 2000; // Increased from 1000ms to 2000ms
        console.log(`[SEC Client] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw new Error('Failed to load ticker data from SEC after multiple attempts. The SEC may be rate limiting requests. Please try again in a few minutes.');
  }

  async getCompanyByTicker(ticker: string): Promise<{ cik: string; name: string } | null> {
    try {
      const upperTicker = ticker.toUpperCase();
      console.log(`[SEC Client] Looking up ticker: ${upperTicker}`);

      // Load ticker data (will use cache if available)
      const tickerData = await this.loadTickerData();

      // Find company by ticker
      const company = Object.values(tickerData).find(
        (c: any) => c.ticker?.toUpperCase() === upperTicker
      );

      if (!company) {
        console.log(`[SEC Client] ❌ Ticker ${upperTicker} not found in SEC database`);
        return null;
      }

      const result = {
        cik: String(company.cik_str).padStart(10, '0'),
        name: company.title,
      };

      console.log(`[SEC Client] ✅ Found: ${result.name} (CIK: ${result.cik})`);
      return result;
    } catch (error: any) {
      console.error(`[SEC Client] Error fetching company by ticker:`, error.message || error);
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

  /**
   * Get filing content using SEC XBRL Data API instead of HTML scraping
   * This method now returns structured data, not HTML
   */
  async getFilingContent(accessionNumber: string, cik: string): Promise<string> {
    const paddedCIK = this.padCIK(cik);

    // Use Company Facts API to get structured XBRL data
    try {
      const facts = await this.getCompanyFacts(cik);
      if (!facts || !facts.facts) {
        throw new Error('No XBRL data available for this filing');
      }

      // Extract relevant financial data and format as text
      const usGaap = facts.facts['us-gaap'] || {};
      let content = `Company: ${facts.entityName}\nCIK: ${paddedCIK}\n\n`;

      // Add revenue data
      if (usGaap.Revenues || usGaap.RevenueFromContractWithCustomerExcludingAssessedTax) {
        const revenueData = usGaap.Revenues || usGaap.RevenueFromContractWithCustomerExcludingAssessedTax;
        content += 'Revenue Data:\n';
        const units = revenueData.units?.USD || [];
        units.slice(-4).forEach((u: any) => {
          content += `  ${u.end}: $${(u.val / 1e9).toFixed(2)}B (filed: ${u.filed})\n`;
        });
        content += '\n';
      }

      // Add net income
      if (usGaap.NetIncomeLoss) {
        content += 'Net Income:\n';
        const units = usGaap.NetIncomeLoss.units?.USD || [];
        units.slice(-4).forEach((u: any) => {
          content += `  ${u.end}: $${(u.val / 1e9).toFixed(2)}B (filed: ${u.filed})\n`;
        });
        content += '\n';
      }

      // Add EPS
      if (usGaap.EarningsPerShareDiluted || usGaap.EarningsPerShareBasic) {
        const epsData = usGaap.EarningsPerShareDiluted || usGaap.EarningsPerShareBasic;
        content += 'Earnings Per Share:\n';
        const units = epsData.units?.['USD/shares'] || [];
        units.slice(-4).forEach((u: any) => {
          content += `  ${u.end}: $${u.val.toFixed(2)} (filed: ${u.filed})\n`;
        });
        content += '\n';
      }

      return content;
    } catch (error) {
      console.error('Error fetching XBRL data:', error);
      throw new Error(`Failed to fetch structured filing data: ${error}`);
    }
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
