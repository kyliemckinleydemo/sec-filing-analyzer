import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { secClient } from '@/lib/sec-client';
import { TOP_1000_TICKERS } from '@/lib/top1000-tickers';

/**
 * Daily Cron Job: Fetch and process latest SEC filings
 *
 * This endpoint is triggered by Vercel Cron to:
 * 1. Check when job last ran successfully
 * 2. Fetch 10-K, 10-Q, and 8-K filings for top 1,000 companies since last run
 * 3. Store them in the database for processing
 * 4. Make filings available for on-demand AI analysis
 *
 * Flexible schedule: Can run daily, every 2 days, or weekly
 * Incremental fetching: Only grabs new filings since last successful run
 * Catch-up logic: On first run or after failures, fetches last 90 days
 */
export async function GET(request: Request) {
  // Create job run record
  const jobRun = await prisma.cronJobRun.create({
    data: {
      jobName: 'daily-filings',
      status: 'running',
    },
  });

  try {
    console.log('[Cron] Starting SEC filings fetch for top 1,000 companies...');

    const results = {
      fetched: 0,
      stored: 0,
      errors: [] as string[],
      companiesProcessed: 0,
    };

    // Find last successful run to determine lookback period
    const lastSuccessfulRun = await prisma.cronJobRun.findFirst({
      where: {
        jobName: 'daily-filings',
        status: 'success',
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    // Calculate days to look back
    let daysBack = 90; // Default for first run or after long gap
    if (lastSuccessfulRun?.completedAt) {
      const daysSinceLastRun = Math.ceil(
        (Date.now() - lastSuccessfulRun.completedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      // Add 1 day buffer to ensure we don't miss anything
      daysBack = Math.min(daysSinceLastRun + 1, 90);
      console.log(`[Cron] Last successful run: ${lastSuccessfulRun.completedAt.toISOString()}`);
      console.log(`[Cron] Fetching filings from last ${daysBack} days (incremental)`);
    } else {
      console.log(`[Cron] First run detected - fetching last ${daysBack} days (baseline)`);
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Fetch filings for each ticker
    const batchSize = 50; // Process 50 companies at a time
    const maxCompanies = TOP_1000_TICKERS.length; // Process all 1,000 companies

    console.log(`[Cron] Processing ${maxCompanies} companies in batches of ${batchSize}...`);

    for (let i = 0; i < maxCompanies; i += batchSize) {
      const batch = TOP_1000_TICKERS.slice(i, i + batchSize);

      for (const ticker of batch) {
        try {
          const companyData = await secClient.getCompanyByTicker(ticker);

          if (!companyData) {
            continue; // Skip if not found
          }

          const { cik, name } = companyData;

          // Store company
          const company = await prisma.company.upsert({
            where: { ticker },
            create: { ticker, cik: cik.padStart(10, '0'), name },
            update: { cik: cik.padStart(10, '0'), name },
          });

          // Fetch recent filings (incremental based on last run)
          const companyFilings = await secClient.getCompanyFilings(cik, ['10-K', '10-Q', '8-K']);

          if (!companyFilings?.filings) continue;

          const recent = companyFilings.filings
            .filter((f: any) => new Date(f.filingDate) > cutoffDate)
            .slice(0, 10); // Increased from 5 to 10 to handle catch-up scenarios

          results.fetched += recent.length;

          // Store each filing
          for (const filing of recent) {
            await prisma.filing.upsert({
              where: { accessionNumber: filing.accessionNumber },
              create: {
                companyId: company.id,
                cik: cik.padStart(10, '0'),
                accessionNumber: filing.accessionNumber,
                filingType: filing.form,
                filingDate: new Date(filing.filingDate),
                reportDate: filing.reportDate ? new Date(filing.reportDate) : null,
                filingUrl: filing.filingUrl,
              },
              update: {
                filingDate: new Date(filing.filingDate),
                reportDate: filing.reportDate ? new Date(filing.reportDate) : null,
              },
            });
            results.stored++;
          }

          results.companiesProcessed++;
        } catch (error: any) {
          results.errors.push(`${ticker}: ${error.message}`);
        }
      }
    }

    console.log('[Cron] Filings fetch complete:', results);

    // Mark job run as successful
    await prisma.cronJobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'success',
        completedAt: new Date(),
        filingsFetched: results.fetched,
        filingsStored: results.stored,
        companiesProcessed: results.companiesProcessed,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Fetched ${results.fetched} filings, stored ${results.stored} (${daysBack} days lookback)`,
      results: {
        ...results,
        daysLookedBack: daysBack,
        incrementalMode: !!lastSuccessfulRun,
      },
    });
  } catch (error: any) {
    console.error('[Cron] Error:', error);

    // Mark job run as failed
    await prisma.cronJobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error.message,
      },
    });

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
