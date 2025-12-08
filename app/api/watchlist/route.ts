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

    // Fetch watchlist with company data
    const watchlist = await prisma.watchlist.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch company data for each ticker
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
        analystTargetPrice: true,
      },
    });

    // Fetch sector watchlist
    const sectorWatchlist = await prisma.sectorWatch.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
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
