import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { secClient } from '@/lib/sec-client';
import { TOP_1000_TICKERS } from '@/lib/top1000-tickers';

// Mark route as dynamic to prevent static generation at build time
export const dynamic = 'force-dynamic';

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
 * Chunked processing: Processes companies in batches to avoid timeouts
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

  // Clean up stuck jobs (older than 10 minutes and still marked as running)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.cronJobRun.updateMany({
    where: {
      jobName: 'daily-filings',
      status: 'running',
      startedAt: {
        lt: tenMinutesAgo,
      },
    },
    data: {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: 'Job timed out - exceeded maximum execution time',
    },
  });

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

    // Chunked processing: limit companies per run to avoid timeouts
    // With 300 second timeout and ~1-2 seconds per company (including SEC API rate limits),
    // we can safely process ~100 companies per run with buffer for safety
    const COMPANIES_PER_RUN = 100;
    const batchSize = 50; // Process 50 companies at a time within the chunk

    // Determine which chunk to process based on last successful run
    let startIndex = 0;
    if (lastSuccessfulRun?.companiesProcessed) {
      // Continue from where we left off (round robin through the list)
      startIndex = lastSuccessfulRun.companiesProcessed % TOP_1000_TICKERS.length;
    }

    // Get the chunk of companies to process
    let companiesToProcess: string[] = [];
    if (startIndex + COMPANIES_PER_RUN <= TOP_1000_TICKERS.length) {
      // Chunk fits within the array
      companiesToProcess = TOP_1000_TICKERS.slice(startIndex, startIndex + COMPANIES_PER_RUN);
    } else {
      // Wrap around to the beginning
      companiesToProcess = [
        ...TOP_1000_TICKERS.slice(startIndex),
        ...TOP_1000_TICKERS.slice(0, COMPANIES_PER_RUN - (TOP_1000_TICKERS.length - startIndex))
      ];
    }

    console.log(`[Cron] Processing ${companiesToProcess.length} companies (index ${startIndex} to ${startIndex + companiesToProcess.length}) in batches of ${batchSize}...`);

    for (let i = 0; i < companiesToProcess.length; i += batchSize) {
      const batch = companiesToProcess.slice(i, i + batchSize);

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

    // Calculate cumulative total of companies processed
    const cumulativeCompaniesProcessed = startIndex + results.companiesProcessed;
    const totalCompaniesInList = TOP_1000_TICKERS.length;
    const progressPercentage = Math.round((cumulativeCompaniesProcessed / totalCompaniesInList) * 100);

    // Mark job run as successful
    await prisma.cronJobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'success',
        completedAt: new Date(),
        filingsFetched: results.fetched,
        filingsStored: results.stored,
        companiesProcessed: cumulativeCompaniesProcessed,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Fetched ${results.fetched} filings, stored ${results.stored} (${daysBack} days lookback)`,
      results: {
        ...results,
        daysLookedBack: daysBack,
        incrementalMode: !!lastSuccessfulRun,
        chunkStartIndex: startIndex,
        chunkSize: companiesToProcess.length,
        cumulativeCompaniesProcessed,
        totalCompanies: totalCompaniesInList,
        progress: `${progressPercentage}%`,
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
