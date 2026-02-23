/**
 * @module app/api/stock-prices/route
 * @description Next.js API route handler providing dual-mode stock price data fetching from Yahoo Finance for both real-time watchlist quotes and historical SEC filing analysis
 *
 * PURPOSE:
 * - Fetch live current prices for multiple tickers via ?tickers=AAPL,GOOGL query parameter for dashboard watchlist display
 * - Retrieve 60-day historical price windows (±30 days) around SEC filing dates via ?ticker=AAPL&filingDate=2024-01-15 parameters
 * - Calculate percentage price changes normalized to filing date for both stock and SPY benchmark comparison
 * - Identify 7 business days post-filing date marker excluding weekends for regulatory deadline tracking
 *
 * DEPENDENCIES:
 * - next/server - Provides NextRequest/NextResponse types for API route handling and JSON responses
 * - @prisma/client - Instantiates PrismaClient for potential database operations (currently unused in code)
 * - query1.finance.yahoo.com API - External data source for both historical OHLC data and real-time quote information
 *
 * EXPORTS:
 * - GET (function) - Async route handler supporting two modes: multi-ticker quotes (?tickers) or single-ticker historical data (?ticker&filingDate)
 *
 * PATTERNS:
 * - Call GET /api/stock-prices?tickers=AAPL,MSFT,GOOGL to receive array of {ticker, currentPrice, change, changePercent} objects
 * - Call GET /api/stock-prices?ticker=AAPL&filingDate=2024-01-15 to receive {ticker, filingDate, sevenBdDate, prices[]} with normalized percentage changes
 * - Handle Promise.allSettled results for multi-ticker requests - failed fetches return zero values without breaking response
 * - Use returned prices array where each entry includes {date, price, pctChange, spyPctChange, isFilingDate, is7BdDate} flags
 *
 * CLAUDE NOTES:
 * - PrismaClient instantiated but never used - potential dead code or planned future database caching implementation
 * - Yahoo Finance API called with User-Agent header 'SEC-Filing-Analyzer/1.0' to avoid rate limiting as legitimate bot
 * - Business day calculation manually implements weekend exclusion (day 0 and 6) but ignores market holidays which could cause off-by-one errors
 * - Filing date price lookup uses linear search through chronologically sorted data finding last price <= filing timestamp, assumes Yahoo data arrives pre-sorted
 * - Multi-ticker mode uses Promise.allSettled to prevent one failed ticker from breaking entire batch, gracefully degrading to zero values
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProfile } from '@/lib/fmp-client';

/**
 * Fetch stock price data:
 * 1. If tickers param (plural): Returns current prices from database for multiple tickers
 * 2. If ticker + filingDate: Returns historical prices around filing date from Yahoo Finance
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    const ticker = searchParams.get('ticker');
    const filingDate = searchParams.get('filingDate');

    // Handle multiple tickers request (for dashboard watchlist)
    if (tickersParam) {
      const tickers = tickersParam.split(',').map(t => t.trim()).filter(Boolean);

      if (tickers.length === 0) {
        return NextResponse.json({ prices: [] });
      }

      // Fetch prices from database (updated by FMP cron job)
      const companies = await prisma.company.findMany({
        where: { ticker: { in: tickers } },
        select: { ticker: true, currentPrice: true },
      });

      const companyMap = new Map(companies.map(c => [c.ticker, c.currentPrice]));

      // Try FMP for real-time price on tickers where DB has no price
      const missingTickers = tickers.filter(t => !companyMap.get(t));
      if (missingTickers.length > 0 && missingTickers.length <= 5) {
        const fmpResults = await Promise.allSettled(
          missingTickers.map(t => getProfile(t))
        );
        fmpResults.forEach((result, i) => {
          if (result.status === 'fulfilled' && result.value?.price) {
            companyMap.set(missingTickers[i], result.value.price);
          }
        });
      }

      const prices = tickers.map(t => {
        const price = companyMap.get(t);
        if (price) {
          return { ticker: t, currentPrice: price, change: null, changePercent: null };
        }
        return null;
      }).filter(Boolean);

      return NextResponse.json({ prices });
    }

    // Handle single ticker + filing date request (existing functionality)
    if (!ticker || !filingDate) {
      return NextResponse.json(
        { error: 'Missing ticker or filingDate parameter (or tickers for multiple)' },
        { status: 400 }
      );
    }

    console.log(`[Stock Prices API] Fetching data for ${ticker} around ${filingDate}`);

    // Calculate date range (30 days before/after filing)
    const filing = new Date(filingDate);
    const startDate = new Date(filing);
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date(filing);
    endDate.setDate(endDate.getDate() + 30);

    const filingStr = filing.toISOString().split('T')[0];

    console.log(`[Stock Prices API] Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

    // Fetch stock data from Yahoo Finance API
    const [stockData, spyData] = await Promise.all([
      fetchYahooFinanceData(ticker, startDate, endDate),
      fetchYahooFinanceData('SPY', startDate, endDate)
    ]);

    if (!stockData || stockData.length === 0) {
      return NextResponse.json(
        { error: `No price data available for ${ticker}` },
        { status: 404 }
      );
    }

    // Find filing date price for normalization
    const filingTime = filing.getTime();
    let stockFilingPrice: number | null = null;
    let spyFilingPrice: number | null = null;

    // Get closest price to filing date (on or before)
    for (const point of stockData) {
      if (point.date <= filingTime) {
        stockFilingPrice = point.close;
      } else {
        break;
      }
    }

    for (const point of spyData) {
      if (point.date <= filingTime) {
        spyFilingPrice = point.close;
      } else {
        break;
      }
    }

    // Calculate 7 business days after filing date
    let businessDaysCount = 0;
    let currentDate = new Date(filing);
    let sevenBdDate: string | null = null;

    while (businessDaysCount < 7) {
      currentDate.setDate(currentDate.getDate() + 1);
      // Check if it's a weekday (0 = Sunday, 6 = Saturday)
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        businessDaysCount++;
        if (businessDaysCount === 7) {
          sevenBdDate = currentDate.toISOString().split('T')[0];
        }
      }
    }

    // Create a map of SPY data by date for O(1) lookup
    const spyDataMap = new Map<string, { close: number }>();
    for (const spyPoint of spyData) {
      const spyDateStr = new Date(spyPoint.date).toISOString().split('T')[0];
      spyDataMap.set(spyDateStr, { close: spyPoint.close });
    }

    // Build result with percentage changes
    const prices = stockData.map(point => {
      const dateStr = new Date(point.date).toISOString().split('T')[0];
      const stockPctChange = stockFilingPrice
        ? ((point.close - stockFilingPrice) / stockFilingPrice * 100)
        : 0;

      // Find corresponding SPY data using the map
      const spyPoint = spyDataMap.get(dateStr);

      const spyPctChange = (spyPoint && spyFilingPrice)
        ? ((spyPoint.close - spyFilingPrice) / spyFilingPrice * 100)
        : 0;

      return {
        date: dateStr,
        price: Math.round(point.close * 100) / 100,
        pctChange: Math.round(stockPctChange * 100) / 100,
        spyPctChange: Math.round(spyPctChange * 100) / 100,
        isFilingDate: dateStr === filingStr,
        is7BdDate: dateStr === sevenBdDate
      };
    });

    const result = {
      ticker,
      filingDate: filingStr,
      sevenBdDate,
      prices
    };

    console.log(`[Stock Prices API] Fetched ${result.prices.length} data points`);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Stock Prices API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stock prices' },
      { status: 500 }
    );
  }
}

/**
 * Fetch historical price data from Yahoo Finance API
 */
