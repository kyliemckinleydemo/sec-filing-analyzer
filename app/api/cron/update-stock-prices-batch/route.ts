import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from 'yahoo-finance2';

// Suppress yahoo-finance2 survey notice
yahooFinance.suppressNotices(['yahooSurvey']);

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Batch Stock Price Update Cron Job
 *
 * Updates stock prices for a rotating batch of companies throughout the day.
 * Designed to run every 4 hours, updating ~107 companies per run.
 * All 640+ companies get updated daily through 6 runs.
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

    // Determine which batch to process based on current hour
    // Run every 4 hours: 0-3, 4-7, 8-11, 12-15, 16-19, 20-23
    const currentHour = new Date().getUTCHours();
    const batchNumber = Math.floor(currentHour / 4); // 0-5 (6 batches per day)
    const totalBatches = 6;

    console.log(`[Cron] Processing batch ${batchNumber + 1}/${totalBatches} (hour ${currentHour})`);

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
        // Fetch latest quote data
        const quote = await yahooFinance.quoteSummary(company.ticker, {
          modules: ['price', 'summaryDetail', 'financialData']
        });

        const price = quote.price;
        const summaryDetail = quote.summaryDetail;
        const financialData = quote.financialData;

        if (price || summaryDetail || financialData) {
          await prisma.company.update({
            where: { id: company.id },
            data: {
              currentPrice: price?.regularMarketPrice ?? null,
              marketCap: price?.marketCap ?? null,
              peRatio: summaryDetail?.trailingPE ?? null,
              forwardPE: summaryDetail?.forwardPE ?? null,
              beta: summaryDetail?.beta ?? null,
              dividendYield: summaryDetail?.dividendYield ?? null,
              fiftyTwoWeekHigh: summaryDetail?.fiftyTwoWeekHigh ?? null,
              fiftyTwoWeekLow: summaryDetail?.fiftyTwoWeekLow ?? null,
              volume: price?.regularMarketVolume ? BigInt(price.regularMarketVolume) : null,
              averageVolume: summaryDetail?.averageVolume ? BigInt(summaryDetail.averageVolume) : null,
              analystTargetPrice: financialData?.targetMeanPrice ?? null,
              yahooLastUpdated: new Date()
            }
          });

          updated++;
        }

        // Rate limit: 100ms delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));

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
