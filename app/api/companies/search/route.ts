import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Search companies by ticker or name
 * Used for autocomplete in ticker search
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim().toUpperCase();

    if (!query || query.length < 1) {
      return NextResponse.json({ companies: [] });
    }

    // Search for companies matching ticker or name
    const companies = await prisma.company.findMany({
      where: {
        OR: [
          { ticker: { startsWith: query } },
          { name: { contains: query, mode: 'insensitive' } }
        ],
        filings: {
          some: {} // Only companies with filings
        }
      },
      select: {
        ticker: true,
        name: true,
        marketCap: true,
        _count: {
          select: { filings: true }
        }
      },
      orderBy: [
        { marketCap: 'desc' }, // Larger companies first
        { ticker: 'asc' }
      ],
      take: 10
    });

    return NextResponse.json({
      companies: companies.map(c => ({
        ticker: c.ticker,
        name: c.name,
        marketCap: c.marketCap,
        filingCount: c._count.filings
      }))
    });

  } catch (error: any) {
    console.error('[API] Error searching companies:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
