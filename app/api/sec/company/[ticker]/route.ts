import { NextRequest, NextResponse } from 'next/server';
import { secClient } from '@/lib/sec-client';
import { cache, cacheKeys } from '@/lib/cache';
import { prisma } from '@/lib/prisma';
import { hasFinancialData } from '@/lib/filing-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    // Check cache first
    const cacheKey = `company:${ticker.toUpperCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Get company by ticker
    const companyInfo = await secClient.getCompanyByTicker(ticker);

    if (!companyInfo) {
      return NextResponse.json({
        error: `Company with ticker "${ticker.toUpperCase()}" not found. Please verify the ticker symbol is correct and that the company files with the SEC.`
      }, { status: 404 });
    }

    // Get filings (limit to 10-K, 10-Q, 8-K)
    const filings = await secClient.getCompanyFilings(companyInfo.cik, [
      '10-K',
      '10-Q',
      '8-K',
    ]);

    // Store in database if not exists (lookup by ticker since CIK is not unique)
    let company = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() },
    });

    if (!company) {
      company = await prisma.company.create({
        data: {
          cik: companyInfo.cik,
          ticker: ticker.toUpperCase(),
          name: companyInfo.name,
        },
      });
    }

    // Store recent filings in database
    for (const filing of filings.filings.slice(0, 10)) {
      // Only store last 10
      await prisma.filing.upsert({
        where: { accessionNumber: filing.accessionNumber },
        create: {
          companyId: company.id,
          cik: companyInfo.cik,
          accessionNumber: filing.accessionNumber,
          filingType: filing.form,
          filingDate: new Date(filing.filingDate),
          reportDate: filing.reportDate ? new Date(filing.reportDate) : null,
          filingUrl: filing.filingUrl,
        },
        update: {},
      });
    }

    // v1.0: Filter to only filings with financial data
    // First, fetch stored filings with analysis data to check for financial data
    const storedFilings = await prisma.filing.findMany({
      where: {
        companyId: company.id,
        analysisData: { not: null },
      },
      select: {
        accessionNumber: true,
        filingType: true,
        analysisData: true,
      },
    });

    // Create a map of filings with financial data
    const financialFilingAccessions = new Set(
      storedFilings
        .filter(f => hasFinancialData(f))
        .map(f => f.accessionNumber)
    );

    // Filter SEC filings to only include those with financial data (if analyzed)
    const filteredFilings = filings.filings
      .slice(0, 20)
      .map(filing => ({
        ...filing,
        hasFinancialData: financialFilingAccessions.has(filing.accessionNumber),
      }))
      .filter(filing =>
        // Include if not yet analyzed OR if has financial data
        !storedFilings.find(sf => sf.accessionNumber === filing.accessionNumber) ||
        filing.hasFinancialData
      );

    const result = {
      company: {
        cik: companyInfo.cik,
        ticker: ticker.toUpperCase(),
        name: companyInfo.name,
      },
      filings: filteredFilings,
      totalFilingsWithData: financialFilingAccessions.size,
    };

    // Cache for 1 hour
    cache.set(cacheKey, result, 3600000);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching company:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch company data' },
      { status: 500 }
    );
  }
}
