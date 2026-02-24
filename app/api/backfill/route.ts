/**
 * @module app/api/backfill/route
 * @description Next.js API route that backfills historical SEC filings data for companies by fetching and storing filing records across a specified date range
 *
 * PURPOSE:
 * - Fetch historical SEC filings (10-K, 10-Q, 8-K) using daily index files from the SEC RSS client
 * - Process and store company records and filing data in the database with upsert operations
 * - Track backfill job execution status, metrics, and errors in the cronJobRun table
 * - Support flexible date ranges via query parameters (days back or custom start/end dates)
 *
 * DEPENDENCIES:
 * - next/server - Provides NextResponse for API route JSON responses
 * - @/lib/prisma - Database client for upserting companies and filings, tracking job runs
 * - @/lib/sec-rss-client - secRSSClient.fetchMissedDays() retrieves historical filings from SEC daily indices
 *
 * EXPORTS:
 * - dynamic (const) - Forces dynamic rendering to prevent static generation at build time
 * - GET (function) - HTTP handler that executes backfill job and returns results with filing counts
 *
 * PATTERNS:
 * - Call via GET /api/backfill?days=90 to backfill last 90 days (max 50 per run to avoid timeouts)
 * - Or use GET /api/backfill?startDate=2025-01-01&endDate=2025-10-01 for custom date ranges
 * - Response includes { success, message, results: { fetched, stored, errors, companiesProcessed, daysProcessed } }
 *
 * CLAUDE NOTES:
 * - Auto-limits requests to 50 days maximum per run to prevent API timeouts - requires multiple runs for longer ranges
 * - Uses upsert pattern for both companies and filings to handle duplicate submissions across date ranges
 * - Creates cronJobRun record at start and updates with status/metrics on completion or failure for audit trail
 * - End date defaults to yesterday (getDate() - 1) to avoid incomplete current-day data from SEC
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { secRSSClient } from '@/lib/sec-rss-client';

// Mark route as dynamic to prevent static generation at build time
export const dynamic = 'force-dynamic';

/**
 * Backfill Job: Populate historical SEC filings data
 *
 * Uses SEC daily index files to fetch historical filings for top 1,000 companies
 * Can specify custom date range via query parameters
 *
 * Example:
 * - /api/backfill?days=90 (last 90 days)
 * - /api/backfill?startDate=2025-01-01&endDate=2025-10-01 (custom range)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Get date range from query params
  const daysParam = searchParams.get('days');
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');

  let startDate: Date;
  let endDate: Date = new Date();
  endDate.setDate(endDate.getDate() - 1); // Up to yesterday

  if (startDateParam && endDateParam) {
    // Custom date range
    startDate = new Date(startDateParam);
    endDate = new Date(endDateParam);
  } else {
    // Days back (default 90, max 50 to avoid timeouts)
    let days = daysParam ? parseInt(daysParam) : 90;

    // Limit to 50 days per run to avoid timeouts
    if (days > 50) {
      days = 50;
      console.log(`[Backfill] Limiting to 50 days per run (requested ${daysParam} days). Run multiple times to backfill more.`);
    }

    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
  }

  // Create job run record
  const jobRun = await prisma.cronJobRun.create({
    data: {
      jobName: 'backfill',
      status: 'running',
    },
  });

  try {
    console.log(`[Backfill] Starting backfill from ${startDate.toDateString()} to ${endDate.toDateString()}`);

    const results = {
      fetched: 0,
      stored: 0,
      errors: [] as string[],
      companiesProcessed: 0,
      daysProcessed: 0,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    // Fetch all filings using the catch-up mechanism
    const allFilings = await secRSSClient.fetchMissedDays(startDate, endDate, ['10-K', '10-Q', '8-K']);

    console.log(`[Backfill] Found ${allFilings.length} total filings`);
    results.fetched = allFilings.length;

    // Calculate days processed
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    results.daysProcessed = daysDiff;

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

    console.log('[Backfill] Complete:', results);

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
      message: `Backfill complete: ${results.stored} filings stored over ${results.daysProcessed} days`,
      results,
    });
  } catch (error: any) {
    console.error('[Backfill] Error:', error);

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
