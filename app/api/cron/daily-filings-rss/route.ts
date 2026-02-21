/**
 * @module app/api/cron/daily-filings-rss/route
 * @description Next.js API route handling scheduled daily fetches of SEC filings via RSS feed with intelligent catch-up for missed days
 *
 * PURPOSE:
 * - Authenticate requests from Vercel Cron or Bearer token against CRON_SECRET environment variable
 * - Fetch recent SEC filings using RSS feed for today and daily index files for missed days exceeding 2-day gap
 * - Upsert company and filing records to database with accessionNumber as unique identifier
 * - Flush cached predictions only for companies receiving new filings to trigger ML model recalculation
 * - Track execution in cronJobRun table with status, counts, and auto-cleanup of stuck jobs older than 10 minutes
 *
 * DEPENDENCIES:
 * - next/server - Provides NextResponse for JSON API responses with status codes
 * - @/lib/prisma - Database client for cronJobRun, company, filing, and prediction table operations
 * - @/lib/sec-rss-client - Exposes fetchRecentFilingsFromRSS() and fetchMissedDays() for SEC data retrieval
 * - @/lib/supervisor - Runs runSupervisorChecks() health monitoring after successful completion
 *
 * EXPORTS:
 * - dynamic (const) - Set to 'force-dynamic' to prevent Next.js static generation at build time
 * - GET (function) - Async handler returning NextResponse with filings fetched/stored counts and supervisor report
 *
 * PATTERNS:
 * - Configure vercel.json cron trigger to call this route on schedule with appropriate headers
 * - Set CRON_SECRET environment variable for Bearer token authentication outside Vercel Cron
 * - Route automatically switches to catch-up mode when mostRecentFiling.filingDate exceeds 2 days old
 * - Handles cold database starts with 30-day lookback when no filings exist in database
 *
 * CLAUDE NOTES:
 * - Intentionally skips Yahoo Finance price updates to avoid rate limiting - delegates to separate update-stock-prices-batch cron job
 * - Catch-up logic uses actual filing date gaps instead of cronJobRun timestamps to handle weekends without false positives
 * - Prediction cache flush targets only affected companies (Set of companyIds from new filings) rather than full table scan
 * - Stuck job cleanup uses 10-minute threshold to prevent phantom 'running' records from blocking subsequent executions
 * - Returns 401 for missing auth but proceeds if user-agent contains 'vercel-cron/' string for platform integration
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { secRSSClient } from '@/lib/sec-rss-client';
import { runSupervisorChecks } from '@/lib/supervisor';

// Mark route as dynamic to prevent static generation at build time
export const dynamic = 'force-dynamic';

/**
 * Daily Cron Job: Fetch latest SEC filings via RSS feed
 *
 * NEW APPROACH:
 * - Uses SEC RSS feed (fetches all recent filings in one request)
 * - Filters for top 1,000 companies locally
 * - Catch-up mode: Uses daily index files for missed days
 * - Completes in seconds, not minutes
 *
 * Benefits:
 * - No more timeout issues
 * - 3-4 requests instead of 1,000+
 * - Handles missed days automatically
 */
