/**
 * @module bulk-analyze-parallel
 * 
 * @description
 * Parallel bulk filing analysis script that distributes workload across multiple workers
 * for faster processing of SEC filings using Claude AI analysis.
 * 
 * PURPOSE:
 * - Enables parallel processing of large volumes of SEC filings by dividing work among multiple worker processes
 * - Analyzes recent filings (last 4 months) that haven't been processed yet
 * - Extracts financial metrics, risk scores, sentiment analysis, and AI summaries from filing documents
 * - Implements cost tracking with configurable limits to prevent excessive API usage
 * - Provides robust error handling with automatic retries for database connection issues
 * - Distributes filings using modulo-based work assignment (each worker processes every Nth filing)
 * 
 * EXPORTS:
 * - No exports (executable script)
 * 
 * CLAUDE NOTES:
 * - Uses Haiku model for bulk analysis (cost-effective option)
 * - Processes first 50KB of each filing document for analysis
 * - Estimates ~500 input tokens (prompt overhead) + content tokens
 * - Estimates ~500 output tokens per analysis
 * - Implements 1.5 second rate limiting between requests (faster than sequential)
 * - Hard cost limit of $300 (configurable via BACKFILL_COST_LIMIT env var)
 * - Token estimation uses 4 characters ≈ 1 token heuristic
 * - Tracks usage per worker via cost-tracker module
 * - Stores analysis results including riskScore, sentimentScore, concernLevel, and aiSummary
 */

