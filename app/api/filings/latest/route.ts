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

// Disable caching for this dynamic route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageSize = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const ticker = searchParams.get('ticker')?.toUpperCase();
    const filingType = searchParams.get('filingType');

    // Build where clause
    const where: any = {
      // Only include filings from last 180 days
      filingDate: {
        gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
      },
      // Only include financial filings (10-K, 10-Q, 8-K)
      filingType: {
        in: ['10-K', '10-Q', '8-K']
      }
    };

    // Filter by ticker if specified
    if (ticker) {
      where.company = {
        is: {
          ticker: ticker
        }
      };
    }

    // Filter by filing type if specified
    if (filingType && filingType !== 'all') {
      where.filingType = filingType;
    }

    // Get total count for pagination
    const totalCount = await prisma.filing.count({ where });

    // Calculate pagination
    const totalPages = Math.ceil(totalCount / pageSize);
    const skip = (page - 1) * pageSize;

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
      skip: skip,
      take: pageSize
    });

    // Format response
    const formattedFilings = filings.map(filing => {
      // Build proper SEC EDGAR viewer URL (removes dashes from accession number for URL)
      const accessionNoDashes = filing.accessionNumber.replace(/-/g, '');
      const cikPadded = filing.cik.padStart(10, '0');

      return {
        accessionNumber: filing.accessionNumber,
        ticker: filing.company.ticker,
        companyName: filing.company.name,
        cik: filing.cik,
        filingType: filing.filingType, // Fixed: match frontend expectation
        filingDate: filing.filingDate.toISOString(), // Fixed: return full ISO string for frontend parsing
        reportDate: filing.reportDate?.toISOString() || null, // Fixed: return full ISO string
        primaryDocument: filing.filingUrl.split('/').pop(),
        hasXBRL: true, // Our cron only fetches XBRL filings
        filingUrl: filing.filingUrl,
        // Use SEC's iXBRL viewer for better rendering
        edgarUrl: `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${cikPadded}&accession_number=${filing.accessionNumber}&xbrl_type=v`,
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
    };
    });

    return NextResponse.json({
      filings: formattedFilings,
      pagination: {
        totalCount,
        totalPages,
        currentPage: page,
        pageSize
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    console.error('Error fetching latest filings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch latest filings' },
      { status: 500 }
    );
  }
}
