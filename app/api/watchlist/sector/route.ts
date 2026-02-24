/**
 * @module app/api/watchlist/sector/route
 * @description Next.js API route handlers for managing user sector watchlist with add, retrieve valid sectors list, and remove operations
 *
 * PURPOSE:
 * - Validate sector names against 11 predefined industry categories (Technology, Healthcare, Energy, etc.)
 * - Add sectors to user watchlist via POST using upsert to prevent duplicates
 * - Return complete list of valid sector names via GET for client-side validation
 * - Remove sectors from user watchlist via DELETE using sector query parameter
 *
 * DEPENDENCIES:
 * - @/lib/auth - Provides getSession() to extract userId from JWT for authorization checks
 * - @/lib/prisma - Database client for sectorWatch table operations (upsert, deleteMany)
 *
 * EXPORTS:
 * - POST (function) - Creates or updates sectorWatch record for authenticated user with validation
 * - GET (function) - Returns array of 11 valid sector names without authentication requirement
 * - DELETE (function) - Removes sector from authenticated user's watchlist using sector query param
 *
 * PATTERNS:
 * - POST to /api/watchlist/sector with JSON body { sector: 'Technology' }
 * - GET /api/watchlist/sector returns { sectors: string[] } for dropdown/validation
 * - DELETE /api/watchlist/sector?sector=Healthcare removes that sector
 * - All write operations require valid session, return 401 if unauthorized
 *
 * CLAUDE NOTES:
 * - Uses upsert with composite key userId_sector to make POST idempotent - repeated adds won't error
 * - GET endpoint deliberately public (no auth) to support client-side form validation before submission
 * - Validation includes helpful error with all valid sectors when invalid name submitted
 * - DELETE uses deleteMany instead of delete to handle case where record doesn't exist without throwing error
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Valid sectors from our database
const VALID_SECTORS = [
  'Basic Materials',
  'Communication Services',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Energy',
  'Financial Services',
  'Healthcare',
  'Industrials',
  'Real Estate',
  'Technology',
  'Utilities',
];

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

    // Validate sector name
    if (!VALID_SECTORS.includes(sector)) {
      return NextResponse.json(
        {
          error: 'Invalid sector',
          message: `Sector must be one of: ${VALID_SECTORS.join(', ')}`,
          validSectors: VALID_SECTORS
        },
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

// GET /api/watchlist/sector - Get valid sectors
export async function GET() {
  return NextResponse.json({
    sectors: VALID_SECTORS
  });
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
