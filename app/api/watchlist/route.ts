/**
 * @module app/api/watchlist/route
 * @description Next.js API route handler managing authenticated user watchlists with GET retrieval including company data, POST addition with auto-alert creation, and DELETE removal by ticker
 *
 * PURPOSE:
 * - GET fetches user's watchlist with joined company financial data (price, PE ratio, margins, revenue) and sector watchlist ordered by creation date
 * - POST adds normalized ticker to watchlist with upsert to prevent duplicates, validates company exists in 640+ tracked set, and auto-creates 4 alert types ('new_filing', 'prediction_result', 'analyst_change', 'sector_filing') on first watchlist item
 * - DELETE removes ticker from watchlist using query parameter with normalized uppercase matching
 * - Enforces authentication via getSession() returning 401 for unauthenticated requests across all endpoints
 *
 * DEPENDENCIES:
 * - next/server - Provides NextRequest and NextResponse for API route handling
 * - @/lib/auth - Supplies getSession() for JWT-based user authentication and session validation
 * - @/lib/prisma - Exports configured Prisma client for database operations on watchlist, company, sectorWatch, and alert tables
 *
 * EXPORTS:
 * - GET (function) - Returns JSON with watchlist array (items with nested company data) and sectorWatchlist array, or 401/500 errors
 * - POST (function) - Accepts JSON body with ticker field, returns success boolean and created watchlistItem, or 400/404/500 errors
 * - DELETE (function) - Accepts ticker query parameter, returns success boolean on deletion, or 400/500 errors
 *
 * PATTERNS:
 * - Call GET /api/watchlist with authenticated session cookie to receive { watchlist: Array<{ticker, company: {...financials}}>, sectorWatchlist: Array }
 * - Call POST /api/watchlist with JSON body { ticker: 'AAPL' } - ticker is normalized to uppercase and validated against company table
 * - Call DELETE /api/watchlist?ticker=AAPL to remove specific ticker from user's watchlist
 * - First POST by new user triggers automatic creation of 4 alert types with enabled:true and frequency:'immediate'
 *
 * CLAUDE NOTES:
 * - Watchlist uses composite unique key userId_ticker for upsert operations preventing duplicate entries per user
 * - GET performs two separate queries (watchlist items then companies) and client-side joins via Array.find() rather than Prisma relation includes
 * - Auto-alert creation only checks total alert count - if user manually deletes all alerts then adds ticker, 4 new alerts are recreated
 * - Company validation returns specific error message 'We don't track ${ticker}. We track 640+ companies by market cap.' indicating finite company dataset
 * - DELETE uses deleteMany instead of delete to handle case where ticker doesn't exist without throwing error
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/watchlist - Get user's watchlist
export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch watchlist with company data and sector watchlist in parallel
    const [watchlist, sectorWatchlist] = await Promise.all([
      prisma.watchlist.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sectorWatch.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Fetch company data for all tickers in a single query
    const tickers = watchlist.map(w => w.ticker);
    const companies = await prisma.company.findMany({
      where: { ticker: { in: tickers } },
      select: {
        ticker: true,
        name: true,
        sector: true,
        currentPrice: true,
        marketCap: true,
        peRatio: true,
        dividendYield: true,
        beta: true,
        latestRevenue: true,
        latestRevenueYoY: true,
        latestNetIncome: true,
        latestNetIncomeYoY: true,
        latestGrossMargin: true,
        latestOperatingMargin: true,
        latestQuarter: true,
        analystTargetPrice: true,
      },
    });

    // Combine watchlist items with company data
    const watchlistWithCompanyData = watchlist.map(item => {
      const company = companies.find(c => c.ticker === item.ticker);
      return {
        ...item,
        company,
      };
    });

    return NextResponse.json({
      watchlist: watchlistWithCompanyData,
      sectorWatchlist,
    });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch watchlist' },
      { status: 500 }
    );
  }
}

// POST /api/watchlist - Add ticker to watchlist
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { ticker } = await request.json();

    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      );
    }

    const normalizedTicker = ticker.toUpperCase();

    // Check if company exists
    const company = await prisma.company.findUnique({
      where: { ticker: normalizedTicker },
    });

    if (!company) {
      return NextResponse.json(
        { error: `We don't track ${normalizedTicker}. We track 640+ companies by market cap.` },
        { status: 404 }
      );
    }

    // Add to watchlist (or do nothing if already exists)
    const watchlistItem = await prisma.watchlist.upsert({
      where: {
        userId_ticker: {
          userId: session.userId,
          ticker: normalizedTicker,
        },
      },
      create: {
        userId: session.userId,
        ticker: normalizedTicker,
      },
      update: {},
    });

    // Auto-create all alert types if user doesn't have any
    const existingAlerts = await prisma.alert.count({
      where: { userId: session.userId },
    });

    if (existingAlerts === 0) {
      const alertTypes = ['new_filing', 'prediction_result', 'analyst_change', 'sector_filing'];

      // Batch create all alerts in a single transaction
      await prisma.alert.createMany({
        data: alertTypes.map(alertType => ({
          userId: session.userId,
          alertType,
          enabled: true,
          frequency: 'immediate',
          deliveryTime: 'both',
        })),
      });

      console.log(`[Watchlist] Auto-created ${alertTypes.length} alert types for user ${session.userId}`);
    }

    return NextResponse.json({
      success: true,
      item: watchlistItem,
    });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    return NextResponse.json(
      { error: 'Failed to add to watchlist' },
      { status: 500 }
    );
  }
}

// DELETE /api/watchlist - Remove ticker from watchlist
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');

    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      );
    }

    const normalizedTicker = ticker.toUpperCase();

    await prisma.watchlist.deleteMany({
      where: {
        userId: session.userId,
        ticker: normalizedTicker,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    return NextResponse.json(
      { error: 'Failed to remove from watchlist' },
      { status: 500 }
    );
  }
}