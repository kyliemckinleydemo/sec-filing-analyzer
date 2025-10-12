/**
 * Local Backfill Script
 *
 * Run this script locally to backfill historical SEC filings data.
 * This avoids SEC blocking issues that occur when running from Vercel.
 *
 * Usage:
 *   npx tsx scripts/local-backfill.ts --days 270
 *   npx tsx scripts/local-backfill.ts --start 2024-01-15 --end 2025-10-12
 */

import { prisma } from '../lib/prisma';
import { secRSSClient } from '../lib/sec-rss-client';

interface BackfillOptions {
  startDate: Date;
  endDate: Date;
  chunkSizeDays: number;
}

async function backfillHistoricalData(options: BackfillOptions) {
  const { startDate, endDate, chunkSizeDays } = options;

  console.log(`\n🚀 Starting local backfill`);
  console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  console.log(`Chunk size: ${chunkSizeDays} days\n`);

  const totalStats = {
    fetched: 0,
    stored: 0,
    errors: 0,
    chunks: 0,
  };

  // Process in chunks to avoid overwhelming the system
  let currentStart = new Date(startDate);

  while (currentStart <= endDate) {
    const chunkEnd = new Date(currentStart);
    chunkEnd.setDate(chunkEnd.getDate() + chunkSizeDays - 1);

    if (chunkEnd > endDate) {
      chunkEnd.setTime(endDate.getTime());
    }

    totalStats.chunks++;

    console.log(`\n=== Chunk ${totalStats.chunks} ===`);
    console.log(`Processing: ${currentStart.toISOString().split('T')[0]} to ${chunkEnd.toISOString().split('T')[0]}`);

    // Create job run record
    const jobRun = await prisma.cronJobRun.create({
      data: {
        jobName: 'local-backfill',
        status: 'running',
      },
    });

    try {
      // Fetch filings using the SEC RSS client
      const filings = await secRSSClient.fetchMissedDays(
        currentStart,
        chunkEnd,
        ['10-K', '10-Q', '8-K']
      );

      console.log(`Found ${filings.length} filings`);
      totalStats.fetched += filings.length;

      // Store in database
      let stored = 0;
      for (const filing of filings) {
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

          stored++;
        } catch (error: any) {
          totalStats.errors++;
          console.error(`Error storing ${filing.ticker}: ${error.message}`);
        }
      }

      totalStats.stored += stored;
      console.log(`Stored ${stored} filings`);

      // Mark job run as successful
      await prisma.cronJobRun.update({
        where: { id: jobRun.id },
        data: {
          status: 'success',
          completedAt: new Date(),
          filingsFetched: filings.length,
          filingsStored: stored,
          companiesProcessed: new Set(filings.map(f => f.ticker)).size,
        },
      });

    } catch (error: any) {
      console.error(`Error processing chunk: ${error.message}`);
      totalStats.errors++;

      // Mark job run as failed
      await prisma.cronJobRun.update({
        where: { id: jobRun.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: error.message,
        },
      });
    }

    // Move to next chunk
    currentStart = new Date(chunkEnd);
    currentStart.setDate(currentStart.getDate() + 1);

    // Add a small delay between chunks to be respectful to SEC servers
    if (currentStart <= endDate) {
      console.log('Waiting 2 seconds before next chunk...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n✅ Backfill complete!`);
  console.log(`\nSummary:`);
  console.log(`  Chunks processed: ${totalStats.chunks}`);
  console.log(`  Filings fetched: ${totalStats.fetched}`);
  console.log(`  Filings stored: ${totalStats.stored}`);
  console.log(`  Errors: ${totalStats.errors}`);

  await prisma.$disconnect();
}

// Parse command line arguments
async function main() {
  const args = process.argv.slice(2);

  let startDate: Date;
  let endDate: Date = new Date();
  endDate.setDate(endDate.getDate() - 1); // Up to yesterday
  let chunkSizeDays = 45;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      const days = parseInt(args[i + 1]);
      startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      i++;
    } else if (args[i] === '--start' && args[i + 1]) {
      startDate = new Date(args[i + 1]);
      i++;
    } else if (args[i] === '--end' && args[i + 1]) {
      endDate = new Date(args[i + 1]);
      i++;
    } else if (args[i] === '--chunk-size' && args[i + 1]) {
      chunkSizeDays = parseInt(args[i + 1]);
      i++;
    }
  }

  // Default to 270 days if no arguments provided
  if (!startDate!) {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 270);
  }

  await backfillHistoricalData({
    startDate,
    endDate,
    chunkSizeDays,
  });
}

main().catch(console.error);
