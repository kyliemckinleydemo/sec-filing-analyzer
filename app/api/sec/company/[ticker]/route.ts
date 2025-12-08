import { NextRequest, NextResponse } from 'next/server';
import { secClient } from '@/lib/sec-client';
import { cache, cacheKeys } from '@/lib/cache';
import { prisma } from '@/lib/prisma';
import { hasFinancialData } from '@/lib/filing-utils';
import yahooFinance from 'yahoo-finance2';
import { requireUnauthRateLimit, addRateLimitHeaders } from '@/lib/api-middleware';
import { generateFingerprint, checkUnauthRateLimit } from '@/lib/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    // Check rate limit for unauthenticated users (20 requests/day)
    // Authenticated users bypass this limit
    const rateLimitCheck = await requireUnauthRateLimit(request);
    if (!rateLimitCheck.allowed) {
      return rateLimitCheck.response!;
    }

    // Get rate limit info for response headers
    const fingerprint = generateFingerprint(request);
    const rateLimit = checkUnauthRateLimit(fingerprint);

    // Check cache first
    const cacheKey = `company:${ticker.toUpperCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      const response = NextResponse.json(cached);
      if (!rateLimitCheck.session) {
        return addRateLimitHeaders(response, rateLimit.limit, rateLimit.remaining, rateLimit.resetAt);
      }
      return response;
    }

    // FAST PATH: Check if we already track this company in our database
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const existingCompany = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() },
      include: {
        filings: {
          where: {
            filingDate: { gte: oneYearAgo }
          },
          orderBy: { filingDate: 'desc' },
          take: 20,
        },
      },
    });

    // If we track it and have filings, return immediately (fast!)
    if (existingCompany && existingCompany.filings.length > 0) {
      // Fetch recent analyst activity
      const recentAnalystActivity = await prisma.analystActivity.findMany({
        where: { companyId: existingCompany.id },
        orderBy: { activityDate: 'desc' },
        take: 10,
      });

      const result = {
        company: {
          cik: existingCompany.cik,
          ticker: existingCompany.ticker,
          name: existingCompany.name,
          sector: existingCompany.sector,
          industry: existingCompany.industry,
          // Market data
          marketCap: existingCompany.marketCap,
          currentPrice: existingCompany.currentPrice,
          peRatio: existingCompany.peRatio,
          forwardPE: existingCompany.forwardPE,
          fiftyTwoWeekHigh: existingCompany.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: existingCompany.fiftyTwoWeekLow,
          analystTargetPrice: existingCompany.analystTargetPrice,
          dividendYield: existingCompany.dividendYield,
          beta: existingCompany.beta,
          volume: existingCompany.volume ? Number(existingCompany.volume) : null,
          averageVolume: existingCompany.averageVolume ? Number(existingCompany.averageVolume) : null,
          analystRating: existingCompany.analystRating,
          analystRatingCount: existingCompany.analystRatingCount,
          // Latest financials
          latestRevenue: existingCompany.latestRevenue,
          latestRevenueYoY: existingCompany.latestRevenueYoY,
          latestNetIncome: existingCompany.latestNetIncome,
          latestNetIncomeYoY: existingCompany.latestNetIncomeYoY,
          latestEPS: existingCompany.latestEPS,
          latestEPSYoY: existingCompany.latestEPSYoY,
          latestGrossMargin: existingCompany.latestGrossMargin,
          latestOperatingMargin: existingCompany.latestOperatingMargin,
          latestQuarter: existingCompany.latestQuarter,
        },
        filings: existingCompany.filings.map(f => ({
          accessionNumber: f.accessionNumber,
          form: f.filingType,
          filingDate: f.filingDate.toISOString().split('T')[0],
          reportDate: f.reportDate?.toISOString().split('T')[0],
          primaryDocDescription: f.filingType,
          filingUrl: f.filingUrl,
          concernLevel: f.concernLevel,
          predicted7dReturn: f.predicted7dReturn,
        })),
        analystActivity: recentAnalystActivity.map(a => ({
          id: a.id,
          activityDate: a.activityDate.toISOString(),
          actionType: a.actionType,
          firm: a.firm,
          analyst: a.analystName,
          previousRating: a.previousRating,
          newRating: a.newRating,
          previousTarget: a.previousTarget,
          newTarget: a.newTarget,
        })),
        tracked: true,
      };
      cache.set(cacheKey, result, 3600000);
      const response = NextResponse.json(result);
      if (!rateLimitCheck.session) {
        return addRateLimitHeaders(response, rateLimit.limit, rateLimit.remaining, rateLimit.resetAt);
      }
      return response;
    }

    // Not in our database - return early with helpful message
    if (!existingCompany) {
      let suggestions: Array<{ ticker: string; name: string; sector?: string }> = [];

      try {
        // Try to get sector from Yahoo Finance for the searched ticker
        const summary = await yahooFinance.quoteSummary(ticker.toUpperCase(), {
          modules: ['assetProfile']
        });
        console.log(`[${ticker}] Yahoo assetProfile sector:`, summary.assetProfile?.sector);

        if (summary.assetProfile?.sector) {
          const tickerSector = summary.assetProfile.sector;
          console.log(`[${ticker}] Found sector: ${tickerSector}`);

          // Query Company model (which has sector field) for companies in same sector
          const sectorCompanies = await prisma.company.findMany({
            where: {
              sector: {
                contains: tickerSector,
                mode: 'insensitive'
              }
            },
            take: 5,
            select: {
              ticker: true,
              name: true,
              sector: true,
            },
          });

          console.log(`[${ticker}] Found ${sectorCompanies.length} sector matches`);

          // Map to convert null to undefined for type compatibility
          suggestions = sectorCompanies.map(c => ({
            ticker: c.ticker,
            name: c.name,
            sector: c.sector ?? undefined
          }));
        } else {
          console.log(`[${ticker}] No sector found in Yahoo quote`);
        }
      } catch (error) {
        console.log(`[${ticker}] Error getting sector:`, error);
      }

      // Fall back to top companies by market cap if no sector suggestions
      if (suggestions.length === 0) {
        const popularCompanies = await prisma.companySnapshot.findMany({
          where: {
            marketCap: { not: null },
          },
          orderBy: { marketCap: 'desc' },
          take: 5,
          select: {
            company: {
              select: { ticker: true, name: true }
            },
          },
          distinct: ['companyId'],
        });

        suggestions = popularCompanies.map(s => s.company);
      }

      return NextResponse.json({
        error: `We don't track ${ticker.toUpperCase()} yet. We track the top 640 companies by market cap. Here are some similar companies we track:`,
        tracked: false,
        suggestions,
      }, { status: 404 });
    }

    // If we have the company but no filings yet, fall back to SEC API
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

    const response = NextResponse.json(result);
    if (!rateLimitCheck.session) {
      return addRateLimitHeaders(response, rateLimit.limit, rateLimit.remaining, rateLimit.resetAt);
    }
    return response;
  } catch (error: any) {
    console.error('Error fetching company:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch company data' },
      { status: 500 }
    );
  }
}
