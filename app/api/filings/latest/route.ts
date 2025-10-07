import { NextResponse } from 'next/server';

// Load our tracked companies
const TRACKED_COMPANIES = require('@/config/top-500-companies.json');

interface SECFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  acceptanceDateTime: string;
  act: string;
  form: string;
  fileNumber: string;
  filmNumber: string;
  items: string;
  size: number;
  isXBRL: number;
  isInlineXBRL: number;
  primaryDocument: string;
  primaryDocDescription: string;
}

interface SECCompanyFilings {
  cik: string;
  entityType: string;
  sic: string;
  sicDescription: string;
  insiderTransactionForOwnerExists: number;
  insiderTransactionForIssuerExists: number;
  name: string;
  tickers: string[];
  exchanges: string[];
  ein: string;
  description: string;
  website: string;
  investorWebsite: string;
  category: string;
  fiscalYearEnd: string;
  stateOfIncorporation: string;
  stateOfIncorporationDescription: string;
  addresses: {
    mailing?: any;
    business?: any;
  };
  phone: string;
  flags: string;
  formerNames: any[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      acceptanceDateTime: string[];
      act: string[];
      form: string[];
      fileNumber: string[];
      filmNumber: string[];
      items: string[];
      size: number[];
      isXBRL: number[];
      isInlineXBRL: number[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
    files: any[];
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const ticker = searchParams.get('ticker')?.toUpperCase();
    const filingType = searchParams.get('filingType');

    const SEC_HEADERS = {
      'User-Agent': 'SEC Filing Analyzer research@example.com',
    };

    // Get list of companies to fetch
    const companiesToFetch = ticker
      ? TRACKED_COMPANIES.tickers.filter((t: string) => t === ticker)
      : TRACKED_COMPANIES.tickers.slice(0, 50); // Fetch first 50 companies for performance

    const allFilings: any[] = [];

    // Fetch recent filings for each company
    for (const companyTicker of companiesToFetch) {
      const cik = TRACKED_COMPANIES.cikMap[companyTicker];
      if (!cik) continue;

      try {
        // Fetch company filings from SEC
        const response = await fetch(
          `https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`,
          { headers: SEC_HEADERS }
        );

        if (!response.ok) continue;

        const data: SECCompanyFilings = await response.json();
        const recent = data.filings.recent;

        // Process recent filings
        for (let i = 0; i < Math.min(5, recent.accessionNumber.length); i++) {
          const form = recent.form[i];

          // Only include financial filings (10-K, 10-Q, 8-K)
          if (!['10-K', '10-Q', '8-K'].includes(form)) continue;

          // Filter by filing type if specified
          if (filingType && form !== filingType) continue;

          // Only include filings with XBRL data (means they have financials)
          if (recent.isXBRL[i] === 0 && recent.isInlineXBRL[i] === 0) continue;

          const accessionNumber = recent.accessionNumber[i];
          const filingDate = recent.filingDate[i];

          // Only include filings from last 90 days
          const daysSinceFiling = Math.floor(
            (Date.now() - new Date(filingDate).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceFiling > 90) continue;

          allFilings.push({
            accessionNumber,
            ticker: companyTicker,
            companyName: data.name,
            cik: data.cik,
            filingType: form,
            filingDate,
            reportDate: recent.reportDate[i],
            primaryDocument: recent.primaryDocument[i],
            hasXBRL: recent.isXBRL[i] === 1 || recent.isInlineXBRL[i] === 1,
            filingUrl: `https://www.sec.gov/Archives/edgar/data/${data.cik}/${accessionNumber.replace(/-/g, '')}/${recent.primaryDocument[i]}`,
            edgarUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${data.cik}&type=${form}&dateb=&owner=exclude&count=10`,
          });
        }

        // Rate limit: 10 requests per second max
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error fetching filings for ${companyTicker}:`, error);
        continue;
      }
    }

    // Sort by filing date (newest first)
    allFilings.sort((a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime());

    // Return limited results
    return NextResponse.json(allFilings.slice(0, limit));
  } catch (error) {
    console.error('Error fetching latest filings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch latest filings' },
      { status: 500 }
    );
  }
}
