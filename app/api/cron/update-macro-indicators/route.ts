/**
 * @module app/api/cron/update-macro-indicators/route
 * @description Next.js API route handler executing daily cron job to fetch and store comprehensive macro market indicators from Yahoo Finance and FRED APIs
 *
 * PURPOSE:
 * - Fetch SPY momentum metrics (7d, 14d, 21d, 30d returns) using 45-day historical price data from Yahoo Finance
 * - Calculate VIX volatility close price and 30-day moving average from VIXY historical data
 * - Retrieve sector performance for XLK, XLF, XLE, XLV ETFs computing 30-day returns
 * - Query FRED API for treasury rates (fed funds, 3m, 2y, 10y) and yield curve spread with 30-day change calculation
 * - Upsert macro indicators for today and yesterday into MacroIndicators table with normalized UTC midnight timestamps
 * - Track job execution status in CronJobRun table with auto-cleanup of stuck jobs older than 10 minutes
 *
 * DEPENDENCIES:
 * - @/lib/prisma - Provides Prisma client for MacroIndicators and CronJobRun table operations
 * - @/lib/yahoo-finance-singleton - Fetches historical prices via chart() and current quotes via quote() from Yahoo Finance v3 API
 * - @/lib/fred-client - Retrieves treasury rates and economic indicators from Federal Reserve Economic Data API
 *
 * EXPORTS:
 * - dynamic (const) - Next.js config forcing dynamic rendering for API route
 * - maxDuration (const) - Vercel function timeout limit set to 60 seconds
 * - GET (function) - Async handler processing cron trigger, fetching multi-source market data, and persisting to database
 *
 * PATTERNS:
 * - Trigger via Vercel cron schedule or manual call with 'Authorization: Bearer ${CRON_SECRET}' header
 * - Route runs at 9 AM UTC daily (configured in vercel.json cron schedule)
 * - Returns JSON with { success, message, duration, results } array containing per-date status and metrics
 * - Uses Promise.all to parallelize Yahoo Finance historical fetches and FRED rate queries for performance
 * - Automatically cleans up CronJobRun records stuck in 'running' status for over 10 minutes before starting new job
 *
 * CLAUDE NOTES:
 * - Uses VIXY (VIX ETF) instead of ^VIX ticker for consistent tradable security data
 * - Fetches 45 days of historical data but only calculates returns for 7/14/21/30-day periods to ensure sufficient trading day coverage
 * - Finds closest trading day to target date when calculating returns since markets are closed weekends/holidays - uses smallest time delta
 * - Processes both today and yesterday dates to handle market close timing edge cases and data availability delays
 * - Treasury 10y change is calculated as current minus 30-days-ago with 3 decimal precision rounding
 * - Normalizes all dates to midnight UTC ('T00:00:00.000Z') before database operations to prevent duplicate records from timezone shifts
 */
/**
 * Daily Macro Indicators Update Cron Job
 *
 * Fetches and stores comprehensive macro data:
 * - Market momentum (SPY: 7d, 14d, 21d, 30d returns) via Yahoo Finance
 * - Volatility (VIX close + 30-day MA) via Yahoo Finance
 * - Sector performance (XLK, XLF, XLE, XLV 30d returns) via Yahoo Finance
 * - Treasury rates (fed funds, 3m, 2y, 10y, yield curve) via FRED
 *
 * Runs daily at 9 AM UTC (after market close)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from '@/lib/yahoo-finance-singleton';
import fredClient from '@/lib/fred-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Sector ETF tickers
const SECTOR_ETFS = {
  tech: 'XLK',
  financial: 'XLF',
  energy: 'XLE',
  healthcare: 'XLV',
} as const;

/**
 * Calculate percentage return between two prices
 */
function calcReturn(current: number, previous: number): number {
  return ((current - previous) / previous) * 100;
}

/**
 * Fetch historical prices and calculate returns for a given ticker using Yahoo Finance chart()
 */
