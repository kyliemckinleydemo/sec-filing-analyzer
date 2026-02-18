/**
 * Daily Macro Indicators Update Cron Job
 *
 * Fetches and stores comprehensive macro data using yahoo-finance2:
 * - Market momentum (SPY: 7d, 14d, 21d, 30d returns)
 * - Volatility (VIX close + 30-day MA)
 * - Sector performance (XLK, XLF, XLE, XLV 30d returns)
 *
 * Treasury rates are not available via Yahoo Finance.
 * TODO: Add FRED API or Treasury.gov XML feed for interest rate data.
 *
 * Runs daily at 9 AM UTC (after market close)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from 'yahoo-finance2';

// Suppress yahoo-finance2 survey notice
yahooFinance.suppressNotices(['yahooSurvey']);

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
 * Fetch historical prices and calculate returns for a given ticker
 */
async function fetchHistoricalReturns(
  ticker: string,
  endDate: Date,
  daysBack: number = 45
): Promise<{ close: number | null; returns: Record<string, number | null> }> {
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack);

  try {
    const historical = await yahooFinance.historical(ticker, {
      period1: startDate.toISOString().split('T')[0],
      period2: endDate.toISOString().split('T')[0],
      interval: '1d',
    });

    if (!historical || historical.length === 0) {
      return { close: null, returns: {} };
    }

    // Sort by date descending to get most recent first
    const sorted = [...historical].sort((a, b) => b.date.getTime() - a.date.getTime());
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
      let closest = null;
      let smallestDiff = Infinity;
      for (const point of sorted) {
        const diff = Math.abs(point.date.getTime() - targetDate.getTime());
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
 * Calculate 30-day moving average of VIX from historical data
 */
async function fetchVixMA30(endDate: Date): Promise<number | null> {
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 45); // Extra days to ensure 30 trading days

  try {
    const historical = await yahooFinance.historical('^VIX', {
      period1: startDate.toISOString().split('T')[0],
      period2: endDate.toISOString().split('T')[0],
      interval: '1d',
    });

    if (!historical || historical.length < 20) return null;

    // Take last 30 trading days
    const sorted = [...historical].sort((a, b) => b.date.getTime() - a.date.getTime());
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

    // Fetch SPY and VIX historical data once (covers both dates)
    const [spyData, vixQuote, vixMA30, ...sectorResults] = await Promise.all([
      fetchHistoricalReturns('SPY', today, 45),
      yahooFinance.quote('^VIX').catch((e: any) => {
        console.error('[MacroCron] VIX quote error:', e.message);
        return null;
      }),
      fetchVixMA30(today),
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

    for (const date of dates) {
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
          // Treasury rates not available via Yahoo Finance
          // TODO: Implement FRED API or Treasury.gov XML feed
          fedFundsRate: null,
          treasury3m: null,
          treasury2y: null,
          treasury10y: null,
          yieldCurve2y10y: null,
          treasury10yChange30d: null,
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
          `VIX: ${macroData.vixClose?.toFixed(1)}`
        );

        results.push({
          date: dateStr,
          success: true,
          spxClose: macroData.spxClose,
          spxReturn7d: macroData.spxReturn7d,
          vixClose: macroData.vixClose,
        });
      } catch (error: any) {
        console.error(`[MacroCron] ${dateStr}: Failed:`, error.message);
        results.push({ date: dateStr, success: false, error: error.message });
      }
    }

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
