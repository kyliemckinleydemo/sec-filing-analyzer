/**
 * @module app/api/chat/route
 * @description Next.js API route streaming Claude AI responses for natural language queries about SEC filing analysis data including financials, risk scores, and stock performance
 *
 * PURPOSE:
 * - Authenticate requests and enforce 100 AI analyses per day quota using requireAuthAndAIQuota middleware
 * - Fetch up to 20 recent SEC filings from Prisma filtered by ticker or sector with company metrics and predictions
 * - Build enriched filing context with calculated fields like YoY growth rates, market cap in billions, distance from 52-week high, and prediction accuracy
 * - Stream Claude Sonnet 4.5 responses via Server-Sent Events processing user questions against filing data with specific instructions to avoid disclaimers and focus on available data
 *
 * DEPENDENCIES:
 * - next/server - Provides NextRequest type for API route handler
 * - @/lib/prisma - Accesses Prisma client to query Filing and Company models with nested includes
 * - @/lib/claude-client - Provides claudeClient wrapper for streaming Claude API messages.create calls
 * - @/lib/api-middleware - Supplies requireAuthAndAIQuota to verify JWT and check daily usage limit
 *
 * EXPORTS:
 * - runtime (const) - Set to 'nodejs' to enable Node.js runtime for streaming responses
 * - dynamic (const) - Set to 'force-dynamic' to prevent route caching and ensure fresh data
 * - POST (function) - Handles chat requests with streaming AI responses, returns 401 if unauthenticated, 404 if no filings found, or text/plain stream
 *
 * PATTERNS:
 * - Send POST to /api/chat with JSON body { message: string, ticker?: string, sector?: string }
 * - Receive streaming text/plain response chunks - parse incrementally as Claude generates tokens
 * - Handle 401 with requiresAuth: true to prompt login - quota resets daily at midnight
 * - Use ticker filter for company-specific questions or sector filter for cross-company comparisons
 *
 * CLAUDE NOTES:
 * - Prompt explicitly forbids Claude from mentioning missing data or limitations - instructs to answer confidently with available information only
 * - Filing context limited to 20 items and truncates concernFactors/positiveFactors to 2 each to stay within token budget
 * - Calculates derived metrics like quarter from filing date, market cap in billions, distance from 52-week high percentage, and prediction error vs actual returns
 * - Uses temperature 0.3 for consistent factual responses and max_tokens 2048 to balance detail with response time
 * - Filters out null/undefined values from filing context to reduce noise and improve Claude's focus on actual data points
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { claudeClient } from '@/lib/claude-client';
import { requireAuthAndAIQuota } from '@/lib/api-middleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Intelligent Chat API for SEC Filing Analysis
 *
 * Uses Claude AI to understand natural language queries and retrieve relevant
 * filing data to answer questions about risk trends, concern levels, and more.
 */

const COMPANY_SELECT = {
  ticker: true,
  name: true,
  sector: true,
  currentPrice: true,
  marketCap: true,
  peRatio: true,
  fiftyTwoWeekHigh: true,
  fiftyTwoWeekLow: true,
  analystTargetPrice: true,
  dividendYield: true,
  beta: true,
  latestRevenue: true,
  latestRevenueYoY: true,
  latestNetIncome: true,
  latestNetIncomeYoY: true,
  latestEPS: true,
  latestGrossMargin: true,
  latestOperatingMargin: true,
  latestQuarter: true,
} as const;

