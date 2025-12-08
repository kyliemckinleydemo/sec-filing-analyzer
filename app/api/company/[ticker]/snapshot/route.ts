import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from 'yahoo-finance2';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    const tickerUpper = ticker.toUpperCase();

    // Check if we track this company
    const company = await prisma.company.findUnique({
      where: { ticker: tickerUpper },
      include: {
        filings: {
          where: {
            filingDate: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
          },
          orderBy: { filingDate: 'desc' },
          take: 10,
        },
      },
    });

    if (!company) {
      return NextResponse.json(
        { error: `We don't track ${tickerUpper}. We track 640+ companies by market cap.` },
        { status: 404 }
      );
    }

    // Fetch LIVE data from Yahoo Finance
    let liveData: any = {};
    let newsArticles: any[] = [];
    try {
      const [quote, summary, news] = await Promise.all([
        yahooFinance.quote(tickerUpper),
        yahooFinance.quoteSummary(tickerUpper, {
          modules: [
            'price',
            'summaryDetail',
            'financialData',
            'defaultKeyStatistics',
            'recommendationTrend'
          ]
        }),
        yahooFinance.search(tickerUpper, { newsCount: 10 })
      ]);

      liveData = {
        currentPrice: quote.regularMarketPrice,
        previousClose: quote.regularMarketPreviousClose,
        marketCap: quote.marketCap,
        volume: quote.regularMarketVolume,
        averageVolume: (quote as any).averageVolume,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,

        // From summary
        peRatio: summary.summaryDetail?.trailingPE,
        forwardPE: summary.summaryDetail?.forwardPE,
        dividendYield: summary.summaryDetail?.dividendYield,
        beta: summary.summaryDetail?.beta,
        analystTargetPrice: summary.financialData?.targetMeanPrice,

        // Recommendation trend (analyst ratings)
        recommendations: summary.recommendationTrend?.trend?.[0],

        // Additional metrics
        profitMargins: summary.financialData?.profitMargins,
        revenueGrowth: summary.financialData?.revenueGrowth,
        returnOnEquity: summary.financialData?.returnOnEquity,
        freeCashflow: summary.financialData?.freeCashflow,
      };

      // Extract news articles
      if (news.news && news.news.length > 0) {
        newsArticles = news.news.map((article: any) => ({
          title: article.title,
          publisher: article.publisher,
          link: article.link,
          publishedAt: article.providerPublishTime ? new Date(article.providerPublishTime * 1000).toISOString() : null,
          thumbnail: article.thumbnail?.resolutions?.[0]?.url,
        }));
      }
    } catch (error: any) {
      console.error(`[Snapshot] Error fetching Yahoo Finance data for ${tickerUpper}:`, error.message);
      // Continue with database data if Yahoo Finance fails
    }

    // Fetch recent analyst activity from our database
    const analystActivity = await prisma.analystActivity.findMany({
      where: { companyId: company.id },
      orderBy: { activityDate: 'desc' },
      take: 20,
    });

    // Return combined data
    return NextResponse.json({
      company: {
        ticker: company.ticker,
        name: company.name,
        cik: company.cik,
        sector: company.sector,
        industry: company.industry,
      },
      liveData,
      news: newsArticles,
      fundamentals: {
        // Latest financials from our database (from most recent filing)
        latestRevenue: company.latestRevenue,
        latestRevenueYoY: company.latestRevenueYoY,
        latestNetIncome: company.latestNetIncome,
        latestNetIncomeYoY: company.latestNetIncomeYoY,
        latestEPS: company.latestEPS,
        latestEPSYoY: company.latestEPSYoY,
        latestGrossMargin: company.latestGrossMargin,
        latestOperatingMargin: company.latestOperatingMargin,
        latestQuarter: company.latestQuarter,
      },
      filings: company.filings.map(f => ({
        accessionNumber: f.accessionNumber,
        filingType: f.filingType,
        filingDate: f.filingDate.toISOString(),
        concernLevel: f.concernLevel,
        predicted7dReturn: f.predicted7dReturn,
        predictionConfidence: f.predictionConfidence,
      })),
      analystActivity: analystActivity.map(a => ({
        id: a.id,
        activityDate: a.activityDate.toISOString(),
        actionType: a.actionType,
        firm: a.firm,
        analyst: a.analyst,
        previousRating: a.previousRating,
        newRating: a.newRating,
        previousTarget: a.previousTarget,
        newTarget: a.newTarget,
      })),
    });
  } catch (error: any) {
    console.error('[Snapshot] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch company snapshot' },
      { status: 500 }
    );
  }
}
