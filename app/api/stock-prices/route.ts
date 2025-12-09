import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

      // Fetch live prices from Yahoo Finance for all tickers
      const pricePromises = tickers.map(ticker => fetchYahooQuote(ticker));
      const yahooResults = await Promise.allSettled(pricePromises);

      const prices = yahooResults.map((result, index) => {
        const ticker = tickers[index];

        if (result.status === 'fulfilled' && result.value) {
          return {
            ticker,
            currentPrice: result.value.currentPrice,
            change: result.value.change,
            changePercent: result.value.changePercent
          };
        } else {
          // If Yahoo Finance fails, return 0s
          console.warn(`Failed to fetch price for ${ticker}`);
          return {
            ticker,
            currentPrice: 0,
            change: 0,
            changePercent: 0
          };
        }
      });

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

    // Build result with percentage changes
    const prices = stockData.map(point => {
      const dateStr = new Date(point.date).toISOString().split('T')[0];
      const stockPctChange = stockFilingPrice
        ? ((point.close - stockFilingPrice) / stockFilingPrice * 100)
        : 0;

      // Find corresponding SPY data
      const spyPoint = spyData.find(spy => {
        const spyDateStr = new Date(spy.date).toISOString().split('T')[0];
        return spyDateStr === dateStr;
      });

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
