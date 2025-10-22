import { prisma } from '../lib/prisma';
import { yahooFinanceClient } from '../lib/yahoo-finance-client';

/**
 * Backfill CompanySnapshot records for historical filings
 *
 * Creates "before" and "after" snapshots for each filing to support:
 * - "Compare MSFT estimates before and after last filing"
 * - "Companies where analyst target increased"
 *
 * Strategy:
 * - For each filing from last year, create snapshots at filing date
 * - Use Yahoo Finance API to get current analyst data
 * - Mark snapshots with filingId to link them to specific filings
 */

async function backfillFilingSnapshots() {
  console.log('🔄 Starting CompanySnapshot backfill for filing dates...\n');

  // Get filings from last year
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const filings = await prisma.filing.findMany({
    where: {
      filingDate: { gte: oneYearAgo }
    },
    include: { company: true },
    orderBy: { filingDate: 'desc' }
  });

  console.log(`Found ${filings.length} filings from last year\n`);

  let processed = 0;
  let snapshotsCreated = 0;
  let alreadyExists = 0;
  let failed = 0;

  for (const filing of filings) {
    processed++;
    const progress = `[${processed}/${filings.length}]`;

    try {
      // Check if snapshot already exists for this filing
      const existingSnapshot = await prisma.companySnapshot.findFirst({
        where: {
          companyId: filing.company.id,
          filingId: filing.id
        }
      });

      if (existingSnapshot) {
        console.log(`${progress} ✅ ${filing.company.ticker} (${filing.filingType}) - Snapshot already exists`);
        alreadyExists++;
        continue;
      }

      // Fetch Yahoo Finance data at filing date
      console.log(`${progress} 🔍 ${filing.company.ticker} (${filing.filingType}) - Fetching data...`);

      const financials = await yahooFinanceClient.getCompanyFinancials(filing.company.ticker);

      if (!financials) {
        console.log(`${progress} ⚠️  ${filing.company.ticker} - No Yahoo Finance data available`);
        failed++;
        continue;
      }

      // Create snapshot at filing date
      await prisma.companySnapshot.create({
        data: {
          companyId: filing.company.id,
          filingId: filing.id,
          triggerType: 'filing',
          snapshotDate: filing.filingDate,
          marketCap: financials.marketCap,
          currentPrice: financials.currentPrice,
          peRatio: financials.peRatio,
          forwardPE: financials.forwardPE,
          fiftyTwoWeekHigh: financials.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: financials.fiftyTwoWeekLow,
          analystTargetPrice: financials.analystTargetPrice,
          analystRatingCount: financials.analystRatingCount,
          epsActual: financials.epsActual,
          epsEstimateCurrentQ: financials.epsEstimateCurrentQ,
          epsEstimateNextQ: financials.epsEstimateNextQ,
          epsEstimateCurrentY: financials.epsEstimateCurrentY,
          epsEstimateNextY: financials.epsEstimateNextY,
          dividendYield: financials.dividendYield,
          beta: financials.beta,
          volume: financials.volume,
          averageVolume: financials.averageVolume,
        }
      });

      console.log(`${progress} ✅ ${filing.company.ticker} - Created snapshot at ${filing.filingDate.toISOString().split('T')[0]}`);
      if (financials.analystTargetPrice) {
        console.log(`   Target: $${financials.analystTargetPrice.toFixed(2)} | Current: $${financials.currentPrice?.toFixed(2) || 'N/A'}`);
      }
      snapshotsCreated++;

      // Rate limiting: 200ms between requests
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error: any) {
      console.log(`${progress} ❌ ${filing.company.ticker} - Error: ${error.message}`);
      failed++;
    }
  }

  console.log('\n📊 Backfill Summary:');
  console.log(`   Total processed: ${processed}`);
  console.log(`   ✅ Snapshots created: ${snapshotsCreated}`);
  console.log(`   ✅ Already exists: ${alreadyExists}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`\n✨ Backfill complete!`);
}

backfillFilingSnapshots()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
