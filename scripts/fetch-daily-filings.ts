/**
 * Manual script to fetch daily SEC filings
 * Can be run locally to update filings data
 */

import { prisma } from '../lib/prisma';
import { secRSSClient } from '../lib/sec-rss-client';

async function fetchDailyFilings() {
  console.log('=== Fetching Daily SEC Filings ===\n');

  const startTime = Date.now();

  try {
    // Create job run record
    const jobRun = await prisma.cronJobRun.create({
      data: {
        jobName: 'daily-filings-rss-manual',
        status: 'running',
      },
    });

    console.log('Fetching recent filings from SEC RSS feed...');
    const filings = await secRSSClient.fetchRecentFilingsFromRSS();

    console.log(`\nFound ${filings.length} filings from tracked companies`);

    let stored = 0;
    let updated = 0;
    const companiesProcessed = new Set<string>();

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

        companiesProcessed.add(company.id);

        // Check if filing already exists
        const existingFiling = await prisma.filing.findUnique({
          where: { accessionNumber: filing.accessionNumber },
        });

        if (!existingFiling) {
          // Create new filing
          await prisma.filing.create({
            data: {
              companyId: company.id,
              cik: filing.cik,
              accessionNumber: filing.accessionNumber,
              filingType: filing.formType,
              filingDate: new Date(filing.filingDate),
              reportDate: filing.reportDate ? new Date(filing.reportDate) : null,
              filingUrl: filing.filingUrl,
            },
          });
          stored++;
          console.log(`  ✅ ${filing.ticker} ${filing.formType} - ${filing.filingDate}`);
        } else {
          updated++;
        }
      } catch (error: any) {
        console.error(`  ❌ Error processing ${filing.ticker}: ${error.message}`);
      }
    }

    const elapsedSeconds = (Date.now() - startTime) / 1000;

    // Update job run with results
    await prisma.cronJobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'success',
        completedAt: new Date(),
        filingsFetched: filings.length,
        filingsStored: stored,
        companiesProcessed: companiesProcessed.size,
      },
    });

    console.log(`\n=== Summary ===`);
    console.log(`Total filings found: ${filings.length}`);
    console.log(`New filings stored: ${stored}`);
    console.log(`Already existing: ${updated}`);
    console.log(`Companies processed: ${companiesProcessed.size}`);
    console.log(`Time taken: ${elapsedSeconds.toFixed(1)}s`);
    console.log(`\n✅ Daily filings fetch completed successfully!`);

  } catch (error: any) {
    console.error(`\n❌ Error fetching daily filings:`, error);
    throw error;
  }
}

fetchDailyFilings()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
