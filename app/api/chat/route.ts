import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { claudeClient } from '@/lib/claude-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Intelligent Chat API for SEC Filing Analysis
 *
 * Uses Claude AI to understand natural language queries and retrieve relevant
 * filing data to answer questions about risk trends, concern levels, and more.
 */

async function fetchRelevantFilings(ticker?: string, limit: number = 10) {
  const where: any = {};

  if (ticker) {
    where.company = { ticker: ticker.toUpperCase() };
  }

  return await prisma.filing.findMany({
    where,
    include: {
      company: {
        select: {
          ticker: true,
          name: true,
          currentPrice: true,
          marketCap: true,
          peRatio: true,
        },
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

    return {
      ticker: f.company.ticker,
      companyName: f.company.name,
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

      // Predictions & Returns
      predicted7dReturn: prediction?.predicted7dReturn || null,
      actual7dReturn: f.actual7dReturn || null,

      // Key Highlights (truncated for token efficiency)
      concernFactors: analysisData?.concernAssessment?.concernFactors?.slice(0, 2) || [],
      positiveFactors: analysisData?.concernAssessment?.positiveFactors?.slice(0, 2) || [],
      topRiskChanges: analysisData?.risks?.topChanges?.slice(0, 2) || [],
    };
  }).slice(0, 20); // Limit context to avoid token overflow
}

export async function POST(request: NextRequest) {
  try {
    const { message, ticker } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Chat API] Query: "${message}"${ticker ? ` (ticker: ${ticker})` : ''}`);

    // Fetch relevant filings based on context
    const filings = await fetchRelevantFilings(ticker, ticker ? 20 : 10);

    if (filings.length === 0) {
      return new Response(
        JSON.stringify({
          error: ticker
            ? `No filings found for ${ticker}. Try analyzing a filing first.`
            : 'No filings found in database. Try analyzing some filings first.'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const filingContext = buildFilingContext(filings);

    // Build prompt for Claude
    const prompt = `You are a financial analyst assistant specialized in SEC filing analysis. Answer the user's question based on the filing data provided.

FILING DATA:
${JSON.stringify(filingContext, null, 2)}

DATA FIELDS EXPLAINED:
- quarter/year: Filing period (e.g., "Q2" 2025)
- revenue/revenueYoY: Revenue and year-over-year growth rate (e.g., "+15.3%")
- netIncome/netIncomeYoY: Net income and YoY growth
- eps/epsYoY: Earnings per share and YoY growth
- grossMargin/operatingMargin: Profit margins
- marketCapB: Market capitalization in billions (e.g., "$250.5B")
- epsSurprise/revenueSurprise: Beat/miss vs analyst estimates
- concernLevel: 0-10 scale (0=excellent, 10=critical concerns)
- concernLabel: LOW/MODERATE/ELEVATED/HIGH/CRITICAL

USER QUESTION:
${message}

INSTRUCTIONS:
- Answer based on the filing data provided
- For growth rate comparisons, use revenueYoY, netIncomeYoY, epsYoY fields
- Filter by market cap ranges using marketCapB field (e.g., $100B-$500B)
- Filter by quarter/year when asked about specific periods
- Show actual numbers and percentages in your answer
- Rank companies when asked for "best" or "highest"
- Reference specific tickers and filing dates
- Use markdown tables for multi-company comparisons
- Keep responses professional but conversational
- NEVER mention data limitations, API issues, or technical problems
- If a company doesn't have data for the requested metric, note it briefly

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
