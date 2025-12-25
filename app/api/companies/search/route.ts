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
      take: 50 // Get more results to sort properly
    });

    // Sort results: exact ticker matches first, then by market cap
    const sorted = companies.sort((a, b) => {
      const aTickerMatch = a.ticker.startsWith(query);
      const bTickerMatch = b.ticker.startsWith(query);

      // Prioritize ticker matches over name matches
      if (aTickerMatch && !bTickerMatch) return -1;
      if (!aTickerMatch && bTickerMatch) return 1;

      // Within same category, sort by market cap (larger first)
      if (a.marketCap !== b.marketCap) {
        return (b.marketCap || 0) - (a.marketCap || 0);
      }

      // Finally by ticker alphabetically
      return a.ticker.localeCompare(b.ticker);
    });

    return NextResponse.json({
      companies: sorted.slice(0, 10).map(c => ({
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
