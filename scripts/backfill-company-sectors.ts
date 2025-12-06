import { prisma } from '../lib/prisma';
import yahooFinance from 'yahoo-finance2';

async function backfillSectors() {
  console.log('Starting sector backfill for all companies...\n');

  // Get all companies without sector data
  const companies = await prisma.company.findMany({
    where: {
      sector: null
    },
    select: {
      id: true,
      ticker: true,
      name: true,
    }
  });

  console.log(`Found ${companies.length} companies without sector data\n`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const progress = `[${i + 1}/${companies.length}]`;

    try {
      console.log(`${progress} Fetching sector for ${company.ticker} (${company.name})...`);

      // Fetch quoteSummary from Yahoo Finance (assetProfile has sector)
      const summary = await yahooFinance.quoteSummary(company.ticker, {
        modules: ['assetProfile']
      });

      if (summary.assetProfile?.sector) {
        // Update company with sector
        await prisma.company.update({
          where: { id: company.id },
          data: { sector: summary.assetProfile.sector }
        });

        console.log(`${progress} ✓ ${company.ticker}: ${summary.assetProfile.sector}`);
        updated++;
      } else {
        console.log(`${progress} ⚠ ${company.ticker}: No sector in Yahoo Finance data`);
        skipped++;
      }

      // Rate limit: 2 requests per second (Yahoo Finance limit)
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      console.error(`${progress} ✗ ${company.ticker}: ${error.message}`);
      failed++;

      // If rate limited, wait longer
      if (error.message?.includes('rate limit') || error.message?.includes('429')) {
        console.log('Rate limited, waiting 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no sector): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total processed: ${companies.length}`);

  await prisma.$disconnect();
}

backfillSectors().catch(console.error);
