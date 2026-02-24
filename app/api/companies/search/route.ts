/**
 * @module app/api/companies/search/route
 * @description Next.js API route handler providing typeahead search for companies by ticker symbol or company name with intelligent result ranking
 *
 * PURPOSE:
 * - Query Prisma database for companies matching ticker prefix or name substring case-insensitively
 * - Filter results to only include companies with at least one associated filing
 * - Rank results prioritizing exact ticker matches first, then by market capitalization descending
 * - Return top 10 companies with ticker, name, market cap, and filing count for autocomplete UI
 *
 * DEPENDENCIES:
 * - next/server - Provides NextResponse for JSON API responses
 * - @/lib/prisma - Database client for querying Company and Filing models
 *
 * EXPORTS:
 * - dynamic (const) - Forces dynamic rendering to prevent route caching
 * - GET (function) - Handles GET /api/companies/search?q={query} returning ranked company suggestions
 *
 * PATTERNS:
 * - Call GET /api/companies/search?q=AAPL from client to get autocomplete suggestions
 * - Query parameter 'q' is required with minimum 1 character; returns empty array if missing
 * - Response shape: { companies: [{ ticker, name, marketCap, filingCount }] } limited to 10 results
 * - Use for ticker input fields with real-time search as user types
 *
 * CLAUDE NOTES:
 * - Fetches 50 companies then sorts and slices to 10 to ensure accurate ranking after database query
 * - Sorting algorithm: exact ticker prefix match beats name match, then market cap DESC, then ticker alphabetically
 * - Only returns companies that have filings via 'filings: { some: {} }' constraint to filter incomplete data
 * - Query is uppercased and trimmed to normalize ticker symbol searches (tickers are uppercase by convention)
 */
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
