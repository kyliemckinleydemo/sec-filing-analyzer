import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

    // Build where clause
    const where: any = {
      // Only include filings from last 90 days
      filingDate: {
        gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      },
      // Only include financial filings (10-K, 10-Q, 8-K)
      filingType: {
        in: ['10-K', '10-Q', '8-K']
      }
    };

    // Filter by ticker if specified
    if (ticker) {
      where.company = {
        ticker: ticker
      };
    }

    // Filter by filing type if specified
    if (filingType && filingType !== 'all') {
      where.filingType = filingType;
    }

    // Fetch filings from database
    const filings = await prisma.filing.findMany({
      where,
      include: {
        company: {
          select: {
            ticker: true,
            name: true,
            cik: true,
            currentPrice: true,
            marketCap: true,
            peRatio: true,
            dividendYield: true,
            beta: true,
            latestRevenue: true,
            latestRevenueYoY: true,
            latestNetIncome: true,
            latestNetIncomeYoY: true,
            latestGrossMargin: true,
            latestOperatingMargin: true,
            latestQuarter: true,
            analystTargetPrice: true
          }
        }
      },
      orderBy: {
        filingDate: 'desc'
      },
      take: limit
    });

    // Format response
    const formattedFilings = filings.map(filing => ({
      accessionNumber: filing.accessionNumber,
      ticker: filing.company.ticker,
      companyName: filing.company.name,
      cik: filing.cik,
      filingType: filing.filingType,
      filingDate: filing.filingDate.toISOString().split('T')[0],
      reportDate: filing.reportDate?.toISOString().split('T')[0] || null,
      primaryDocument: filing.filingUrl.split('/').pop(),
      hasXBRL: true, // Our cron only fetches XBRL filings
      filingUrl: filing.filingUrl,
      edgarUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${filing.cik}&type=${filing.filingType}&dateb=&owner=exclude&count=10`,
      // Company snapshot data for hover tooltip
      companySnapshot: {
        currentPrice: filing.company.currentPrice,
        marketCap: filing.company.marketCap,
        peRatio: filing.company.peRatio,
        dividendYield: filing.company.dividendYield,
        beta: filing.company.beta,
        latestRevenue: filing.company.latestRevenue,
        latestRevenueYoY: filing.company.latestRevenueYoY,
        latestNetIncome: filing.company.latestNetIncome,
        latestNetIncomeYoY: filing.company.latestNetIncomeYoY,
        latestGrossMargin: filing.company.latestGrossMargin,
        latestOperatingMargin: filing.company.latestOperatingMargin,
        latestQuarter: filing.company.latestQuarter,
        analystTargetPrice: filing.company.analystTargetPrice
      }
    }));

    return NextResponse.json(formattedFilings);
  } catch (error) {
    console.error('Error fetching latest filings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch latest filings' },
      { status: 500 }
    );
  }
}