/**
 * Parallel Bulk Filing Analysis Script
 *
 * Divides the workload across multiple workers to analyze filings in parallel.
 * Much faster than sequential processing.
 *
 * Usage: npx tsx scripts/bulk-analyze-parallel.ts [workerId] [totalWorkers]
 * Example: npx tsx scripts/bulk-analyze-parallel.ts 0 5
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { claudeClient } from '../lib/claude-client';
import { isProceduralEightK } from '../lib/pipeline';
import { costTracker } from './cost-tracker';

// Configure Prisma with larger connection pool for parallel processing
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?connection_limit=30&pool_timeout=20'
    }
  }
});

const WORKER_ID = parseInt(process.argv[2] || '0');
const TOTAL_WORKERS = parseInt(process.argv[3] || '1');
const COST_LIMIT = parseFloat(process.env.BACKFILL_COST_LIMIT || '300'); // hard stop (env-overridable)
// How far back to analyze. Default 120d (4mo); capped at 183d (6mo) — full analysis of older
// filings isn't worth the spend (their 30d prediction windows are long realized). Env-overridable.
const LOOKBACK_DAYS = Math.min(183, parseInt(process.env.BACKFILL_LOOKBACK_DAYS || '120'));

// Rough token estimation (1 token ≈ 4 characters)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function fetchFilingContent(filingUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(filingUrl, {
      headers: {
        'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch (error: any) {
    return null;
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 5000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if it's a database connection error
      const isConnectionError =
        error.code === 'P1001' || // Can't reach database
        error.code === 'P2024' || // Connection pool timeout
        error.message?.includes('connection') ||
        error.message?.includes('database server');

      if (!isConnectionError || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: 5s, 10s, 20s, 40s, 80s
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`  ⚠️  DB error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay/1000}s...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

async function parallelAnalyzeFilings() {
  console.log('\n' + '='.repeat(80));
  console.log(`WORKER ${WORKER_ID}/${TOTAL_WORKERS - 1} - Parallel Filing Analysis (Auto-Retry Enabled)`);
  console.log('='.repeat(80) + '\n');

  // Find recent filings without analysis (bounded by LOOKBACK_DAYS, capped at 6 months)
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  console.log(`Lookback: ${LOOKBACK_DAYS} days (since ${since.toISOString().split('T')[0]})`);

  const allFilings = await withRetry(async () => {
    return await prisma.filing.findMany({
      where: {
        analysisData: null,
        filingDate: { gte: since },
      },
      select: {
        id: true,
      },
      orderBy: {
        filingDate: 'desc',
      },
    });
  });

  // Divide work among workers
  const myFilings = allFilings.filter((_, index) => index % TOTAL_WORKERS === WORKER_ID);

  console.log(`Total filings to analyze: ${allFilings.length}`);
  console.log(`My workload: ${myFilings.length} filings (every ${TOTAL_WORKERS}th filing starting at ${WORKER_ID})\n`);

  if (myFilings.length === 0) {
    console.log('No filings assigned to this worker!\n');
    await prisma.$disconnect();
    return;
  }

  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  for (let i = 0; i < myFilings.length; i++) {
    try {
      // Fetch filing with retry
      const filing = await withRetry(async () => {
        return await prisma.filing.findUnique({
          where: { id: myFilings[i].id },
          include: { company: true },
        });
      });

      if (!filing) continue;

      const progress = `[W${WORKER_ID}:${i + 1}/${myFilings.length}]`;
      console.log(`${progress} ${filing.company.ticker} ${filing.filingType} (${filing.filingDate.toISOString().split('T')[0]})`);

      if (!filing.filingUrl) {
        console.log(`  No URL - skipping`);
        skipCount++;
        continue;
      }

      // Fetch filing content
      const filingText = await fetchFilingContent(filing.filingUrl);
      if (!filingText) {
        errorCount++;
        continue;
      }

      // Skip the full 6-call analysis for genuinely procedural 8-Ks (e.g. Item 5.07 vote results) —
      // no financials, no material event. Mark processed cheaply. Same rule as lib/pipeline.ts.
      if (filing.filingType === '8-K' && isProceduralEightK(filingText)) {
        await withRetry(async () => {
          return await prisma.filing.update({
            where: { id: filing.id },
            data: {
              analysisData: JSON.stringify({ procedural: true }),
              riskScore: 1,
              sentimentScore: 0,
              concernLevel: 1,
              aiSummary:
                'Procedural 8-K (routine disclosure such as annual-meeting vote results). No detailed AI analysis was performed.',
            },
          });
        });
        console.log(`  Procedural 8-K - skipped (no cost)`);
        skipCount++;
        continue;
      }

      // Extract first 50KB
      const textSample = filingText.slice(0, 50000);

      // Estimate input tokens (prompt + text)
      const estimatedInputTokens = estimateTokens(textSample) + 500; // +500 for prompts

      // Run Claude analysis with Haiku
      const analysis = await claudeClient.analyzeFullFiling(
        textSample,
        textSample,
        undefined,
        filing.filingType,
        filing.company.name,
        undefined,
        'bulk'
      );

      // Estimate output tokens (response is typically 1-2KB)
      const estimatedOutputTokens = 500;

      // Record usage
      const totalCost = costTracker.recordUsage(
        `worker-${WORKER_ID}`,
        estimatedInputTokens,
        estimatedOutputTokens
      );

      // Check cost limit
      if (totalCost >= COST_LIMIT) {
        console.log('\n' + '='.repeat(80));
        console.log('🛑 COST LIMIT EXCEEDED!');
        console.log('='.repeat(80));
        console.log(`Total cost: $${totalCost.toFixed(2)}`);
        console.log(`Worker ${WORKER_ID} stopping...`);
        console.log('='.repeat(80) + '\n');
        break;
      }

      // Store analysis (with retry)
      await withRetry(async () => {
        return await prisma.filing.update({
          where: { id: filing.id },
          data: {
            analysisData: JSON.stringify(analysis),
            riskScore: analysis.risks.riskScore,
            sentimentScore: analysis.sentiment.sentimentScore,
            concernLevel: analysis.concernAssessment.concernLevel,
            aiSummary: analysis.summary,
          },
        });
      });

      // Log key findings
      const metrics = analysis.financialMetrics;
      console.log(`  Risk: ${analysis.risks.riskScore.toFixed(1)}/10`);
      console.log(`  Concern: ${analysis.concernAssessment.concernLevel.toFixed(1)}/10`);
      if (metrics?.guidanceDirection) {
        console.log(`  Guidance: ${metrics.guidanceDirection}`);
      }
      if (metrics?.surprises && metrics.surprises.length > 0) {
        console.log(`  Surprises: ${metrics.surprises.slice(0, 2).join(', ')}`);
      }

      successCount++;

      // Rate limiting: 1.5 seconds (faster since we're parallel)
      if (i < myFilings.length - 1) {
        await sleep(1500);
      }

      // Progress checkpoint every 25 filings
      if ((i + 1) % 25 === 0) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Worker ${WORKER_ID} Progress: ${successCount}/${myFilings.length} analyzed (${errorCount} errors)`);
        console.log(`${'='.repeat(80)}\n`);
      }

    } catch (error: any) {
      console.log(`  Error: ${error.message}`);
      errorCount++;

      // If we've exhausted all retries, continue to next filing
      continue;
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log(`WORKER ${WORKER_ID} COMPLETE`);
  console.log('='.repeat(80));
  console.log(`Total assigned: ${myFilings.length}`);
  console.log(`Successfully analyzed: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Skipped: ${skipCount}`);
  console.log(`Success rate: ${((successCount / myFilings.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(80) + '\n');

  await prisma.$disconnect();
}

parallelAnalyzeFilings().catch(error => {
  console.error(`Worker ${WORKER_ID} fatal error:`, error);
  process.exit(1);
});