async function fetchYahooFinanceData(
  ticker: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{ date: number; close: number }>> {
  try {
    // Convert dates to Unix timestamps
    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);

    // Yahoo Finance API endpoint
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SEC-Filing-Analyzer/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API returned ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
      console.warn(`[Yahoo Finance] No data for ${ticker}`);
      return [];
    }

    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;

    // Combine timestamps and closes, filtering out null values
    const priceData: Array<{ date: number; close: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] !== null && closes[i] !== undefined) {
        priceData.push({
          date: timestamps[i] * 1000, // Convert to milliseconds
          close: closes[i]
        });
      }
    }

    return priceData;
  } catch (error) {
    console.error(`[Yahoo Finance] Error fetching ${ticker}:`, error);
    return [];
  }
}

/**
 * Batch fetch current quote data for multiple tickers from Yahoo Finance API
 * Returns a map of ticker to quote data
 */
async function fetchYahooQuoteBatch(
  tickers: string[]
): Promise<Record<string, { currentPrice: number; change: number; changePercent: number }>> {
  try {
    // Yahoo Finance supports comma-separated tickers in a single request
    const tickerList = tickers.join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickerList}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SEC-Filing-Analyzer/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API returned ${response.status}`);
    }

    const data = await response.json();
    const results = data.quoteResponse?.result || [];

    const quotesMap: Record<string, { currentPrice: number; change: number; changePercent: number }> = {};

    for (const result of results) {
      const ticker = result.symbol;
      const currentPrice = result.regularMarketPrice;
      const previousClose = result.regularMarketPreviousClose;

      if (currentPrice && previousClose) {
        const change = currentPrice - previousClose;
        const changePercent = (change / previousClose) * 100;

        quotesMap[ticker] = {
          currentPrice: Math.round(currentPrice * 100) / 100,
          change: Math.round(change * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100
        };
      } else {
        console.warn(`[Yahoo Finance Quote Batch] Missing price data for ${ticker}`);
      }
    }

    return quotesMap;
  } catch (error) {
    console.error(`[Yahoo Finance Quote Batch] Error fetching quotes:`, error);
    return {};
  }
}

/**
 * Fetch current quote data from Yahoo Finance API
 * Returns current price, change, and change percent
 */
async function fetchYahooQuote(
  ticker: string
): Promise<{ currentPrice: number; change: number; changePercent: number } | null> {
  try {
    // Yahoo Finance quote API endpoint
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SEC-Filing-Analyzer/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API returned ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result) {
      console.warn(`[Yahoo Finance Quote] No data for ${ticker}`);
      return null;
    }

    // Get current price from meta
    const meta = result.meta;
    const currentPrice = meta?.regularMarketPrice;
    const previousClose = meta?.chartPreviousClose || meta?.previousClose;

    if (!currentPrice || !previousClose) {
      console.warn(`[Yahoo Finance Quote] Missing price data for ${ticker}`);
      return null;
    }

    // Calculate change and change percent
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      currentPrice: Math.round(currentPrice * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100
    };
  } catch (error) {
    console.error(`[Yahoo Finance Quote] Error fetching ${ticker}:`, error);
    return null;
  }
}