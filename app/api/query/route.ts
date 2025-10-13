import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Natural Language Query API
 *
 * Converts natural language queries to database queries
 * Phase 1: Pattern matching for common query types
 */

interface QueryPattern {
  pattern: RegExp;
  handler: (matches: RegExpMatchArray, query: string) => Promise<any>;
}

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query string is required' },
        { status: 400 }
      );
    }

    const normalizedQuery = query.toLowerCase().trim();

    // Query patterns (most specific first)
    const patterns: QueryPattern[] = [
      // "Show me [TICKER] stock price and P/E ratio"
      {
        pattern: /(?:show|get|what(?:'s| is))(?:\s+me)?\s+(\w+)\s+(?:stock\s+)?(?:price|p\/e|pe|financials?|metrics?)/i,
        handler: async (matches) => {
          const ticker = matches[1].toUpperCase();

          const company = await prisma.company.findUnique({
            where: { ticker },
            select: {
              ticker: true,
              name: true,
              currentPrice: true,
              peRatio: true,
              forwardPE: true,
              marketCap: true,
              fiftyTwoWeekHigh: true,
              fiftyTwoWeekLow: true,
              analystTargetPrice: true,
              yahooLastUpdated: true
            }
          });

          if (!company) {
            return { error: `Company ${ticker} not found` };
          }

          return { company };
        }
      },

      // "List companies with P/E ratio < [N]"
      {
        pattern: /(?:list|show|find)\s+companies?\s+with\s+(?:p\/e|pe)\s+(?:ratio\s+)?(?:<|less than|under|below)\s+(\d+(?:\.\d+)?)/i,
        handler: async (matches) => {
          const maxPE = parseFloat(matches[1]);

          const companies = await prisma.company.findMany({
            where: {
              peRatio: {
                lte: maxPE,
                gt: 0 // Exclude negative/zero P/E
              }
            },
            select: {
              ticker: true,
              name: true,
              currentPrice: true,
              peRatio: true,
              marketCap: true
            },
            orderBy: {
              peRatio: 'asc'
            },
            take: 50
          });

          return { companies, message: `Companies with P/E ratio < ${maxPE}` };
        }
      },

      // "Show companies with market cap > [N]B" or "> $[N]B"
      {
        pattern: /(?:list|show|find)\s+companies?\s+with\s+market\s+cap\s+(?:>|greater than|above|over)\s+\$?(\d+(?:\.\d+)?)\s*([bm])/i,
        handler: async (matches) => {
          const value = parseFloat(matches[1]);
          const unit = matches[2].toLowerCase();
          const multiplier = unit === 'b' ? 1e9 : 1e6;
          const minMarketCap = value * multiplier;

          const companies = await prisma.company.findMany({
            where: {
              marketCap: {
                gte: minMarketCap
              }
            },
            select: {
              ticker: true,
              name: true,
              currentPrice: true,
              marketCap: true,
              peRatio: true
            },
            orderBy: {
              marketCap: 'desc'
            },
            take: 50
          });

          return {
            companies,
            message: `Companies with market cap > $${value}${unit.toUpperCase()}`
          };
        }
      },

      // "Show me all [TICKER] filings in the last [N] days"
      {
        pattern: /(?:show|find|get|list)\s+(?:me\s+)?(?:all\s+)?(\w+)\s+filings?\s+(?:in\s+)?(?:the\s+)?last\s+(\d+)\s+days?/i,
        handler: async (matches) => {
          const ticker = matches[1].toUpperCase();
          const days = parseInt(matches[2]);
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - days);

          const filings = await prisma.filing.findMany({
            where: {
              company: {
                ticker: ticker
              },
              filingDate: {
                gte: startDate
              }
            },
            include: {
              company: true
            },
            orderBy: {
              filingDate: 'desc'
            },
            take: 100
          });

          return { filings };
        }
      },

      // "Show me all 8-Ks filed this week/month"
      {
        pattern: /(?:show|find|get|list)\s+(?:me\s+)?(?:all\s+)?(10-[KQ]|8-K)\s+(?:filings?\s+)?filed\s+this\s+(week|month)/i,
        handler: async (matches) => {
          const filingType = matches[1].toUpperCase();
          const period = matches[2].toLowerCase();

          const now = new Date();
          let startDate = new Date();

          if (period === 'week') {
            startDate.setDate(now.getDate() - 7);
          } else if (period === 'month') {
            startDate.setMonth(now.getMonth() - 1);
          }

          const filings = await prisma.filing.findMany({
            where: {
              filingType: filingType,
              filingDate: {
                gte: startDate
              }
            },
            include: {
              company: true
            },
            orderBy: {
              filingDate: 'desc'
            },
            take: 100
          });

          return { filings };
        }
      },

      // "Which companies filed 10-Qs in September?" or "in Q1"
      {
        pattern: /which\s+companies?\s+filed\s+(10-[KQ]|8-K)s?\s+in\s+(january|february|march|april|may|june|july|august|september|october|november|december|q[1-4])\s*(\d{4})?/i,
        handler: async (matches) => {
          const filingType = matches[1].toUpperCase();
          const period = matches[2].toLowerCase();
          const year = matches[3] ? parseInt(matches[3]) : new Date().getFullYear();

          let startMonth, endMonth;

          // Handle quarters
          if (period.startsWith('q')) {
            const quarter = parseInt(period[1]);
            startMonth = (quarter - 1) * 3;
            endMonth = startMonth + 2;
          } else {
            // Handle month names
            const months = ['january', 'february', 'march', 'april', 'may', 'june',
                          'july', 'august', 'september', 'october', 'november', 'december'];
            startMonth = months.indexOf(period);
            endMonth = startMonth;
          }

          const startDate = new Date(year, startMonth, 1);
          const endDate = new Date(year, endMonth + 1, 0);

          const filings = await prisma.filing.findMany({
            where: {
              filingType: filingType,
              filingDate: {
                gte: startDate,
                lte: endDate
              }
            },
            include: {
              company: true
            },
            orderBy: {
              filingDate: 'desc'
            },
            take: 100
          });

          return { filings };
        }
      },

      // "List all [TICKER] filings"
      {
        pattern: /(?:list|show|find|get)\s+(?:all\s+)?(\w+)\s+filings?/i,
        handler: async (matches) => {
          const ticker = matches[1].toUpperCase();

          const filings = await prisma.filing.findMany({
            where: {
              company: {
                ticker: ticker
              }
            },
            include: {
              company: true
            },
            orderBy: {
              filingDate: 'desc'
            },
            take: 50
          });

          return { filings };
        }
      },

      // "Show 10-Ks filed in Q1 2025"
      {
        pattern: /(?:show|find|list)\s+(10-[KQ]|8-K)s?\s+filed\s+in\s+(q[1-4])\s+(\d{4})/i,
        handler: async (matches) => {
          const filingType = matches[1].toUpperCase();
          const quarter = parseInt(matches[2][1]);
          const year = parseInt(matches[3]);

          const startMonth = (quarter - 1) * 3;
          const endMonth = startMonth + 2;

          const startDate = new Date(year, startMonth, 1);
          const endDate = new Date(year, endMonth + 1, 0);

          const filings = await prisma.filing.findMany({
            where: {
              filingType: filingType,
              filingDate: {
                gte: startDate,
                lte: endDate
              }
            },
            include: {
              company: true
            },
            orderBy: {
              filingDate: 'desc'
            },
            take: 100
          });

          return { filings };
        }
      },

      // Fallback: Just show recent filings
      {
        pattern: /./,
        handler: async () => {
          const filings = await prisma.filing.findMany({
            include: {
              company: true
            },
            orderBy: {
              filingDate: 'desc'
            },
            take: 20
          });

          return {
            filings,
            message: "Showing recent filings (couldn't parse specific query)"
          };
        }
      }
    ];

    // Try each pattern
    for (const { pattern, handler } of patterns) {
      const matches = normalizedQuery.match(pattern);
      if (matches) {
        const result = await handler(matches, normalizedQuery);
        return NextResponse.json(result);
      }
    }

    // Shouldn't reach here, but just in case
    return NextResponse.json({
      error: 'Could not understand query',
      suggestion: 'Try queries like: "Show me all AAPL filings in the last 30 days"'
    });

  } catch (error: any) {
    console.error('[Query API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process query' },
      { status: 500 }
    );
  }
}
