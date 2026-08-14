/**
 * @module app/api/mcp/route
 * @description Remote Model Context Protocol (MCP) server for StockHuntr, mounted as a
 * Next.js route handler at /api/mcp. Lets MCP clients (Claude, ChatGPT, Copilot, and
 * MCP-aware agents) query SEC filing analysis, 30-day predictions, company data, and
 * the model's track record directly. All data is read-only and sourced from the same
 * database that powers the site (primary source: SEC EDGAR).
 *
 * Transport: Streamable HTTP (GET + POST) via mcp-handler 2.x.
 * Endpoint:  https://www.stockhuntr.net/api/mcp
 */
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getLatestFilings } from '@/lib/filings-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DISCLAIMER =
  'StockHuntr is an educational/research tool. Predictions are model outputs, not investment advice.';

/** Wrap any JSON-serializable value as an MCP text content result. */
function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

const handler = createMcpHandler(
  (server) => {
    // ---- get_latest_filings ------------------------------------------------
    server.registerTool(
      'get_latest_filings',
      {
        title: 'Get latest SEC filings',
        description:
          'Return the most recent SEC filings (10-K, 10-Q, 8-K) with AI analysis and 30-day alpha predictions. Optionally filter by ticker and/or form type.',
        inputSchema: z.object({
          ticker: z.string().optional().describe('Stock ticker, e.g. "AAPL"'),
          filing_type: z.enum(['10-K', '10-Q', '8-K', 'all']).optional().describe('SEC form type'),
          limit: z.number().int().min(1).max(50).default(10).describe('Max filings to return'),
        }),
      },
      async ({ ticker, filing_type, limit }) => {
        const result = await getLatestFilings({ ticker, filingType: filing_type, limit });
        return json({
          count: result.filings.length,
          totalAvailable: result.pagination.totalCount,
          filings: result.filings.map((f) => ({
            ticker: f.ticker,
            company: f.companyName,
            formType: f.filingType,
            filedAt: f.filingDate,
            accessionNumber: f.accessionNumber,
            predicted30dAlpha: f.predicted30dAlpha,
            predictionConfidence: f.predictionConfidence,
            concernLevel: f.concernLevel,
            filingUrl: f.filingUrl,
            stockHuntrUrl: `https://www.stockhuntr.net/filing/${f.accessionNumber}`,
          })),
          disclaimer: DISCLAIMER,
        });
      }
    );

    // ---- get_filing_analysis ----------------------------------------------
    server.registerTool(
      'get_filing_analysis',
      {
        title: 'Get filing analysis',
        description:
          'Return the full AI analysis for a single SEC filing by accession number: executive summary, concern level, sentiment, EPS surprise, predicted 30-day alpha, and (if available) the realized outcome.',
        inputSchema: z.object({
          accession_number: z
            .string()
            .describe('SEC accession number, dashed form e.g. "0000320193-24-000123"'),
        }),
      },
      async ({ accession_number }) => {
        const filing = await prisma.filing.findUnique({
          where: { accessionNumber: accession_number.trim() },
          include: { company: { select: { ticker: true, name: true, sector: true, industry: true } } },
        });
        if (!filing) {
          return json({ error: `No filing found for accession ${accession_number}` });
        }
        let analysis: unknown = null;
        if (filing.analysisData) {
          try {
            analysis = JSON.parse(filing.analysisData);
          } catch {
            /* leave null on malformed JSON */
          }
        }
        return json({
          ticker: filing.company.ticker,
          company: filing.company.name,
          sector: filing.company.sector,
          industry: filing.company.industry,
          formType: filing.filingType,
          filedAt: filing.filingDate.toISOString(),
          accessionNumber: filing.accessionNumber,
          filingUrl: filing.filingUrl,
          stockHuntrUrl: `https://www.stockhuntr.net/filing/${filing.accessionNumber}`,
          executiveSummary: filing.aiSummary,
          concernLevel: filing.concernLevel,
          sentimentScore: filing.sentimentScore,
          epsSurprise: filing.epsSurprise,
          revenueSurprise: filing.revenueSurprise,
          prediction: {
            predicted30dAlpha: filing.predicted30dAlpha,
            predicted30dReturn: filing.predicted30dReturn,
            confidence: filing.predictionConfidence,
          },
          realizedOutcome: {
            actual30dAlpha: filing.actual30dAlpha,
            actual30dReturn: filing.actual30dReturn,
          },
          analysis,
          disclaimer: DISCLAIMER,
        });
      }
    );

    // ---- get_company -------------------------------------------------------
    server.registerTool(
      'get_company',
      {
        title: 'Get company snapshot',
        description:
          'Return a company snapshot (financials, valuation, analyst data) and its most recent analyzed SEC filings by ticker.',
        inputSchema: z.object({
          ticker: z.string().describe('Stock ticker, e.g. "MSFT"'),
        }),
      },
      async ({ ticker }) => {
        const company = await prisma.company.findUnique({
          where: { ticker: ticker.trim().toUpperCase() },
          include: {
            filings: {
              orderBy: { filingDate: 'desc' },
              take: 10,
              select: {
                accessionNumber: true,
                filingType: true,
                filingDate: true,
                predicted30dAlpha: true,
                predictionConfidence: true,
                concernLevel: true,
              },
            },
          },
        });
        if (!company) {
          return json({ error: `No company found for ticker ${ticker}` });
        }
        return json({
          ticker: company.ticker,
          name: company.name,
          sector: company.sector,
          industry: company.industry,
          snapshot: {
            currentPrice: company.currentPrice,
            marketCap: company.marketCap,
            peRatio: company.peRatio,
            forwardPE: company.forwardPE,
            dividendYield: company.dividendYield,
            beta: company.beta,
            fiftyTwoWeekHigh: company.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: company.fiftyTwoWeekLow,
            analystTargetPrice: company.analystTargetPrice,
            latestRevenue: company.latestRevenue,
            latestRevenueYoY: company.latestRevenueYoY,
            latestNetIncome: company.latestNetIncome,
            latestQuarter: company.latestQuarter,
          },
          recentFilings: company.filings.map((f) => ({
            accessionNumber: f.accessionNumber,
            formType: f.filingType,
            filedAt: f.filingDate.toISOString(),
            predicted30dAlpha: f.predicted30dAlpha,
            predictionConfidence: f.predictionConfidence,
            concernLevel: f.concernLevel,
            stockHuntrUrl: `https://www.stockhuntr.net/filing/${f.accessionNumber}`,
          })),
          companyUrl: `https://www.stockhuntr.net/company/${company.ticker}`,
          disclaimer: DISCLAIMER,
        });
      }
    );

    // ---- search_companies --------------------------------------------------
    server.registerTool(
      'search_companies',
      {
        title: 'Search companies',
        description:
          'Search tracked companies by ticker or name. Returns matching tickers with company names and sectors.',
        inputSchema: z.object({
          query: z.string().min(1).describe('Ticker prefix or company name fragment'),
          limit: z.number().int().min(1).max(25).default(10),
        }),
      },
      async ({ query, limit }) => {
        const q = query.trim();
        const companies = await prisma.company.findMany({
          where: {
            OR: [
              { ticker: { startsWith: q.toUpperCase() } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { ticker: true, name: true, sector: true },
          take: limit,
          orderBy: { ticker: 'asc' },
        });
        return json({
          count: companies.length,
          results: companies.map((c) => ({
            ticker: c.ticker,
            name: c.name,
            sector: c.sector,
            companyUrl: `https://www.stockhuntr.net/company/${c.ticker}`,
          })),
        });
      }
    );

    // ---- get_top_signals ---------------------------------------------------
    server.registerTool(
      'get_top_signals',
      {
        title: 'Get top prediction signals',
        description:
          'Return the highest-conviction filing predictions from the last 90 days, ranked by |predicted 30-day alpha| weighted by confidence. These are the model\'s strongest current directional calls.',
        inputSchema: z.object({
          limit: z.number().int().min(1).max(50).default(10),
        }),
      },
      async ({ limit }) => {
        const filings = await prisma.filing.findMany({
          where: {
            predicted30dAlpha: { not: null },
            predictionConfidence: { not: null },
            filingDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          },
          include: { company: { select: { ticker: true, name: true } } },
          orderBy: { predictionConfidence: 'desc' },
          take: 200,
        });
        const signals = filings
          .map((f) => ({
            ticker: f.company.ticker,
            company: f.company.name,
            formType: f.filingType,
            filedAt: f.filingDate.toISOString(),
            accessionNumber: f.accessionNumber,
            predicted30dAlpha: f.predicted30dAlpha as number,
            confidence: f.predictionConfidence as number,
            direction: (f.predicted30dAlpha as number) >= 0 ? 'outperform' : 'underperform',
            stockHuntrUrl: `https://www.stockhuntr.net/filing/${f.accessionNumber}`,
          }))
          .sort(
            (a, b) =>
              Math.abs(b.predicted30dAlpha) * b.confidence -
              Math.abs(a.predicted30dAlpha) * a.confidence
          )
          .slice(0, limit);
        return json({ count: signals.length, signals, disclaimer: DISCLAIMER });
      }
    );

    // ---- get_model_track_record -------------------------------------------
    server.registerTool(
      'get_model_track_record',
      {
        title: 'Get model track record',
        description:
          'Return the model\'s validated track record from strict 90-day walk-forward cross-validation, plus a live count of filings in the database that already have a realized 30-day outcome available for evaluation.',
        inputSchema: z.object({}),
      },
      async () => {
        // Filings whose 30-day window has elapsed and whose realized alpha is recorded.
        const realizedOutcomes = await prisma.filing.count({
          where: { actual30dAlpha: { not: null } },
        });
        return json({
          // Published figures from strict 90-day walk-forward CV (see methodology).
          // These are the validated numbers, not a live re-computation over the small
          // set of predictions StockHuntr currently persists.
          backtest: {
            method: 'Strict 90-day walk-forward cross-validation',
            trainingFilings: 4009,
            overallDirectionalAccuracy: 0.562,
            highConfidenceDirectionalAccuracy: 0.775,
            highConfidenceAnnualizedSharpe: 2.22,
            note: 'Target is 30-day market-relative alpha (stock return minus S&P 500). The model\'s strongest edge is identifying relative underperformers.',
          },
          realizedOutcomesInDatabase: realizedOutcomes,
          methodologyUrl: 'https://www.stockhuntr.net/faq',
          trackRecordUrl: 'https://www.stockhuntr.net/model-demo',
          disclaimer: DISCLAIMER,
        });
      }
    );
  },
  {
    serverInfo: { name: 'stockhuntr', version: '1.0.0' },
    verboseLogs: false,
  }
);

export { handler as GET, handler as POST };
