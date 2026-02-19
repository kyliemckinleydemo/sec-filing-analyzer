import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fmpClient, { parseRange } from '@/lib/fmp-client';

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
        const profile = await fmpClient.getProfile(company.ticker);

        if (profile) {
          const range = parseRange(profile.range);

          await prisma.company.update({
            where: { id: company.id },
            data: {
              currentPrice: profile.price ?? null,
              marketCap: profile.mktCap ?? null,
              peRatio: profile.pe ?? null,
              beta: profile.beta ?? null,
              dividendYield: profile.lastDiv ? profile.lastDiv / (profile.price || 1) : null,
              fiftyTwoWeekHigh: range?.high ?? null,
              fiftyTwoWeekLow: range?.low ?? null,
              volume: profile.volume ? BigInt(profile.volume) : null,
              averageVolume: profile.volAvg ? BigInt(profile.volAvg) : null,
              analystTargetPrice: profile.targetMeanPrice ?? null,
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
