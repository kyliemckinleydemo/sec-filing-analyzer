import { prisma } from '../lib/prisma';
import { yahooFinanceClient } from '../lib/yahoo-finance-client';

/**
 * Backfill analyst target prices for all companies
 * Runs in batches to stay under time limits
 */

const BATCH_SIZE = 50; // Process 50 companies at a time
const DELAY_BETWEEN_REQUESTS = 100; // 100ms delay for rate limiting

async function backfillAnalystTargets(startIndex: number = 0, limit?: number) {
  console.log(`\n=== Starting Analyst Target Price Backfill ===`);
  console.log(`Start index: ${startIndex}`);
  console.log(`Batch size: ${BATCH_SIZE}`);

  const startTime = Date.now();

  // Get companies that need updating
  const companies = await prisma.company.findMany({
    where: {
      currentPrice: { not: null } // Only update companies we have price data for
    },
    select: {
      id: true,
      ticker: true,
      name: true,
      currentPrice: true,
      analystTargetPrice: true
    },
    orderBy: {
      ticker: 'asc'
    },
    skip: startIndex,
    take: limit || BATCH_SIZE
  });

  console.log(`\nFound ${companies.length} companies to update`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;
  let newTargetsFound = 0;

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const elapsedSeconds = (Date.now() - startTime) / 1000;

    // Safety check - stop if approaching 4 minutes (240s) to leave buffer
    if (elapsedSeconds > 240) {
      console.log(`\n⚠️  Approaching time limit (${elapsedSeconds.toFixed(0)}s), stopping batch`);
      console.log(`   Completed ${i} of ${companies.length} companies`);
      break;
    }

    try {
      console.log(`\n[${i + 1}/${companies.length}] ${company.ticker} (${company.name})`);

      // Fetch fresh Yahoo Finance data
      const data = await yahooFinanceClient.getCompanyFinancials(company.ticker);

      if (data && data.analystTargetPrice) {
        // Update company with analyst target price
        await prisma.company.update({
          where: { id: company.id },
          data: {
            analystTargetPrice: data.analystTargetPrice,
            // Also update other fields from Yahoo Finance
            currentPrice: data.currentPrice ?? company.currentPrice,
            marketCap: data.marketCap,
            peRatio: data.peRatio,
            forwardPE: data.forwardPE,
            beta: data.beta,
            dividendYield: data.dividendYield,
            yahooLastUpdated: new Date()
          }
        });

        const hadTarget = company.analystTargetPrice !== null;
        if (!hadTarget) newTargetsFound++;

        const upside = data.currentPrice && data.analystTargetPrice
          ? ((data.analystTargetPrice - data.currentPrice) / data.currentPrice * 100).toFixed(1)
          : 'N/A';

        console.log(`   ✅ Updated: $${data.currentPrice} → $${data.analystTargetPrice} (${upside}% upside)${!hadTarget ? ' [NEW]' : ''}`);
        updated++;
      } else if (data) {
        console.log(`   ⚠️  No analyst target price available`);
        // Still update other fields
        await prisma.company.update({
          where: { id: company.id },
          data: {
            currentPrice: data.currentPrice ?? company.currentPrice,
            marketCap: data.marketCap,
            peRatio: data.peRatio,
            forwardPE: data.forwardPE,
            beta: data.beta,
            dividendYield: data.dividendYield,
            yahooLastUpdated: new Date()
          }
        });
        skipped++;
      } else {
        console.log(`   ❌ Failed to fetch data`);
        failed++;
      }

      // Rate limiting delay
      if (i < companies.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      }

    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
      failed++;
    }
  }

  const elapsedSeconds = (Date.now() - startTime) / 1000;

  console.log(`\n=== Batch Complete ===`);
  console.log(`Processed: ${companies.length} companies`);
  console.log(`Updated: ${updated} (${newTargetsFound} new targets found)`);
  console.log(`Skipped: ${skipped} (no target available)`);
  console.log(`Failed: ${failed}`);
  console.log(`Time: ${elapsedSeconds.toFixed(1)}s`);
  console.log(`Next start index: ${startIndex + companies.length}`);

  return {
    processed: companies.length,
    updated,
    newTargetsFound,
    skipped,
    failed,
    nextIndex: startIndex + companies.length,
    elapsedSeconds
  };
}

// Allow running from command line with optional start index
const startIndex = parseInt(process.argv[2] || '0');
const limit = process.argv[3] ? parseInt(process.argv[3]) : undefined;

backfillAnalystTargets(startIndex, limit)
  .then((result) => {
    console.log('\n✅ Backfill batch completed successfully');
    if (result.newTargetsFound > 0) {
      console.log(`\n🎉 Found ${result.newTargetsFound} new analyst target prices!`);
    }
    process.exit(0);
  })
  .catch(e => {
    console.error('\n❌ Backfill failed:', e);
    process.exit(1);
  });
