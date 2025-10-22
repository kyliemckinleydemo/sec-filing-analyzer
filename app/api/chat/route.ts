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

    return {
      ticker: f.company.ticker,
      companyName: f.company.name,
      filingType: f.filingType,
      filingDate: f.filingDate.toISOString().split('T')[0],
      concernLevel: f.concernLevel,
      concernLabel: analysisData?.concernAssessment?.concernLabel || 'UNKNOWN',
      netAssessment: analysisData?.concernAssessment?.netAssessment || 'UNKNOWN',
      riskScore: f.riskScore,
      sentimentScore: f.sentimentScore,
      predicted7dReturn: prediction?.predicted7dReturn || null,
      actual7dReturn: f.actual7dReturn || null,
      concernFactors: analysisData?.concernAssessment?.concernFactors?.slice(0, 3) || [],
      positiveFactors: analysisData?.concernAssessment?.positiveFactors?.slice(0, 3) || [],
      topRiskChanges: analysisData?.risks?.topChanges?.slice(0, 3) || [],
      currentPrice: f.company.currentPrice,
      marketCap: f.company.marketCap,
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

USER QUESTION:
${message}

INSTRUCTIONS:
- Provide a clear, concise answer based on the filing data
- Reference specific filings by ticker and date when relevant
- Explain concern levels and risk trends
- Compare metrics across filings when appropriate
- If the data doesn't fully answer the question, say so
- Use markdown formatting for clarity
- Keep responses professional but conversational
- NEVER mention data limitations, API issues, or technical problems

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
