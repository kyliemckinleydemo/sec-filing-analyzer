/**
 * Daily Macro Indicators Update Cron Job
 *
 * Fetches and stores comprehensive macro data including:
 * - Interest rates (Fed funds, Treasury yields)
 * - Market momentum (SPY short-term: 7d, 14d, 21d, 30d)
 * - Volatility (VIX)
 * - Dollar strength (DXY)
 * - Sector performance (XLK, XLF, XLE, XLV)
 *
 * Runs daily at 9 AM UTC (after market close)
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error('[MacroCron] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[MacroCron] Starting daily macro indicators update...');

    // Fetch macro data for today and yesterday
    // (yesterday ensures we have complete data even if markets were closed)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dates = [today, yesterday];
    const results = [];

    for (const date of dates) {
      const dateStr = date.toISOString().split('T')[0];

      try {
        // Check if data already exists
        const existing = await prisma.macroIndicators.findUnique({
          where: { date },
        });

        if (existing) {
          console.log(`[MacroCron] ${dateStr}: Data already exists, updating...`);
        }

        // Run Python script to fetch macro data
        const scriptPath = path.join(process.cwd(), 'scripts', 'fetch-macro-indicators-enhanced.py');
        const command = `python3 "${scriptPath}" ${dateStr}`;

        console.log(`[MacroCron] ${dateStr}: Fetching macro data...`);
        const { stdout } = await execAsync(command, {
          timeout: 60000, // 60 second timeout
        });

        const macroData = JSON.parse(stdout);

        if (!macroData.success) {
          console.error(`[MacroCron] ${dateStr}: Error:`, macroData.error);
          results.push({ date: dateStr, success: false, error: macroData.error });
          continue;
        }

        // Store in database
        await prisma.macroIndicators.upsert({
          where: { date },
          update: {
            spxClose: macroData.spxClose,
            spxReturn7d: macroData.spxReturn7d,
            spxReturn14d: macroData.spxReturn14d,
            spxReturn21d: macroData.spxReturn21d,
            spxReturn30d: macroData.spxReturn30d,
            vixClose: macroData.vixClose,
            vixMA30: macroData.vixMA30,
            fedFundsRate: macroData.fedFundsRate,
            treasury3m: macroData.treasury3m,
            treasury2y: macroData.treasury2y,
            treasury10y: macroData.treasury10y,
            yieldCurve2y10y: macroData.yieldCurve2y10y,
            treasury10yChange30d: macroData.treasury10yChange30d,
            techSectorReturn30d: macroData.techSectorReturn30d,
            financialSectorReturn30d: macroData.financialSectorReturn30d,
            energySectorReturn30d: macroData.energySectorReturn30d,
            healthcareSectorReturn30d: macroData.healthcareSectorReturn30d,
          },
          create: {
            date,
            spxClose: macroData.spxClose,
            spxReturn7d: macroData.spxReturn7d,
            spxReturn14d: macroData.spxReturn14d,
            spxReturn21d: macroData.spxReturn21d,
            spxReturn30d: macroData.spxReturn30d,
            vixClose: macroData.vixClose,
            vixMA30: macroData.vixMA30,
            fedFundsRate: macroData.fedFundsRate,
            treasury3m: macroData.treasury3m,
            treasury2y: macroData.treasury2y,
            treasury10y: macroData.treasury10y,
            yieldCurve2y10y: macroData.yieldCurve2y10y,
            treasury10yChange30d: macroData.treasury10yChange30d,
            techSectorReturn30d: macroData.techSectorReturn30d,
            financialSectorReturn30d: macroData.financialSectorReturn30d,
            energySectorReturn30d: macroData.energySectorReturn30d,
            healthcareSectorReturn30d: macroData.healthcareSectorReturn30d,
          },
        });

        console.log(
          `[MacroCron] ${dateStr}: ✅ Stored - ` +
          `Regime: ${macroData.marketRegime}, ` +
          `SPY 7d: ${macroData.spxReturn7d?.toFixed(2)}%, ` +
          `10Y: ${macroData.treasury10y?.toFixed(2)}%, ` +
          `VIX: ${macroData.vixClose?.toFixed(1)}`
        );

        results.push({
          date: dateStr,
          success: true,
          marketRegime: macroData.marketRegime,
          spxReturn7d: macroData.spxReturn7d,
          treasury10y: macroData.treasury10y,
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

    return NextResponse.json({
      success: true,
      message: `Macro indicators updated: ${successCount}/${results.length} successful`,
      duration: `${duration}s`,
      results,
    });

  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[MacroCron] Failed after ${duration}s:`, error);

    return NextResponse.json({
      success: false,
      error: error.message,
      duration: `${duration}s`,
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export const maxDuration = 60; // Allow 60 seconds for this job
