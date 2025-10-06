import { NextRequest, NextResponse } from 'next/server';
import { stockClient } from '@/lib/stock-client';
import { cache, cacheKeys } from '@/lib/cache';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    const upperTicker = ticker.toUpperCase();

    // Check cache first
    const cacheKey = cacheKeys.stockPrices(upperTicker);
    const cached = cache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Fetch historical prices (compact = last 100 days)
    const prices = await stockClient.getHistoricalPrices(upperTicker, 'compact');

    // Store in database
    for (const price of prices) {
      await prisma.stockPrice.upsert({
        where: {
          ticker_date: {
            ticker: upperTicker,
            date: new Date(price.date),
          },
        },
        create: {
          ticker: upperTicker,
          date: new Date(price.date),
          open: price.open,
          high: price.high,
          low: price.low,
          close: price.close,
          volume: price.volume,
        },
        update: {},
      });
    }

    // Cache for 1 hour during market hours, 24 hours after close
    const now = new Date();
    const hour = now.getHours();
    const isMarketHours = hour >= 9 && hour < 16; // Rough estimate
    const ttl = isMarketHours ? 3600000 : 86400000; // 1 hour or 24 hours

    cache.set(cacheKey, prices, ttl);

    return NextResponse.json(prices);
  } catch (error: any) {
    console.error('Error fetching stock prices:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stock data' },
      { status: 500 }
    );
  }
}
