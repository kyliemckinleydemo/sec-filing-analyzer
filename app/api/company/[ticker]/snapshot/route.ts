import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from 'yahoo-finance2';
import Parser from 'rss-parser';
import { requireUnauthRateLimit, addRateLimitHeaders } from '@/lib/api-middleware';
import { generateFingerprint, checkUnauthRateLimit } from '@/lib/rate-limit';
import { cache, cacheKeys } from '@/lib/cache';

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

    // Fetch LIVE data from Yahoo Finance (cached for 5 minutes)
    let liveData: any = {};
    let newsArticles: any[] = [];
    let priceHistory: any[] = [];
    let spxHistory: any[] = [];

    const cacheKey = cacheKeys.snapshotData(tickerUpper);
    const cached = cache.get<{ liveData: any; priceHistory: any[]; spxHistory: any[] }>(cacheKey);

    if (cached) {
      console.log(`[Snapshot] Cache hit for ${tickerUpper}`);
      liveData = cached.liveData;
      priceHistory = cached.priceHistory;
      spxHistory = cached.spxHistory;
    } else {
      try {
        // Calculate date range for price history (180 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 180);

        // Use allSettled so a single Yahoo Finance failure doesn't kill all data
        const results = await Promise.allSettled([
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
          }),
          yahooFinance.historical('^GSPC', {
            period1: startDate.toISOString().split('T')[0],
            period2: endDate.toISOString().split('T')[0],
            interval: '1d'
          })
        ]);

        const quote = results[0].status === 'fulfilled' ? results[0].value : null;
        const summary = results[1].status === 'fulfilled' ? results[1].value : null;
        const historical = results[2].status === 'fulfilled' ? results[2].value : [];
        const spxHistorical = results[3].status === 'fulfilled' ? results[3].value : [];

        for (const [i, r] of results.entries()) {
          if (r.status === 'rejected') {
            console.warn(`[Snapshot] Yahoo Finance call ${i} failed for ${tickerUpper}:`, r.reason?.message || r.reason);
          }
        }

        if (quote) {
          liveData = {
            currentPrice: quote.regularMarketPrice,
            previousClose: quote.regularMarketPreviousClose,
            marketCap: quote.marketCap,
            volume: quote.regularMarketVolume,
            averageVolume: (quote as any).averageVolume,
            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
          };
        }

        if (summary) {
          liveData = {
            ...liveData,
            peRatio: summary.summaryDetail?.trailingPE,
            forwardPE: summary.summaryDetail?.forwardPE,
            dividendYield: summary.summaryDetail?.dividendYield,
            beta: summary.summaryDetail?.beta,
            analystTargetPrice: summary.financialData?.targetMeanPrice,
            recommendations: summary.recommendationTrend?.trend?.[0],
            profitMargins: summary.financialData?.profitMargins,
            revenueGrowth: summary.financialData?.revenueGrowth,
            returnOnEquity: summary.financialData?.returnOnEquity,
            freeCashflow: summary.financialData?.freeCashflow,
          };
        }

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

        // Extract S&P 500 price history
        if (spxHistorical && spxHistorical.length > 0) {
          spxHistory = spxHistorical.map((point: any) => ({
            date: point.date.toISOString().split('T')[0],
            price: Math.round(point.close * 100) / 100,
          }));
        }

        // Cache the processed Yahoo data for 5 minutes
        if (liveData.currentPrice || priceHistory.length > 0) {
          cache.set(cacheKey, { liveData, priceHistory, spxHistory }, 5 * 60 * 1000);
        }
      } catch (error: any) {
        console.error(`[Snapshot] Error fetching Yahoo Finance data for ${tickerUpper}:`, error.message);
        // Continue with database data if Yahoo Finance fails
      }
    }

    // Fetch news separately (not cached with Yahoo data since it comes from Google RSS)
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

    // Fallback to database-stored data if Yahoo Finance failed
    if (!liveData.currentPrice && company.currentPrice) {
      liveData = {
        currentPrice: company.currentPrice,
        marketCap: company.marketCap,
        peRatio: company.peRatio,
        forwardPE: company.forwardPE,
        fiftyTwoWeekHigh: company.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: company.fiftyTwoWeekLow,
        analystTargetPrice: company.analystTargetPrice,
        dividendYield: company.dividendYield,
        beta: company.beta,
        volume: company.volume ? Number(company.volume) : undefined,
        averageVolume: company.averageVolume ? Number(company.averageVolume) : undefined,
      };
    }

    // Fallback price history from StockPrice table if Yahoo Finance failed
    if (priceHistory.length === 0) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 180);
      const dbPrices = await prisma.stockPrice.findMany({
        where: {
          ticker: tickerUpper,
          date: { gte: startDate },
        },
        orderBy: { date: 'asc' },
      });
      if (dbPrices.length > 0) {
        priceHistory = dbPrices.map(p => ({
          date: p.date.toISOString().split('T')[0],
          price: Math.round(p.close * 100) / 100,
          high: p.high ? Math.round(p.high * 100) / 100 : null,
          low: p.low ? Math.round(p.low * 100) / 100 : null,
          volume: p.volume ? Number(p.volume) : null,
        }));
      }
    }

    // Fallback S&P 500 history from MacroIndicators if Yahoo Finance failed
    if (spxHistory.length === 0) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 180);
      const macroData = await prisma.macroIndicators.findMany({
        where: {
          date: { gte: startDate },
          spxClose: { not: null },
        },
        orderBy: { date: 'asc' },
        select: { date: true, spxClose: true },
      });
      if (macroData.length > 0) {
        spxHistory = macroData.map(m => ({
          date: m.date.toISOString().split('T')[0],
          price: Math.round(m.spxClose! * 100) / 100,
        }));
      }
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
      spxHistory,
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
