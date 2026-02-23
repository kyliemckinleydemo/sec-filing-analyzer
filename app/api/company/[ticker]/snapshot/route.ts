/**
 * @module app/api/company/[ticker]/snapshot/route
 * @description Next.js API route handler that fetches comprehensive company data including live market data, price history, news, filings, and analyst activity with rate limiting and multi-source fallbacks
 *
 * PURPOSE:
 * - Validates ticker parameter and checks company exists in tracked list of 640+ companies
 * - Enforces 20 requests/day rate limit for unauthenticated users via fingerprinting
 * - Fetches live market data (price, volume, P/E, 52-week range) from Yahoo Finance with 5-minute cache
 * - Retrieves 180-day price history for both ticker and S&P 500 (SPY) via Yahoo Finance chart API
 * - Parses Google News RSS feed for latest 10 company-related articles with publisher extraction
 * - Falls back to Prisma database for market data, price history, and S&P 500 when Yahoo Finance fails
 * - Aggregates recent SEC filings with ML predictions and analyst activity from database
 *
 * DEPENDENCIES:
 * - next/server - Provides NextRequest and NextResponse for API route handling
 * - @/lib/prisma - Database client for querying Company, StockPrice, MacroIndicators, and AnalystActivity tables
 * - @/lib/yahoo-finance-singleton - Yahoo Finance v2 SDK singleton for quote, chart, and quoteSummary calls
 * - @/lib/api-middleware - Provides requireUnauthRateLimit and addRateLimitHeaders for rate limit enforcement
 * - @/lib/rate-limit - Generates fingerprints and checks unauthenticated user rate limits
 * - @/lib/cache - In-memory cache with cacheKeys helper for 5-minute snapshot data TTL
 * - rss-parser - Parses Google News RSS feeds for article metadata and timestamps
 *
 * EXPORTS:
 * - GET (function) - Async handler returning JSON with company profile, live market data, 180-day price charts, news articles, fundamentals, filings, and analyst activity
 *
 * PATTERNS:
 * - Access via GET /api/company/[ticker]/snapshot with uppercase or lowercase ticker symbol
 * - Returns 404 if ticker not in tracked company list with message about 640+ company coverage
 * - Returns 429 with X-RateLimit-* headers when unauthenticated user exceeds 20 requests/day
 * - Promise.allSettled ensures partial Yahoo Finance failures don't block entire response
 * - Cache hit logs '[Snapshot] Cache hit for {TICKER}' and skips Yahoo Finance calls for 5 minutes
 * - Fallback chain: Yahoo Finance cached → Yahoo Finance live → Prisma Company table → Prisma StockPrice/MacroIndicators
 * - News titles parsed as 'Title - Publisher' format from Google RSS feed structure
 *
 * CLAUDE NOTES:
 * - Uses generateFingerprint for rate limiting but authenticated users bypass limits entirely via requireUnauthRateLimit check
 * - Price history sorted ascending (oldest first) from Yahoo Finance chart quotes for chart display compatibility
 * - S&P 500 comparison data fetched as SPY ticker then stored separately in spxHistory array
 * - RSS feed queries company name with ' stock' suffix for more relevant financial news results
 * - Database fallbacks query last 180 days matching Yahoo Finance date range for consistent chart timeframes
 * - All prices rounded to 2 decimals (Math.round * 100 / 100) for consistent precision
 * - Volume fields cast to Number from BigInt to avoid JSON serialization errors
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from '@/lib/yahoo-finance-singleton';
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
          yahooFinance.chart(tickerUpper, { period1: startDate, period2: endDate, interval: '1d' as const }),
          yahooFinance.chart('SPY', { period1: startDate, period2: endDate, interval: '1d' as const }),
        ]);

        const quote = results[0].status === 'fulfilled' ? results[0].value : null;
        const chartResult = results[1].status === 'fulfilled' ? results[1].value : null;
        const spxChartResult = results[2].status === 'fulfilled' ? results[2].value : null;

        for (const [i, r] of results.entries()) {
          if (r.status === 'rejected') {
            console.warn(`[Snapshot] Yahoo Finance call ${i} failed for ${tickerUpper}:`, r.reason?.message || r.reason);
          }
        }

        if (quote) {
          liveData = {
            currentPrice: quote.regularMarketPrice,
            previousClose: quote.regularMarketPreviousClose ?? null,
            marketCap: quote.marketCap,
            volume: quote.regularMarketVolume,
            averageVolume: quote.averageDailyVolume10Day,
            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
            fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
            peRatio: quote.trailingPE ?? null,
            dividendYield: quote.dividendYield ? quote.dividendYield / 100 : null,
            beta: (quote as any).beta ?? null,
            analystTargetPrice: null, // Will be updated below
          };

          // Fetch analyst target price (non-blocking, non-critical)
          try {
            const summary = await yahooFinance.quoteSummary(tickerUpper, { modules: ['financialData'] });
            liveData.analystTargetPrice = summary.financialData?.targetMeanPrice ?? null;
          } catch { /* non-critical */ }
        }

        // Extract price history from chart quotes
        const historical = chartResult?.quotes ?? [];
        if (historical.length > 0) {
          const sorted = [...historical].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          priceHistory = sorted.filter(point => point.close != null).map((point) => ({
            date: new Date(point.date).toISOString().split('T')[0],
            price: Math.round(point.close! * 100) / 100,
            high: point.high ? Math.round(point.high * 100) / 100 : null,
            low: point.low ? Math.round(point.low * 100) / 100 : null,
            volume: point.volume || null,
          }));
        }

        // Extract S&P 500 price history from chart quotes
        const spxHistorical = spxChartResult?.quotes ?? [];
        if (spxHistorical.length > 0) {
          const sorted = [...spxHistorical].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          spxHistory = sorted.filter(point => point.close != null).map((point) => ({
            date: new Date(point.date).toISOString().split('T')[0],
            price: Math.round(point.close! * 100) / 100,
          }));
        }

        // Cache the processed data for 5 minutes
        if (liveData.currentPrice || priceHistory.length > 0) {
          cache.set(cacheKey, { liveData, priceHistory, spxHistory }, 5 * 60 * 1000);
        }
      } catch (error: any) {
        console.error(`[Snapshot] Error fetching Yahoo Finance data for ${tickerUpper}:`, error.message);
        // Continue with database data if Yahoo Finance fails
      }
    }

    // Fetch news from Google RSS (independent of Yahoo Finance)
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
      // No fallback needed - news is optional
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