async function fetchHistoricalReturns(
  ticker: string,
  endDate: Date,
  daysBack: number = 45
): Promise<{ close: number | null; returns: Record<string, number | null> }> {
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack);

  try {
    const result = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    const quotes = result.quotes;
    if (!quotes || quotes.length === 0) {
      return { close: null, returns: {} };
    }

    // Sort by date descending (most recent first)
    const sorted = [...quotes].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const latestClose = sorted[0]?.close ?? null;

    if (!latestClose) {
      return { close: null, returns: {} };
    }

    // Calculate returns for different periods
    const returns: Record<string, number | null> = {};
    for (const days of [7, 14, 21, 30]) {
      const targetDate = new Date(sorted[0].date);
      targetDate.setDate(targetDate.getDate() - days);

      // Find the closest trading day to the target date
      let closest: (typeof sorted)[0] | null = null;
      let smallestDiff = Infinity;
      for (const point of sorted) {
        const diff = Math.abs(new Date(point.date).getTime() - targetDate.getTime());
        if (diff < smallestDiff) {
          smallestDiff = diff;
          closest = point;
        }
      }

      if (closest?.close) {
        returns[`${days}d`] = calcReturn(latestClose, closest.close);
      } else {
        returns[`${days}d`] = null;
      }
    }

    return { close: latestClose, returns };
  } catch (error: any) {
    console.error(`[MacroCron] Error fetching ${ticker} historical:`, error.message);
    return { close: null, returns: {} };
  }
}

/**
 * Calculate 30-day moving average of VIX from historical data using Yahoo Finance chart()
 */