async function fetchRelevantFilings(ticker?: string, sectorNames?: string[], limit: number = 10) {
  const where: any = {};

  if (ticker) {
    where.company = { ticker: ticker.toUpperCase() };
  } else if (sectorNames && sectorNames.length > 0) {
    where.company = { sector: { in: sectorNames } };
  }

  return await prisma.filing.findMany({
    where,
    include: {
      company: {
        select: COMPANY_SELECT,
      },
      predictions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { filingDate: 'desc' },
    take: limit,
  });
}

async function fetchHighConcernFilings(limit: number = 20) {
  return await prisma.filing.findMany({
    where: {
      concernLevel: { gte: 5 },
      actual30dReturn: { not: null },
    },
    include: {
      company: { select: COMPANY_SELECT },
      predictions: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { filingDate: 'desc' },
    take: limit,
  });
}

async function fetchAnalyzedFilings(limit: number = 20) {
  return await prisma.filing.findMany({
    where: {
      analysisData: { not: null },
      concernLevel: { not: null },
    },
    include: {
      company: { select: COMPANY_SELECT },
      predictions: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { filingDate: 'desc' },
    take: limit,
  });
}

async function fetchSectorCompanies(sectorNames: string[]) {
  return await prisma.company.findMany({
    where: { sector: { in: sectorNames } },
    select: COMPANY_SELECT,
    orderBy: { marketCap: 'desc' },
    take: 50,
  });
}

function buildFilingContext(filings: any[]) {
  return filings.map((f) => {
    let analysisData;
    try {
      analysisData = f.analysisData ? JSON.parse(f.analysisData) : null;
    } catch {
      analysisData = null;
    }

    const prediction = f.predictions?.[0];
    const structuredData = analysisData?.financialMetrics?.structuredData;

    // Extract quarter and year from filing date for easy filtering
    const filingDate = new Date(f.filingDate);
    const quarter = Math.floor(filingDate.getMonth() / 3) + 1;
    const year = filingDate.getFullYear();

    // Calculate growth rates if available
    const revenueYoY = structuredData?.revenueYoY || null;
    const netIncomeYoY = structuredData?.netIncomeYoY || null;
    const epsYoY = structuredData?.epsYoY || null;

    // Format market cap in billions for easier comparison
    const marketCapB = f.company.marketCap ? (f.company.marketCap / 1e9).toFixed(1) : null;

    const filingData = {
      ticker: f.company.ticker,
      companyName: f.company.name,
      sector: f.company.sector,
      filingType: f.filingType,
      filingDate: f.filingDate.toISOString().split('T')[0],
      quarter: `Q${quarter}`,
      year,

      // Financial Metrics from XBRL
      revenue: structuredData?.revenue || null,
      revenueYoY: revenueYoY,
      netIncome: structuredData?.netIncome || null,
      netIncomeYoY: netIncomeYoY,
      eps: structuredData?.eps || null,
      epsYoY: epsYoY,
      grossMargin: structuredData?.grossMargin ? `${structuredData.grossMargin.toFixed(1)}%` : null,
      operatingMargin: structuredData?.operatingMargin ? `${structuredData.operatingMargin.toFixed(1)}%` : null,

      // Company Metrics
      currentPrice: f.company.currentPrice,
      marketCap: f.company.marketCap,
      marketCapB: marketCapB ? `$${marketCapB}B` : null,
      peRatio: f.company.peRatio,
      dividendYield: f.company.dividendYield,
      beta: f.company.beta,
      fiftyTwoWeekHigh: f.company.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: f.company.fiftyTwoWeekLow,
      distanceFrom52WeekHigh: f.company.currentPrice && f.company.fiftyTwoWeekHigh
        ? `${(((f.company.currentPrice - f.company.fiftyTwoWeekHigh) / f.company.fiftyTwoWeekHigh) * 100).toFixed(1)}%`
        : null,
      analystTargetPrice: f.company.analystTargetPrice,

      // Company-Level Fundamentals (from latest financial data)
      companyRevenue: f.company.latestRevenue,
      companyRevenueYoY: f.company.latestRevenueYoY,
      companyNetIncome: f.company.latestNetIncome,
      companyNetIncomeYoY: f.company.latestNetIncomeYoY,
      companyEPS: f.company.latestEPS,
      companyGrossMargin: f.company.latestGrossMargin,
      companyOperatingMargin: f.company.latestOperatingMargin,
      companyLatestQuarter: f.company.latestQuarter,

      // Earnings Analysis
      epsSurprise: structuredData?.epsSurprise || null,
      epsSurpriseMagnitude: structuredData?.epsSurpriseMagnitude || null,
      revenueSurprise: structuredData?.revenueSurprise || null,
      revenueSurpriseMagnitude: structuredData?.revenueSurpriseMagnitude || null,

      // Risk & Sentiment Analysis
      concernLevel: f.concernLevel,
      concernLabel: analysisData?.concernAssessment?.concernLabel || 'UNKNOWN',
      netAssessment: analysisData?.concernAssessment?.netAssessment || 'UNKNOWN',
      riskScore: f.riskScore,
      sentimentScore: f.sentimentScore,

      // Stock Performance Post-Filing
      predicted7dReturn: prediction?.predicted7dReturn || null,
      actual7dReturn: f.actual7dReturn || null,
      actual30dReturn: f.actual30dReturn || null,
      actual7dAlpha: f.actual7dAlpha || null,
      actual30dAlpha: f.actual30dAlpha || null,

      // Prediction Accuracy (if we have both predicted and actual)
      predictionError7d: prediction?.predicted7dReturn && f.actual7dReturn
        ? `${(Math.abs(prediction.predicted7dReturn - f.actual7dReturn)).toFixed(2)}%`
        : null,
      predictionAccuracy7d: prediction?.predicted7dReturn && f.actual7dReturn
        ? (Math.abs(prediction.predicted7dReturn - f.actual7dReturn) < 3 ? 'accurate' : 'off')
        : null,

      // Key Highlights (truncated for token efficiency)
      concernFactors: analysisData?.concernAssessment?.concernFactors?.slice(0, 2) || [],
      positiveFactors: analysisData?.concernAssessment?.positiveFactors?.slice(0, 2) || [],
      topRiskChanges: analysisData?.risks?.topChanges?.slice(0, 2) || [],
    };

    // Filter out null/undefined values to reduce noise in AI context
    return Object.fromEntries(
      Object.entries(filingData).filter(([_, value]) => value !== null && value !== undefined)
    );
  }).slice(0, 20); // Limit context to avoid token overflow
}

function buildCompanyContext(companies: any[]) {
  return companies.map((c) => {
    const marketCapB = c.marketCap ? (c.marketCap / 1e9).toFixed(1) : null;
    const data: Record<string, any> = {
      ticker: c.ticker,
      name: c.name,
      sector: c.sector,
      currentPrice: c.currentPrice,
      marketCapB: marketCapB ? `$${marketCapB}B` : null,
      peRatio: c.peRatio,
      dividendYield: c.dividendYield,
      beta: c.beta,
      analystTargetPrice: c.analystTargetPrice,
      latestRevenue: c.latestRevenue,
      revenueYoY: c.latestRevenueYoY,
      latestNetIncome: c.latestNetIncome,
      netIncomeYoY: c.latestNetIncomeYoY,
      eps: c.latestEPS,
      grossMargin: c.latestGrossMargin,
      operatingMargin: c.latestOperatingMargin,
      latestQuarter: c.latestQuarter,
      fiftyTwoWeekHigh: c.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: c.fiftyTwoWeekLow,
    };
    return Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== null && v !== undefined)
    );
  });
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication and AI quota (requires login, 100 analyses/day)
    const authCheck = await requireAuthAndAIQuota(request);
    if (!authCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: authCheck.response?.status === 401 ? 'Authentication required' : 'Daily quota exceeded',
          message: authCheck.response?.status === 401
            ? 'Sign up for free to access AI-powered chat. Get 100 AI analyses per day!'
            : 'You\'ve used all your AI analyses for today. Resets at midnight.',
          requiresAuth: true,
        }),
        {
          status: authCheck.response?.status || 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const { message, ticker, sector: explicitSector } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Detect sector from message text if not explicitly provided
    // Map common names to the DB sector values (some sectors have multiple names)
    const SECTOR_ALIASES: Record<string, string[]> = {
      'Technology': ['Technology', 'Information Technology'],
      'Basic Materials': ['Basic Materials'],
      'Communication Services': ['Communication Services'],
      'Consumer Cyclical': ['Consumer Cyclical', 'Consumer Discretionary'],
      'Consumer Defensive': ['Consumer Defensive', 'Consumer Staples'],
      'Energy': ['Energy'],
      'Financial Services': ['Financial Services', 'Financials'],
      'Healthcare': ['Healthcare'],
      'Industrials': ['Industrials'],
      'Real Estate': ['Real Estate'],
      'Utilities': ['Utilities'],
    };
    let sector = explicitSector || '';
    let sectorDbNames: string[] = [];
    if (!sector) {
      const msgLower = message.toLowerCase();
      for (const [name, aliases] of Object.entries(SECTOR_ALIASES)) {
        if (msgLower.includes(name.toLowerCase())) {
          sector = name;
          sectorDbNames = aliases;
          break;
        }
      }
    }
    if (sector && sectorDbNames.length === 0) {
      sectorDbNames = SECTOR_ALIASES[sector] || [sector];
    }

    // Detect ticker from message text if not explicitly provided (e.g., "AAPL's risk factors")
    let effectiveTicker = ticker || '';
    if (!effectiveTicker) {
      const tickerMatch = message.match(/\b([A-Z]{1,5})\b(?:'s|'s|\s)/);
      if (tickerMatch) {
        // Verify it's a real ticker by checking the database
        const company = await prisma.company.findFirst({ where: { ticker: tickerMatch[1] }, select: { ticker: true } });
        if (company) {
          effectiveTicker = company.ticker;
        }
      }
    }

    console.log(`[Chat API] Query: "${message}"${effectiveTicker ? ` (ticker: ${effectiveTicker})` : ''}${sector ? ` (sector: ${sector})` : ''}`);

    // Detect query intent for smarter data fetching
    const msgLower = message.toLowerCase();
    const wantsConcern = msgLower.includes('concern') || msgLower.includes('risk level');
    const wantsReturns = msgLower.includes('return') || msgLower.includes('performance') || msgLower.includes('alpha');

    // Fetch relevant filings based on context
    let filings;
    if (!effectiveTicker && !sector && wantsConcern) {
      // Specialized query for concern-level analysis
      filings = await fetchHighConcernFilings(20);
    } else if (!effectiveTicker && !sector) {
      // General query — fetch filings that have analysis data (not random recent ones)
      filings = await fetchAnalyzedFilings(20);
    } else {
      filings = await fetchRelevantFilings(effectiveTicker || undefined, sectorDbNames.length > 0 ? sectorDbNames : undefined, (effectiveTicker || sector) ? 20 : 10);
    }

    // For sector queries, also fetch all companies in the sector for comprehensive coverage
    let sectorCompanies: any[] = [];
    if (sector && !effectiveTicker && sectorDbNames.length > 0) {
      sectorCompanies = await fetchSectorCompanies(sectorDbNames);
    }

    if (filings.length === 0 && sectorCompanies.length === 0) {
      return new Response(
        JSON.stringify({
          error: effectiveTicker
            ? `No filings found for ${effectiveTicker}. Try analyzing a filing first.`
            : 'No filings found in database. Try analyzing some filings first.'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const filingContext = buildFilingContext(filings);
    const companyContext = sectorCompanies.length > 0 ? buildCompanyContext(sectorCompanies) : null;

    // Build prompt for Claude
    const prompt = `You are a senior financial analyst at a top-tier investment firm. Answer the user's question using the data provided. Be specific, quantitative, and insightful. When comparing companies, always rank them and highlight standouts.
${companyContext ? `
SECTOR COMPANIES (${sectorCompanies.length} companies in ${sector}):
${JSON.stringify(companyContext, null, 2)}
` : ''}
RECENT FILING DATA:
${JSON.stringify(filingContext, null, 2)}

DATA FIELDS EXPLAINED:
- sector: Company sector (e.g., "Technology", "Healthcare")
- quarter/year: Filing period (e.g., "Q2" 2025)
- revenue/revenueYoY: Revenue and year-over-year growth rate (e.g., "+15.3%")
- netIncome/netIncomeYoY: Net income and YoY growth
- eps/epsYoY: Earnings per share and YoY growth
- grossMargin/operatingMargin: Profit margins
- marketCapB: Market capitalization in billions (e.g., "$250.5B")
- epsSurprise/revenueSurprise: Beat/miss vs analyst estimates
- concernLevel: 0-10 scale (0=excellent, 10=critical concerns)
- concernLabel: LOW/MODERATE/ELEVATED/HIGH/CRITICAL

STOCK PRICE FIELDS:
- currentPrice: Current stock price
- fiftyTwoWeekHigh/Low: 52-week price range
- distanceFrom52WeekHigh: How far from 52-week high (e.g., "-15.2%")
- actual7dReturn/actual30dReturn: Stock return 7/30 days after filing
- actual7dAlpha/actual30dAlpha: Return vs S&P 500 (market-relative)
- predicted7dReturn: ML model's predicted 7-day return
- predictionError7d: Difference between predicted and actual
- predictionAccuracy7d: "accurate" (within 3%) or "off"

USER QUESTION:
${message}

INSTRUCTIONS:
1. **Answer directly** — lead with the key finding, not preambles or disclaimers
2. **Be quantitative** — use specific numbers ($, %, ratios) from the data in every answer
3. **Never apologize for missing data** — only discuss what you have; skip fields silently if absent
4. **Use markdown tables** for any comparison of 3+ companies — include the most relevant metrics
5. **Rank and highlight** — when comparing, sort by the most relevant metric and call out the top/bottom performers
6. **Use SECTOR COMPANIES data** for broad questions about a sector (revenue growth, valuations, dividends, etc.)
7. **Use FILING DATA** for questions about specific filings, risk factors, concern levels, or post-filing returns
8. **Keep it concise** — aim for a clear, scannable answer. Tables > walls of text.

Answer the question:`;

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Use Claude's streaming API
          const response = await claudeClient['client'].messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 2048,
            temperature: 0.3,
            stream: true,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          });

          for await (const event of response) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              const chunk = encoder.encode(event.delta.text);
              controller.enqueue(chunk);
            }
          }

          controller.close();
        } catch (error: any) {
          console.error('[Chat API] Streaming error:', error);
          const errorMessage = encoder.encode(
            `\n\n[Error: ${error.message}]`
          );
          controller.enqueue(errorMessage);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('[Chat API] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to process chat message' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
