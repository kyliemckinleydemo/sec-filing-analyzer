/**
 * @module app/api/cron/update-stock-prices-batch/route
 * @description Cron endpoint that rotates through batches of companies to update their stock prices from FMP API once every 4 hours, completing all 640+ companies over 6 batches daily
 *
 * PURPOSE:
 * - Authenticate incoming requests via Vercel cron user-agent or CRON_SECRET bearer token
 * - Calculate which batch (0-5) to process based on day of year modulo 6 for daily rotation
 * - Fetch company profiles from FMP API and update price, market cap, P/E ratio, beta, dividend yield, 52-week range, volume metrics, and analyst target price
 * - Return summary JSON with batch number, companies updated count, error count, and total companies in batch
 *
 * DEPENDENCIES:
 * - next/server - Provides NextResponse for API route responses
 * - @/lib/prisma - Database client for querying Company records and updating stock metrics
 * - @/lib/fmp-client - FMP API client with getProfile() for fetching stock data and parseRange() for extracting 52-week high/low
 *
 * EXPORTS:
 * - dynamic (const) - Forces route to always run dynamically, never cached
 * - maxDuration (const) - Sets 300 second (5 minute) timeout for cron execution
 * - GET (function) - Cron handler that validates auth, determines batch via dayOfYear % 6, fetches ~107 company profiles, updates database, and returns batch statistics
 *
 * PATTERNS:
 * - Configure vercel.json with cron schedule running every 4 hours and set CRON_SECRET environment variable
 * - Route auto-fails unauthorized requests that lack 'vercel-cron/' user-agent and valid Bearer token
 * - Batch selection uses dayOfYear % 6 so batch 0 runs day 0, 6, 12... ensuring all companies update within 6 days
 * - Non-fatal errors (404 Not Found for delisted tickers) skip silently while other errors log to console
 *
 * CLAUDE NOTES:
 * - Designed for FMP API after yahoo-finance2 library blocked on Vercel hosting platform
 * - Uses Math.ceil(totalCompanies / 6) for batch size to handle uneven division - last batch may be smaller
 * - Volume fields cast to BigInt to handle large integer values exceeding JavaScript's safe integer limit
 * - Updates yahooLastUpdated timestamp despite using FMP API (legacy field name from previous implementation)
 * - Batch rotation via modulo ensures consistent company assignment - ticker X always in same batch number across days
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from '@/lib/yahoo-finance-singleton';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Batch Stock Price Update Cron Job
 *
 * Updates stock prices for a rotating batch of companies throughout the day.
 * Designed to run every 4 hours, updating ~107 companies per run.
 * All 640+ companies get updated daily through 6 runs.
 *
 * Uses FMP API instead of yahoo-finance2 (which is blocked on Vercel).
 */

export async function GET(request: Request) {
  // Verify request is from Vercel cron or has valid auth header
  const authHeader = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent');
  const cronSecret = process.env.CRON_SECRET;

  const isVercelCron = userAgent?.includes('vercel-cron/');
  const hasValidAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasValidAuth) {
    console.error('[Cron] Unauthorized request - not from Vercel cron and no valid auth header');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[Cron] Starting batch stock price update...');

    // Determine which batch to process based on day of year
    // Runs once/day, cycling through 6 batches over 6 days
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
    const totalBatches = 6;
    const batchNumber = dayOfYear % totalBatches; // 0-5, rotates daily

    console.log(`[Cron] Processing batch ${batchNumber + 1}/${totalBatches} (day ${dayOfYear})`);

    // Get all companies, ordered by ID for consistent batching
    const allCompanies = await prisma.company.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, ticker: true }
    });

    const totalCompanies = allCompanies.length;
    const batchSize = Math.ceil(totalCompanies / totalBatches);
    const startIdx = batchNumber * batchSize;
    const endIdx = Math.min(startIdx + batchSize, totalCompanies);

    const batchCompanies = allCompanies.slice(startIdx, endIdx);

    console.log(`[Cron] Updating companies ${startIdx + 1}-${endIdx} of ${totalCompanies} (${batchCompanies.length} companies)`);

    let updated = 0;
    let errors = 0;

    for (const company of batchCompanies) {
      try {
        const quote = await yahooFinance.quote(company.ticker);

        if (quote?.regularMarketPrice) {
          // Fetch analyst target price separately (not in basic quote)
          let analystTargetPrice = null;
          try {
            const summary = await yahooFinance.quoteSummary(company.ticker, { modules: ['financialData'] });
            analystTargetPrice = summary.financialData?.targetMeanPrice ?? null;
          } catch { /* non-critical */ }

          await prisma.company.update({
            where: { id: company.id },
            data: {
              currentPrice: quote.regularMarketPrice ?? null,
              marketCap: quote.marketCap ?? null,
              peRatio: quote.trailingPE ?? null,
              beta: (quote as any).beta ?? null,
              dividendYield: (quote as any).dividendYield ? (quote as any).dividendYield / 100 : null,
              fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
              fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
              volume: quote.regularMarketVolume ? BigInt(quote.regularMarketVolume) : null,
              averageVolume: quote.averageDailyVolume10Day ? BigInt(quote.averageDailyVolume10Day) : null,
              analystTargetPrice,
              yahooLastUpdated: new Date()
            }
          });

          updated++;
        }
      } catch (error: any) {
        // Skip companies with errors (delisted, invalid ticker, etc.)
        if (!error.message?.includes('Not Found')) {
          console.error(`[Cron] Error updating ${company.ticker}:`, error.message);
        }
        errors++;
      }
    }

    console.log(`[Cron] Batch ${batchNumber + 1} complete: ${updated} updated, ${errors} errors`);

    return NextResponse.json({
      success: true,
      batch: batchNumber + 1,
      totalBatches,
      updated,
      errors,
      companiesInBatch: batchCompanies.length
    });

  } catch (error: any) {
    console.error('[Cron] Error in batch stock price update:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
