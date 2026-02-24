/**
 * @module app/api/stock/[ticker]/route
 * @description Next.js API route that fetches historical stock prices for a given ticker symbol, persists them to database, and implements time-based caching strategy
 *
 * PURPOSE:
 * - Accept GET requests with ticker parameter and validate uppercase format
 * - Check in-memory cache first using ticker-specific key before external API call
 * - Fetch last 100 days of historical prices from stock API via stockClient
 * - Upsert each price record into PostgreSQL using composite ticker_date unique constraint
 * - Cache responses for 1 hour during market hours (9am-4pm) or 24 hours outside market hours
 *
 * DEPENDENCIES:
 * - next/server - Provides NextRequest and NextResponse for API route handlers
 * - @/lib/stock-client - Exposes getHistoricalPrices() method to fetch stock data from external API
 * - @/lib/cache - Provides in-memory cache with get/set methods and cacheKeys.stockPrices() generator
 * - @/lib/prisma - Database client for upserting stockPrice records with ticker_date composite key
 *
 * EXPORTS:
 * - GET (function) - Async handler that returns JSON array of historical price objects with date, open, high, low, close, volume fields
 *
 * PATTERNS:
 * - Access via GET /api/stock/[ticker] where ticker is URL parameter (e.g., /api/stock/AAPL)
 * - Returns 400 if ticker parameter missing, 500 if API/database operation fails
 * - Response format matches stockClient price array structure from external API
 * - Cache automatically invalidates after TTL based on market hours heuristic
 *
 * CLAUDE NOTES:
 * - Market hours detection uses simple 9am-4pm hour check without timezone or holiday awareness
 * - Database upsert prevents duplicate entries but performs no conflict updates - may miss price corrections
 * - Cache is checked before database query, so stale cache can serve outdated data even if DB has fresher records
 * - All prices are upserted sequentially in a loop without transaction or batch insert - could cause partial writes on error
 */
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
