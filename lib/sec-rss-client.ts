/**
 * SEC RSS Feed and Daily Index Client
 *
 * Efficiently fetches SEC filings using:
 * - RSS feeds for real-time updates
 * - Daily index files for catch-up (missed days)
 * - Filters for top 1,000 companies only
 */

import { TOP_1000_TICKERS } from './top1000-tickers';

export interface SECFiling {
  accessionNumber: string;
  cik: string;
  ticker: string;
  companyName: string;
  formType: string;
  filingDate: string;
  reportDate?: string;
  filingUrl: string;
}

export class SECRSSClient {
  private readonly BASE_URL = 'https://www.sec.gov';
  private readonly USER_AGENT = 'SEC Filing Analyzer contact@bluecomet.ai';

  // Create a Set for fast ticker lookups
  private readonly TICKER_SET = new Set(TOP_1000_TICKERS.map(t => t.toUpperCase()));

  // Create a map of CIK to ticker for quick lookups
  private cikToTickerMap = new Map<string, string>();

  /**
   * Fetch recent filings from SEC RSS feed
   * Much faster than individual API calls - gets all recent filings in one request
   */
  async fetchRecentFilingsFromRSS(formTypes: string[] = ['10-K', '10-Q', '8-K']): Promise<SECFiling[]> {
    const filings: SECFiling[] = [];

    // RSS feed can filter by form type
    for (const formType of formTypes) {
      const url = `${this.BASE_URL}/cgi-bin/browse-edgar?action=getcurrent&type=${formType}&company=&dateb=&owner=include&start=0&count=100&output=atom`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'application/atom+xml',
        },
      });

      if (!response.ok) {
        throw new Error(`SEC RSS feed error: ${response.statusText}`);
      }

      const xmlText = await response.text();
      const parsedFilings = await this.parseRSSFeed(xmlText, formType);

      // Only include filings from our top 1,000 companies
      filings.push(...parsedFilings.filter(f => this.TICKER_SET.has(f.ticker.toUpperCase())));

      // Rate limit: SEC requests 10 requests per second
      await this.delay(100);
    }

    return filings;
  }

  /**
   * Fetch filings from SEC daily index files for catch-up
   * Use when cron job misses 1-30 days
   */
  async fetchFromDailyIndex(date: Date, formTypes: string[] = ['10-K', '10-Q', '8-K']): Promise<SECFiling[]> {
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const dateStr = this.formatDate(date);

    // Example: https://www.sec.gov/Archives/edgar/daily-index/2025/QTR4/master.20251010.idx
    const url = `${this.BASE_URL}/Archives/edgar/daily-index/${year}/QTR${quarter}/master.${dateStr}.idx`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': this.USER_AGENT,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // No filings for this date (weekend/holiday)
        return [];
      }
      throw new Error(`SEC daily index error: ${response.statusText}`);
    }

    const indexText = await response.text();
    return await this.parseDailyIndex(indexText, formTypes);
  }

  /**
   * Catch-up: Fetch missed days of filings
   */
  async fetchMissedDays(startDate: Date, endDate: Date, formTypes: string[] = ['10-K', '10-Q', '8-K']): Promise<SECFiling[]> {
    const filings: SECFiling[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      // Skip weekends
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        try {
          const dayFilings = await this.fetchFromDailyIndex(currentDate, formTypes);
          filings.push(...dayFilings);
          console.log(`[Catch-up] ${this.formatDate(currentDate)}: Found ${dayFilings.length} filings`);
        } catch (error: any) {
          console.error(`[Catch-up] ${this.formatDate(currentDate)}: ${error.message}`);
        }

        // Rate limit
        await this.delay(100);
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return filings;
  }

  /**
   * Parse RSS feed XML
   */
  private async parseRSSFeed(xmlText: string, formType: string): Promise<SECFiling[]> {
    const filings: SECFiling[] = [];

    // Simple regex parsing (for production, consider using an XML parser library)
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    const entries = xmlText.match(entryRegex) || [];

    for (const entry of entries) {
      try {
        const title = entry.match(/<title>(.*?)<\/title>/)?.[1] || '';
        const link = entry.match(/<link[^>]*href="([^"]*)"[^>]*>/)?.[1] || '';
        const updated = entry.match(/<updated>(.*?)<\/updated>/)?.[1] || '';

        // Title format: "10-K - APPLE INC (0000320193) (Filer)"
        const titleMatch = title.match(/^([^\-]+)\s*-\s*(.+?)\s*\((\d+)\)/);
        if (!titleMatch) continue;

        const [, form, companyName, cik] = titleMatch;
        const ticker = await this.getCIKToTicker(cik.padStart(10, '0'));

        if (!ticker || !this.TICKER_SET.has(ticker.toUpperCase())) {
          continue; // Skip if not in our top 1,000
        }

        filings.push({
          accessionNumber: this.extractAccessionNumber(link),
          cik: cik.padStart(10, '0'),
          ticker,
          companyName: companyName.trim(),
          formType: form.trim(),
          filingDate: updated.split('T')[0],
          filingUrl: link.startsWith('http') ? link : `${this.BASE_URL}${link}`,
        });
      } catch (error) {
        console.error('Error parsing RSS entry:', error);
      }
    }

    return filings;
  }

  /**
   * Parse daily index file
   * Format: Company Name|Form Type|CIK|Date Filed|File Name
   */
  private async parseDailyIndex(indexText: string, formTypes: string[]): Promise<SECFiling[]> {
    const filings: SECFiling[] = [];
    const lines = indexText.split('\n');

    // Skip header lines (first 11 lines are headers)
    for (let i = 11; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Split by pipe delimiter
      const parts = line.split('|');
      if (parts.length < 5) continue;

      const [companyName, formType, cik, dateStr, fileName] = parts.map(p => p.trim());

      // Filter by form type
      if (!formTypes.includes(formType)) continue;

      const ticker = await this.getCIKToTicker(cik.padStart(10, '0'));
      if (!ticker || !this.TICKER_SET.has(ticker.toUpperCase())) {
        continue; // Skip if not in our top 1,000
      }

      const accessionNumber = fileName.split('/').pop()?.replace('.txt', '') || '';

      filings.push({
        accessionNumber,
        cik: cik.padStart(10, '0'),
        ticker,
        companyName,
        formType,
        filingDate: dateStr,
        filingUrl: `${this.BASE_URL}/Archives/${fileName}`,
      });
    }

    return filings;
  }

  /**
   * Get ticker for a CIK (cached lookup)
   */
  private async getCIKToTicker(cik: string): Promise<string | null> {
    // Check cache first
    if (this.cikToTickerMap.has(cik)) {
      return this.cikToTickerMap.get(cik) || null;
    }

    // Fetch from SEC company tickers JSON (one-time load)
    if (this.cikToTickerMap.size === 0) {
      await this.loadCIKMapping();
    }

    return this.cikToTickerMap.get(cik) || null;
  }

  /**
   * Load CIK to ticker mapping from SEC
   */
  private async loadCIKMapping(): Promise<void> {
    try {
      const response = await fetch('https://www.sec.gov/files/company_tickers.json', {
        headers: {
          'User-Agent': this.USER_AGENT,
        },
      });

      if (!response.ok) return;

      const data = await response.json();

      // Format: { "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}, ... }
      for (const key in data) {
        const entry = data[key];
        const cik = String(entry.cik_str).padStart(10, '0');
        const ticker = entry.ticker;
        this.cikToTickerMap.set(cik, ticker);
      }
    } catch (error) {
      console.error('Error loading CIK mapping:', error);
    }
  }

  /**
   * Extract accession number from URL
   */
  private extractAccessionNumber(url: string): string {
    const match = url.match(/accession[=\/]([0-9-]+)/i);
    return match ? match[1] : '';
  }

  /**
   * Format date as YYYYMMDD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const secRSSClient = new SECRSSClient();
