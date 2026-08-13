/**
 * @module lib/filings-server
 * @description Server-side filings query shared by the /api/filings/latest route and
 * server-rendered pages (home, latest-filings). Returns the exact response shape the
 * frontend already consumes so pages can pass it as initial data for SSR.
 */
import { prisma } from '@/lib/prisma';
import { hasFinancials } from '@/lib/has-financials';

export interface LatestFilingsParams {
  limit?: number;
  page?: number;
  ticker?: string;
  filingType?: string;
}

export interface FormattedFiling {
  accessionNumber: string;
  ticker: string;
  companyName: string;
  cik: string;
  filingType: string;
  filingDate: string;
  reportDate: string | null;
  primaryDocument: string | undefined;
  hasXBRL: boolean;
  filingUrl: string;
  edgarUrl: string;
  predicted30dAlpha: number | null;
  predictionConfidence: number | null;
  concernLevel: number | null;
  companySnapshot: {
    currentPrice: number | null;
    marketCap: number | null;
    peRatio: number | null;
    dividendYield: number | null;
    beta: number | null;
    latestRevenue: number | null;
    latestRevenueYoY: number | null;
    latestNetIncome: number | null;
    latestNetIncomeYoY: number | null;
    latestGrossMargin: number | null;
    latestOperatingMargin: number | null;
    latestQuarter: string | null;
    analystTargetPrice: number | null;
  };
}

export interface LatestFilingsResult {
  filings: FormattedFiling[];
  pagination: {
    totalCount: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  };
}

export async function getLatestFilings(params: LatestFilingsParams = {}): Promise<LatestFilingsResult> {
  const pageSize = params.limit ?? 50;
  const page = params.page ?? 1;
  const ticker = params.ticker?.toUpperCase();
  const filingType = params.filingType;

  const where: any = {
    filingDate: {
      gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    },
    filingType: {
      in: ['10-K', '10-Q', '8-K']
    }
  };

  if (ticker) {
    where.company = { is: { ticker } };
  }

  if (filingType && filingType !== 'all') {
    where.filingType = filingType;
  }

  const totalCount = await prisma.filing.count({ where });
  const totalPages = Math.ceil(totalCount / pageSize);
  const skip = (page - 1) * pageSize;

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
    orderBy: { filingDate: 'desc' },
    skip,
    take: pageSize
  });

  const formattedFilings: FormattedFiling[] = filings.map(filing => {
    const cikPadded = filing.cik.padStart(10, '0');
    const hasFinancialData = hasFinancials({
      filingType: filing.filingType,
      analysisData: filing.analysisData
    });

    return {
      accessionNumber: filing.accessionNumber,
      ticker: filing.company.ticker,
      companyName: filing.company.name,
      cik: filing.cik,
      filingType: filing.filingType,
      filingDate: filing.filingDate.toISOString(),
      reportDate: filing.reportDate?.toISOString() || null,
      primaryDocument: filing.filingUrl.split('/').pop(),
      hasXBRL: hasFinancialData,
      filingUrl: filing.filingUrl,
      edgarUrl: `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${cikPadded}&accession_number=${filing.accessionNumber}&xbrl_type=v`,
      predicted30dAlpha: filing.predicted30dAlpha,
      predictionConfidence: filing.predictionConfidence,
      concernLevel: filing.concernLevel,
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

  return {
    filings: formattedFilings,
    pagination: { totalCount, totalPages, currentPage: page, pageSize }
  };
}
