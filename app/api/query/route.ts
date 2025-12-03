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
  handler: (matches: RegExpMatchArray, query: string, skip?: number, pageSize?: number) => Promise<any>;
}

/**
 * Serialize BigInt values to strings for JSON compatibility
 */
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'bigint') {
    return Number(obj);
  }

  // Handle Date objects by converting to ISO string
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt);
  }

  if (typeof obj === 'object') {
    const serialized: any = {};
    for (const key in obj) {
      serialized[key] = serializeBigInt(obj[key]);
    }
    return serialized;
  }

  return obj;
}

export async function POST(request: Request) {
  try {
    const { query, page = 1 } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query string is required' },
        { status: 400 }
      );
    }

    const normalizedQuery = query.toLowerCase().trim();
    const pageSize = 50;
    const skip = (page - 1) * pageSize;

    // Query patterns (most specific first)
    const patterns: QueryPattern[] = [
      // "Show [TICKER] analyst target price history" or "track over time"
      {
        pattern: /(?:show|track|get)(?:\s+me)?\s+(\w+)\s+(?:analyst\s+)?(?:target\s+price|eps\s+estimate|p\/e\s+ratio)\s+(?:history|over\s+time|trend)/i,
        handler: async (matches) => {
          const ticker = matches[1].toUpperCase();

          const company = await prisma.company.findUnique({
            where: { ticker },
            select: { id: true, name: true, ticker: true }
          });

          if (!company) {
            return { error: `Company ${ticker} not found` };
          }

          const snapshots = await prisma.companySnapshot.findMany({
            where: { companyId: company.id },
            select: {
              snapshotDate: true,
              analystTargetPrice: true,
              epsEstimateCurrentY: true,
              epsEstimateNextY: true,
              peRatio: true,
              currentPrice: true,
              triggerType: true
            },
            orderBy: { snapshotDate: 'desc' },
            take: 30  // Last 30 snapshots
          });

          return {
            company,
            snapshots,
            message: `Historical data for ${ticker} (${snapshots.length} snapshots)`
          };
        }
      },

      // "Compare [TICKER] estimates before and after last filing"
      {
        pattern: /(?:compare|show)\s+(\w+)\s+(?:estimates?|metrics?)\s+(?:before\s+and\s+after|around)\s+(?:last\s+)?filing/i,
        handler: async (matches) => {
          const ticker = matches[1].toUpperCase();

          const company = await prisma.company.findUnique({
            where: { ticker },
            select: { id: true, name: true, ticker: true }
          });

          if (!company) {
            return { error: `Company ${ticker} not found` };
          }

          // Get last filing
          const lastFiling = await prisma.filing.findFirst({
            where: { companyId: company.id },
            orderBy: { filingDate: 'desc' },
            select: {
              id: true,
              filingType: true,
              filingDate: true,
              filingUrl: true
            }
          });

          if (!lastFiling) {
            return { error: `No filings found for ${ticker}` };
          }

          // Get snapshot right after filing (if created)
          const filingSnapshot = await prisma.companySnapshot.findFirst({
            where: {
              companyId: company.id,
              filingId: lastFiling.id
            },
            orderBy: { snapshotDate: 'asc' }
          });

          // Get snapshot before filing
          const beforeSnapshot = await prisma.companySnapshot.findFirst({
            where: {
              companyId: company.id,
              snapshotDate: { lt: lastFiling.filingDate }
            },
            orderBy: { snapshotDate: 'desc' }
          });

          // Get most recent snapshot
          const afterSnapshot = await prisma.companySnapshot.findFirst({
            where: {
              companyId: company.id,
              snapshotDate: { gte: lastFiling.filingDate }
            },
            orderBy: { snapshotDate: 'asc' }
          });

          return {
            company,
            filing: lastFiling,
            before: beforeSnapshot,
            after: afterSnapshot || filingSnapshot,
            message: `Comparing estimates before/after ${lastFiling.filingType} on ${lastFiling.filingDate.toISOString().split('T')[0]}`
          };
        }
      },

      // "Companies where analyst target increased/decreased"
      {
        pattern: /(?:companies?|show|list)\s+where\s+(?:analyst\s+)?target(?:\s+price)?\s+(increased?|decreased?|went\s+up|went\s+down)/i,
        handler: async (matches) => {
          const direction = matches[1].toLowerCase();
          const isIncrease = direction.includes('increas') || direction.includes('up');

          // Get companies with at least 2 snapshots
          const companies = await prisma.company.findMany({
            where: {
              snapshots: {
                some: {}
              }
            },
            select: {
              id: true,
              ticker: true,
              name: true,
              snapshots: {
                where: {
                  analystTargetPrice: { not: null }
                },
                orderBy: { snapshotDate: 'desc' },
                take: 2,
                select: {
                  snapshotDate: true,
                  analystTargetPrice: true
                }
              }
            }
          });

          // Calculate changes
          const changes = companies
            .filter(c => c.snapshots.length >= 2)
            .map(c => {
              const latest = c.snapshots[0];
              const previous = c.snapshots[1];
              const change = latest.analystTargetPrice! - previous.analystTargetPrice!;
              const changePercent = (change / previous.analystTargetPrice!) * 100;

              return {
                ticker: c.ticker,
                name: c.name,
                previousTarget: previous.analystTargetPrice,
                latestTarget: latest.analystTargetPrice,
                change,
                changePercent,
                daysBetween: Math.floor(
                  (latest.snapshotDate.getTime() - previous.snapshotDate.getTime()) / (1000 * 60 * 60 * 24)
                )
              };
            })
            .filter(c => isIncrease ? c.change > 0 : c.change < 0)
            .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
            .slice(0, 50);

          return {
            companies: changes,
            message: `Companies where analyst target ${isIncrease ? 'increased' : 'decreased'} (${changes.length} found)`
          };
        }
      },

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

      // ==================================================================
      // NEW FINANCIAL SCREENING QUERIES (Phase 1 enhancement)
      // ==================================================================

      // "Show companies with dividend yield > X%"
      {
        pattern: /(?:show|find|list)\s+companies?\s+with\s+dividend\s+yield\s+(?:>|greater than|above|over)\s+(\d+(?:\.\d+)?)/i,
        handler: async (matches, query, skip = 0, pageSize = 50) => {
          const minYield = parseFloat(matches[1]) / 100; // Convert to decimal

          const where = {
            dividendYield: { gte: minYield }
          };

          const [companies, totalCount] = await Promise.all([
            prisma.company.findMany({
              where,
              select: {
                ticker: true,
                name: true,
                currentPrice: true,
                dividendYield: true,
                marketCap: true,
                peRatio: true
              },
              orderBy: [
                { dividendYield: 'desc' },
                { marketCap: 'desc' }  // Secondary sort by market cap
              ],
              skip,
              take: pageSize
            }),
            prisma.company.count({ where })
          ]);

          return {
            companies,
            totalCount,
            pageSize,
            currentPage: Math.floor(skip / pageSize) + 1,
            totalPages: Math.ceil(totalCount / pageSize),
            sortBy: 'dividendYield',
            sortOrder: 'desc',
            message: `Companies with dividend yield > ${matches[1]}% (${totalCount} total)`
          };
        }
      },

      // "Find low beta stocks" or "Show companies with beta < X"
      {
        pattern: /(?:show|find|list)\s+(?:companies?\s+with\s+)?(?:low\s+beta|beta\s+(?:<|less than|under|below)\s+(\d+(?:\.\d+)?))/i,
        handler: async (matches, query, skip = 0, pageSize = 50) => {
          const maxBeta = matches[1] ? parseFloat(matches[1]) : 0.9; // Default to 0.9 for "low beta"

          const where = {
            beta: { lte: maxBeta, gte: 0 }
          };

          const [companies, totalCount] = await Promise.all([
            prisma.company.findMany({
              where,
              select: {
                ticker: true,
                name: true,
                currentPrice: true,
                beta: true,
                marketCap: true,
                peRatio: true
              },
              orderBy: [
                { beta: 'asc' },
                { marketCap: 'desc' }  // Secondary sort by market cap
              ],
              skip,
              take: pageSize
            }),
            prisma.company.count({ where })
          ]);

          return {
            companies,
            totalCount,
            pageSize,
            currentPage: Math.floor(skip / pageSize) + 1,
            totalPages: Math.ceil(totalCount / pageSize),
            sortBy: 'beta',
            sortOrder: 'asc',
            message: `Companies with beta < ${maxBeta} (${totalCount} total)`
          };
        }
      },

      // "Show companies with revenue growth > X%"
      {
        pattern: /(?:show|find|list)\s+companies?\s+with\s+revenue\s+growth\s+(?:>|greater than|above|over)\s+(\d+(?:\.\d+)?)/i,
        handler: async (matches, query, skip = 0, pageSize = 50) => {
          const minGrowth = parseFloat(matches[1]);

          const where = {
            latestRevenueYoY: { gte: minGrowth }
          };

          const [companies, totalCount] = await Promise.all([
            prisma.company.findMany({
              where,
              select: {
                ticker: true,
                name: true,
                latestRevenue: true,
                latestRevenueYoY: true,
                latestQuarter: true,
                marketCap: true,
                peRatio: true
              },
              orderBy: [
                { latestRevenueYoY: 'desc' },
                { marketCap: 'desc' }  // Secondary sort by market cap
              ],
              skip,
              take: pageSize
            }),
            prisma.company.count({ where })
          ]);

          return {
            companies,
            totalCount,
            pageSize,
            currentPage: Math.floor(skip / pageSize) + 1,
            totalPages: Math.ceil(totalCount / pageSize),
            sortBy: 'latestRevenueYoY',
            sortOrder: 'desc',
            message: `Companies with revenue growth > ${minGrowth}% (${totalCount} total)`
          };
        }
      },

      // "Show companies with net income > $XB"
      {
        pattern: /(?:show|find|list)\s+companies?\s+with\s+net\s+income\s+(?:>|greater than|above|over)\s+\$?(\d+(?:\.\d+)?)\s*([bm])/i,
        handler: async (matches) => {
          const value = parseFloat(matches[1]);
          const unit = matches[2].toLowerCase();
          const multiplier = unit === 'b' ? 1e9 : 1e6;
          const minNetIncome = value * multiplier;

          const companies = await prisma.company.findMany({
            where: {
              latestNetIncome: { gte: minNetIncome }
            },
            select: {
              ticker: true,
              name: true,
              latestNetIncome: true,
              latestNetIncomeYoY: true,
              latestQuarter: true,
              marketCap: true
            },
            orderBy: { latestNetIncome: 'desc' },
            take: 50
          });

          return {
            companies,
            sortBy: 'latestNetIncome',
            sortOrder: 'desc',
            message: `Companies with net income > $${value}${unit.toUpperCase()}`
          };
        }
      },

      // "Show companies with operating margin > X%"
      {
        pattern: /(?:show|find|list)\s+companies?\s+with\s+operating\s+margin\s+(?:>|greater than|above|over)\s+(\d+(?:\.\d+)?)/i,
        handler: async (matches) => {
          const minMargin = parseFloat(matches[1]);

          const companies = await prisma.company.findMany({
            where: {
              latestOperatingMargin: { gte: minMargin }
            },
            select: {
              ticker: true,
              name: true,
              latestOperatingMargin: true,
              latestGrossMargin: true,
              latestQuarter: true,
              marketCap: true
            },
            orderBy: { latestOperatingMargin: 'desc' },
            take: 50
          });

          return {
            companies,
            sortBy: 'latestOperatingMargin',
            sortOrder: 'desc',
            message: `Companies with operating margin > ${minMargin}%`
          };
        }
      },

      // "Find undervalued stocks" or "Show companies trading below target"
      {
        pattern: /(?:show|find|list)\s+(?:undervalued|companies?\s+trading\s+below\s+(?:analyst\s+)?target)/i,
        handler: async (matches, query, skip = 0, pageSize = 50) => {
          // Fetch all companies with both price and target price
          const allCompanies = await prisma.company.findMany({
            where: {
              currentPrice: { not: null },
              analystTargetPrice: { not: null }
            },
            select: {
              ticker: true,
              name: true,
              currentPrice: true,
              analystTargetPrice: true,
              peRatio: true,
              marketCap: true
            }
          });

          // Filter to companies trading below analyst target and calculate upside
          const allUndervalued = allCompanies
            .filter(c => c.currentPrice! < c.analystTargetPrice!)
            .map(c => ({
              ...c,
              upside: ((c.analystTargetPrice! - c.currentPrice!) / c.currentPrice! * 100).toFixed(1),
              upsideValue: ((c.analystTargetPrice! - c.currentPrice!) / c.currentPrice! * 100) // For sorting
            }))
            .sort((a, b) => {
              // Primary sort: highest upside first
              const upsideDiff = b.upsideValue - a.upsideValue;
              if (Math.abs(upsideDiff) > 0.01) return upsideDiff;

              // Secondary sort: market cap descending
              return (b.marketCap || 0) - (a.marketCap || 0);
            });

          const totalCount = allUndervalued.length;
          const paginatedCompanies = allUndervalued.slice(skip, skip + pageSize);

          return {
            companies: paginatedCompanies,
            totalCount,
            pageSize,
            currentPage: Math.floor(skip / pageSize) + 1,
            totalPages: Math.ceil(totalCount / pageSize),
            sortBy: 'upsideValue',
            sortOrder: 'desc',
            message: `Companies trading below analyst target price (${totalCount} total)`
          };
        }
      },

      // "Show high beta stocks" or "Show volatile stocks"
      {
        pattern: /(?:show|find|list)\s+(?:high\s+beta|volatile)\s+(?:stocks?|companies?)/i,
        handler: async () => {
          const companies = await prisma.company.findMany({
            where: {
              beta: { gte: 1.3 }
            },
            select: {
              ticker: true,
              name: true,
              currentPrice: true,
              beta: true,
              marketCap: true,
              peRatio: true
            },
            orderBy: { beta: 'desc' },
            take: 50
          });

          return {
            companies,
            sortBy: 'beta',
            sortOrder: 'desc',
            message: `High beta stocks (beta > 1.3)`
          };
        }
      },

      // "Show companies near 52-week high"
      {
        pattern: /(?:show|find|list)\s+companies?\s+(?:near|at|close\s+to)\s+52-?week\s+high/i,
        handler: async () => {
          const companies = await prisma.company.findMany({
            where: {
              currentPrice: { not: null },
              fiftyTwoWeekHigh: { not: null }
            },
            select: {
              ticker: true,
              name: true,
              currentPrice: true,
              fiftyTwoWeekHigh: true,
              fiftyTwoWeekLow: true,
              marketCap: true
            },
            take: 500 // Get more for filtering
          });

          // Filter to companies within 5% of 52-week high
          const nearHigh = companies.filter(c => {
            if (!c.currentPrice || !c.fiftyTwoWeekHigh) return false;
            const percentFromHigh = ((c.fiftyTwoWeekHigh - c.currentPrice) / c.fiftyTwoWeekHigh) * 100;
            return percentFromHigh <= 5;
          }).slice(0, 50);

          return {
            companies: nearHigh,
            sortBy: 'currentPrice',
            sortOrder: 'desc',
            message: `Companies within 5% of 52-week high`
          };
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
        const result = await handler(matches, normalizedQuery, skip, pageSize);
        return NextResponse.json(serializeBigInt(result));
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