export async function GET(request: Request) {
  // Verify request is from Vercel cron or has valid auth header
  const authHeader = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent');
  const cronSecret = process.env.CRON_SECRET;

  const isVercelCron = userAgent?.includes('vercel-cron/');
  const hasValidAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasValidAuth) {
    console.error('[Cron RSS] Unauthorized request - not from Vercel cron and no valid auth header');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Clean up stuck jobs (older than 10 minutes and still marked as running)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.cronJobRun.updateMany({
    where: {
      jobName: 'daily-filings-rss',
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
      jobName: 'daily-filings-rss',
      status: 'running',
    },
  });

  try {
    console.log('[Cron RSS] Starting SEC filings fetch via RSS feed...');

    const results = {
      fetched: 0,
      stored: 0,
      errors: [] as string[],
      companiesProcessed: 0,
      mode: 'daily' as 'daily' | 'catchup',
      daysProcessed: 0,
    };

    // Find last successful run to determine if we need catch-up
    const lastSuccessfulRun = await prisma.cronJobRun.findFirst({
      where: {
        jobName: 'daily-filings-rss',
        status: 'success',
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    let allFilings: Awaited<ReturnType<typeof secRSSClient.fetchRecentFilingsFromRSS>> = [];

    // SMARTER CATCH-UP LOGIC: Check for actual gaps in filing dates, not just time since last run
    let needsCatchup = false;
    let catchupStartDate: Date | null = null;

    // Find the most recent filing date in database
    const mostRecentFiling = await prisma.filing.findFirst({
      orderBy: { filingDate: 'desc' },
      select: { filingDate: true }
    });

    if (mostRecentFiling) {
      const daysSinceMostRecentFiling = Math.floor(
        (Date.now() - mostRecentFiling.filingDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // If our most recent filing is more than 2 days old, we need catch-up
      // (accounting for weekends where there are no filings)
      if (daysSinceMostRecentFiling > 2) {
        needsCatchup = true;
        catchupStartDate = new Date(mostRecentFiling.filingDate);
        catchupStartDate.setDate(catchupStartDate.getDate() + 1);
        console.log(`[Cron RSS] Most recent filing is ${daysSinceMostRecentFiling} days old - triggering catch-up`);
      }
    } else {
      // No filings in database at all
      needsCatchup = true;
      catchupStartDate = new Date();
      catchupStartDate.setDate(catchupStartDate.getDate() - 30); // Go back 30 days
      console.log('[Cron RSS] No filings in database - triggering 30-day catch-up');
    }

    if (needsCatchup && catchupStartDate) {
      // CATCH-UP MODE: Fetch missed days using daily index files
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 1); // Index files available through yesterday

      const daysMissed = Math.floor(
        (endDate.getTime() - catchupStartDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysMissed > 0) {
        console.log(`[Cron RSS] Catch-up mode: Fetching from ${catchupStartDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} (${daysMissed} days)`);
        results.mode = 'catchup';
        results.daysProcessed = daysMissed;

        const catchupFilings = await secRSSClient.fetchMissedDays(catchupStartDate, endDate);
        allFilings.push(...catchupFilings);
      }

      // ALSO fetch today's filings via RSS (index files don't cover today)
      console.log('[Cron RSS] Also fetching today\'s filings from RSS feed...');
      const todayFilings = await secRSSClient.fetchRecentFilingsFromRSS();
      allFilings.push(...todayFilings);
    } else {
      // DAILY MODE: Fetch from RSS feed (real-time, but limited to 100 per form type)
      console.log('[Cron RSS] Daily mode: Fetching latest filings from RSS');
      allFilings = await secRSSClient.fetchRecentFilingsFromRSS();

      // ALWAYS supplement with yesterday's daily index file to catch filings
      // the RSS feed missed (RSS only returns 100 per form type, which isn't
      // enough on busy filing days like earnings season)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (yesterday.getDay() !== 0 && yesterday.getDay() !== 6) {
        console.log('[Cron RSS] Supplementing with yesterday\'s daily index...');
        try {
          const indexFilings = await secRSSClient.fetchFromDailyIndex(yesterday);
          const existingAccessions = new Set(allFilings.map(f => f.accessionNumber));
          const newFromIndex = indexFilings.filter(f => !existingAccessions.has(f.accessionNumber));
          allFilings.push(...newFromIndex);
          console.log(`[Cron RSS] Daily index added ${newFromIndex.length} filings not in RSS feed`);
        } catch (indexError: any) {
          console.error(`[Cron RSS] Daily index fetch failed (non-fatal): ${indexError.message}`);
        }
      }
    }

    console.log(`[Cron RSS] Found ${allFilings.length} total filings`);
    results.fetched = allFilings.length;

    // Get unique company CIKs/tickers
    const uniqueCompanies = new Set(allFilings.map(f => f.ticker));
    results.companiesProcessed = uniqueCompanies.size;

    // Store companies and filings in database, tracking affected company IDs
    const affectedCompanyIds = new Set<string>();
    for (const filing of allFilings) {
      try {
        // Upsert company
        const company = await prisma.company.upsert({
          where: { ticker: filing.ticker },
          create: {
            ticker: filing.ticker,
            cik: filing.cik,
            name: filing.companyName,
          },
          update: {
            cik: filing.cik,
            name: filing.companyName,
          },
        });

        // Upsert filing
        await prisma.filing.upsert({
          where: { accessionNumber: filing.accessionNumber },
          create: {
            companyId: company.id,
            cik: filing.cik,
            accessionNumber: filing.accessionNumber,
            filingType: filing.formType,
            filingDate: new Date(filing.filingDate),
            reportDate: filing.reportDate ? new Date(filing.reportDate) : null,
            filingUrl: filing.filingUrl,
          },
          update: {
            filingDate: new Date(filing.filingDate),
            reportDate: filing.reportDate ? new Date(filing.reportDate) : null,
          },
        });

        affectedCompanyIds.add(company.id);
        results.stored++;
      } catch (error: any) {
        results.errors.push(`${filing.ticker}: ${error.message}`);
      }
    }

    console.log('[Cron RSS] Filings fetch complete:', results);

    // Skip Yahoo Finance data fetching here - the dedicated update-stock-prices-batch
    // cron job handles this on a schedule with proper rate limiting.
    // Calling Yahoo Finance for every new filing ticker was causing rate limiting
    // (1,200+ calls/day across all cron jobs).
    const yahooFinanceUpdates = 0;
    const yahooFinanceErrors = 0;
    console.log(`[Cron RSS] Skipping Yahoo Finance updates (handled by update-stock-prices-batch cron)`);

    // Flush prediction cache only for companies that received new filings
    let cacheFlushCount = 0;
    const companyIdArray = Array.from(affectedCompanyIds);
    if (companyIdArray.length > 0) {
      console.log(`[Cron RSS] Flushing predictions for ${companyIdArray.length} affected companies...`);
      try {
        const clearResult = await prisma.filing.updateMany({
          where: {
            companyId: { in: companyIdArray },
            predicted7dReturn: { not: null }
          },
          data: {
            predicted7dReturn: null,
            predictionConfidence: null
          }
        });
        cacheFlushCount = clearResult.count;

        // Also delete prediction records for affected companies
        await prisma.prediction.deleteMany({
          where: {
            filing: {
              companyId: { in: companyIdArray }
            }
          }
        });

        console.log(`[Cron RSS] Cache flushed: ${cacheFlushCount} predictions cleared for ${companyIdArray.length} companies`);
      } catch (flushError: any) {
        console.error(`[Cron RSS] Warning: Cache flush failed: ${flushError.message}`);
        // Don't fail the whole job if cache flush fails
      }
    } else {
      console.log('[Cron RSS] No new filings stored, skipping prediction flush');
    }

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

    // Run supervisor health checks after successful completion
    console.log('[Cron RSS] Running supervisor health checks...');
    let supervisorReport;
    try {
      supervisorReport = await runSupervisorChecks(false); // Don't auto-trigger (we just ran!)
      console.log('[Cron RSS] Supervisor checks completed:', supervisorReport);
    } catch (supervisorError: any) {
      console.error('[Cron RSS] Supervisor checks failed:', supervisorError.message);
      // Don't fail the whole job if supervisor fails
    }

    return NextResponse.json({
      success: true,
      message: `Fetched ${results.fetched} filings, stored ${results.stored} (${results.mode} mode), updated ${yahooFinanceUpdates} companies with Yahoo Finance data`,
      results: {
        ...results,
        yahooFinanceUpdates,
        yahooFinanceErrors
      },
      supervisorReport
    });
  } catch (error: any) {
    console.error('[Cron RSS] Error:', error);

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