async function fetchVixMA30(endDate: Date): Promise<number | null> {
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 45); // Extra days to ensure 30 trading days

  try {
    const result = await yahooFinance.chart('VIXY', {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    const quotes = result.quotes;
    if (!quotes || quotes.length < 20) return null;

    // Sort by date descending
    const sorted = [...quotes].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const last30 = sorted.slice(0, 30);
    const sum = last30.reduce((acc, p) => acc + (p.close ?? 0), 0);
    return sum / last30.length;
  } catch (error: any) {
    console.error('[MacroCron] Error calculating VIX MA30:', error.message);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  // Verify request is from Vercel cron or has valid auth header
  const authHeader = req.headers.get('authorization');
  const userAgent = req.headers.get('user-agent');
  const cronSecret = process.env.CRON_SECRET;

  const isVercelCron = userAgent?.includes('vercel-cron/');
  const hasValidAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasValidAuth) {
    console.error('[MacroCron] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Clean up stuck jobs
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.cronJobRun.updateMany({
    where: {
      jobName: 'update-macro-indicators',
      status: 'running',
      startedAt: { lt: tenMinutesAgo },
    },
    data: {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: 'Job timed out - auto-cleaned by next run',
    },
  });

  // Create job run record
  const jobRun = await prisma.cronJobRun.create({
    data: {
      jobName: 'update-macro-indicators',
      status: 'running',
    },
  });

  try {
    console.log('[MacroCron] Starting daily macro indicators update...');

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dates = [today, yesterday];
    const results = [];

    // Fetch SPY historical, VIX current price, VIX MA30, sector ETFs, and FRED treasury rates
    const todayStr = today.toISOString().split('T')[0];
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const [spyData, vixQuote, vixMA30, treasuryRatesToday, treasuryRates30dAgo, ...sectorResults] = await Promise.all([
      fetchHistoricalReturns('SPY', today, 45),
      yahooFinance.quote('VIXY').catch((e: any) => {
        console.error('[MacroCron] VIX quote error:', e.message);
        return null;
      }),
      fetchVixMA30(today),
      fredClient.getTreasuryRates(todayStr).catch((e: any) => {
        console.error('[MacroCron] FRED treasury rates error:', e.message);
        return null;
      }),
      fredClient.getTreasuryRates(thirtyDaysAgoStr).catch((e: any) => {
        console.error('[MacroCron] FRED 30d-ago treasury error:', e.message);
        return null;
      }),
      ...Object.entries(SECTOR_ETFS).map(([, ticker]) =>
        fetchHistoricalReturns(ticker, today, 45)
      ),
    ]);

    // Map sector results
    const sectorKeys = Object.keys(SECTOR_ETFS);
    const sectorReturns: Record<string, number | null> = {};
    for (let i = 0; i < sectorKeys.length; i++) {
      sectorReturns[sectorKeys[i]] = sectorResults[i]?.returns?.['30d'] ?? null;
    }

    const vixClose = vixQuote?.regularMarketPrice ?? null;

    // Calculate treasury 10y 30-day change
    const treasury10yChange30d =
      treasuryRatesToday?.treasury10y != null && treasuryRates30dAgo?.treasury10y != null
        ? Math.round((treasuryRatesToday.treasury10y - treasuryRates30dAgo.treasury10y) * 1000) / 1000
        : null;

    // Prepare all upsert operations
    const upsertPromises = dates.map(async (date) => {
      const dateStr = date.toISOString().split('T')[0];

      try {
        // Normalize date to midnight UTC for consistent DB keys
        const dbDate = new Date(dateStr + 'T00:00:00.000Z');

        const macroData = {
          spxClose: spyData.close,
          spxReturn7d: spyData.returns['7d'] ?? null,
          spxReturn14d: spyData.returns['14d'] ?? null,
          spxReturn21d: spyData.returns['21d'] ?? null,
          spxReturn30d: spyData.returns['30d'] ?? null,
          vixClose,
          vixMA30,
          fedFundsRate: treasuryRatesToday?.fedFundsRate ?? null,
          treasury3m: treasuryRatesToday?.treasury3m ?? null,
          treasury2y: treasuryRatesToday?.treasury2y ?? null,
          treasury10y: treasuryRatesToday?.treasury10y ?? null,
          yieldCurve2y10y: treasuryRatesToday?.yieldCurve2y10y ?? null,
          treasury10yChange30d,
          techSectorReturn30d: sectorReturns.tech ?? null,
          financialSectorReturn30d: sectorReturns.financial ?? null,
          energySectorReturn30d: sectorReturns.energy ?? null,
          healthcareSectorReturn30d: sectorReturns.healthcare ?? null,
        };

        await prisma.macroIndicators.upsert({
          where: { date: dbDate },
          update: macroData,
          create: { date: dbDate, ...macroData },
        });

        console.log(
          `[MacroCron] ${dateStr}: Stored - ` +
          `SPX: ${macroData.spxClose?.toFixed(2)}, ` +
          `SPY 7d: ${macroData.spxReturn7d?.toFixed(2)}%, ` +
          `VIX: ${macroData.vixClose?.toFixed(1)}, ` +
          `10Y: ${macroData.treasury10y ?? 'n/a'}, ` +
          `2Y: ${macroData.treasury2y ?? 'n/a'}`
        );

        return {
          date: dateStr,
          success: true,
          spxClose: macroData.spxClose,
          spxReturn7d: macroData.spxReturn7d,
          vixClose: macroData.vixClose,
        };
      } catch (error: any) {
        console.error(`[MacroCron] ${dateStr}: Failed:`, error.message);
        return { date: dateStr, success: false, error: error.message };
      }
    });

    // Execute all upserts in parallel
    const batchResults = await Promise.all(upsertPromises);
    results.push(...batchResults);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const successCount = results.filter(r => r.success).length;

    console.log(`[MacroCron] Complete! ${successCount}/${results.length} successful in ${duration}s`);

    // Mark job run as successful
    await prisma.cronJobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'success',
        completedAt: new Date(),
        companiesProcessed: successCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Macro indicators updated: ${successCount}/${results.length} successful`,
      duration: `${duration}s`,
      results,
    });
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[MacroCron] Failed after ${duration}s:`, error);

    // Mark job run as failed
    await prisma.cronJobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error.message,
      },
    });

    return NextResponse.json({
      success: false,
      error: error.message,
      duration: `${duration}s`,
    }, { status: 500 });
  }
}