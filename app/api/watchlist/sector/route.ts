import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/watchlist/sector - Add sector to watchlist
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { sector } = await request.json();

    if (!sector) {
      return NextResponse.json(
        { error: 'Sector is required' },
        { status: 400 }
      );
    }

    // Add to sector watchlist (or do nothing if already exists)
    const sectorWatch = await prisma.sectorWatch.upsert({
      where: {
        userId_sector: {
          userId: session.userId,
          sector,
        },
      },
      create: {
        userId: session.userId,
        sector,
      },
      update: {},
    });

    return NextResponse.json({
      success: true,
      item: sectorWatch,
    });
  } catch (error) {
    console.error('Error adding sector to watchlist:', error);
    return NextResponse.json(
      { error: 'Failed to add sector to watchlist' },
      { status: 500 }
    );
  }
}

// DELETE /api/watchlist/sector - Remove sector from watchlist
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
    const sector = searchParams.get('sector');

    if (!sector) {
      return NextResponse.json(
        { error: 'Sector is required' },
        { status: 400 }
      );
    }

    await prisma.sectorWatch.deleteMany({
      where: {
        userId: session.userId,
        sector,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing sector from watchlist:', error);
    return NextResponse.json(
      { error: 'Failed to remove sector from watchlist' },
      { status: 500 }
    );
  }
}
