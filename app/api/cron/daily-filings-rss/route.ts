import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { secRSSClient } from '@/lib/sec-rss-client';
import { yahooFinanceClient } from '@/lib/yahoo-finance-client';

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

    // Determine if we need catch-up mode
    if (lastSuccessfulRun?.completedAt) {
      const daysSinceLastRun = Math.floor(
        (Date.now() - lastSuccessfulRun.completedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastRun > 1) {
        // CATCH-UP MODE: Fetch missed days using daily index files
        console.log(`[Cron RSS] Catch-up mode: ${daysSinceLastRun} days missed`);
        results.mode = 'catchup';
        results.daysProcessed = daysSinceLastRun;

        const startDate = new Date(lastSuccessfulRun.completedAt);
        startDate.setDate(startDate.getDate() + 1); // Start from day after last run
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1); // Up to yesterday

        allFilings = await secRSSClient.fetchMissedDays(startDate, endDate);
      } else {
        // DAILY MODE: Fetch from RSS feed (real-time)
        console.log('[Cron RSS] Daily mode: Fetching latest filings from RSS');
        allFilings = await secRSSClient.fetchRecentFilingsFromRSS();
      }
    } else {
      // First run: Use RSS for recent filings
      console.log('[Cron RSS] First run: Fetching recent filings from RSS');
      allFilings = await secRSSClient.fetchRecentFilingsFromRSS();
    }

    console.log(`[Cron RSS] Found ${allFilings.length} total filings`);
    results.fetched = allFilings.length;

    // Get unique company CIKs/tickers
    const uniqueCompanies = new Set(allFilings.map(f => f.ticker));
    results.companiesProcessed = uniqueCompanies.size;

    // Store companies and filings in database
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

        results.stored++;
      } catch (error: any) {
        results.errors.push(`${filing.ticker}: ${error.message}`);
      }
    }

    console.log('[Cron RSS] Filings fetch complete:', results);

    // Fetch Yahoo Finance data for companies with new filings
    console.log('[Cron RSS] Fetching Yahoo Finance data for companies with new filings...');
    let yahooFinanceUpdates = 0;
    let yahooFinanceErrors = 0;

    for (const ticker of uniqueCompanies) {
      try {
        const financials = await yahooFinanceClient.getCompanyFinancials(ticker);

        if (financials) {
          await prisma.company.update({
            where: { ticker },
            data: {
              marketCap: financials.marketCap,
              peRatio: financials.peRatio,
              forwardPE: financials.forwardPE,
              currentPrice: financials.currentPrice,
              fiftyTwoWeekHigh: financials.fiftyTwoWeekHigh,
              fiftyTwoWeekLow: financials.fiftyTwoWeekLow,
              analystTargetPrice: financials.analystTargetPrice,
              earningsDate: financials.earningsDate,
              yahooFinanceData: JSON.stringify(financials.additionalData),
              yahooLastUpdated: new Date()
            }
          });
          yahooFinanceUpdates++;
        }

        // Rate limit: small delay between requests (100ms = 10 req/sec, well within limits)
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        console.error(`[Cron RSS] Error fetching Yahoo Finance data for ${ticker}:`, error.message);
        yahooFinanceErrors++;
      }
    }

    console.log(`[Cron RSS] Yahoo Finance updates: ${yahooFinanceUpdates} success, ${yahooFinanceErrors} errors`);

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
      message: `Fetched ${results.fetched} filings, stored ${results.stored} (${results.mode} mode), updated ${yahooFinanceUpdates} companies with Yahoo Finance data`,
      results: {
        ...results,
        yahooFinanceUpdates,
        yahooFinanceErrors
      },
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
