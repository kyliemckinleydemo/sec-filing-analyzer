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
    // Days back (default 90)
    const days = daysParam ? parseInt(daysParam) : 90;
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
