import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from 'yahoo-finance2';
import Parser from 'rss-parser';
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
    let priceHistory: any[] = [];
    try {
      // Calculate date range for price history (6 months)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);

      const [quote, summary, historical] = await Promise.all([
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
        yahooFinance.historical(tickerUpper, {
          period1: startDate.toISOString().split('T')[0],
          period2: endDate.toISOString().split('T')[0],
          interval: '1d'
        })
      ]);

      // Fetch news from Google News RSS feed (stable and reliable)
      try {
        const parser = new Parser();
        const newsQuery = `${company.name} stock`;
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(newsQuery)}`;

        const feed = await parser.parseURL(rssUrl);

        if (feed.items && feed.items.length > 0) {
          newsArticles = feed.items.slice(0, 10).map((item: any) => {
            // Google News RSS embeds source in title like "Title - Source Name"
            let title = item.title || 'Unknown';
            let publisher = 'Unknown';

            // Try to extract source from title
            const titleMatch = title.match(/^(.+?)\s*-\s*(.+?)$/);
            if (titleMatch && titleMatch.length === 3) {
              title = titleMatch[1].trim();
              publisher = titleMatch[2].trim();
            } else {
              // Fallback to other fields
              publisher = item.source?.name || item.creator || item['dc:source'] || 'Unknown';
            }

            return {
              title,
              publisher,
              link: item.link || '',
              publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
              thumbnail: null,
            };
          });
        }
      } catch (error: any) {
        console.error(`[Snapshot] Error fetching Google News RSS for ${tickerUpper}:`, error.message);
        // Fall back to Yahoo Finance news if RSS fails
        try {
          const yahooNews = await yahooFinance.search(tickerUpper, { newsCount: 10 });
          if (yahooNews.news && yahooNews.news.length > 0) {
            newsArticles = yahooNews.news.map((article: any) => ({
              title: article.title,
              publisher: article.publisher,
              link: article.link,
              publishedAt: article.providerPublishTime ? new Date(article.providerPublishTime * 1000).toISOString() : null,
              thumbnail: article.thumbnail?.resolutions?.[0]?.url,
            }));
          }
        } catch (yahooError: any) {
          console.error(`[Snapshot] Error fetching Yahoo Finance news for ${tickerUpper}:`, yahooError.message);
        }
      }

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

      // Extract price history with additional data for tooltips
      if (historical && historical.length > 0) {
        priceHistory = historical.map((point: any) => ({
          date: point.date.toISOString().split('T')[0],
          price: Math.round(point.close * 100) / 100,
          high: point.high ? Math.round(point.high * 100) / 100 : null,
          low: point.low ? Math.round(point.low * 100) / 100 : null,
          volume: point.volume || null,
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

    // Return combined data with rate limit headers
    const response = NextResponse.json({
      company: {
        ticker: company.ticker,
        name: company.name,
        cik: company.cik,
        sector: company.sector,
        industry: company.industry,
      },
      liveData,
      priceHistory,
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
        analyst: a.analystName,
        previousRating: a.previousRating,
        newRating: a.newRating,
        previousTarget: a.previousTarget,
        newTarget: a.newTarget,
      })),
    });

    // Add rate limit headers to response
    if (!rateLimitCheck.session) {
      return addRateLimitHeaders(response, rateLimit.limit, rateLimit.remaining, rateLimit.resetAt);
    }

    return response;
  } catch (error: any) {
    console.error('[Snapshot] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch company snapshot' },
      { status: 500 }
    );
  }
}
