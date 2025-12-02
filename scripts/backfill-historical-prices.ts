/**
 * Backfill Historical Stock Prices
 *
 * For each filing, fetch 90 days of historical prices BEFORE the filing date
 * This is needed for momentum indicator calculations (MA30, MA50, etc.)
 */

import { prisma } from '../lib/prisma';
import yahooFinance from 'yahoo-finance2';

async function main() {
  console.log('🚀 Backfilling Historical Stock Prices\n');
  console.log('═'.repeat(80));

  // Get all filings with actual returns (meaning they have a filing date we care about)
  const filings = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null },
    },
    include: {
      company: true,
    },
    orderBy: { filingDate: 'asc' },
  });

  console.log(`\n📊 Found ${filings.length} filings to backfill historical prices\n`);
  console.log('═'.repeat(80));

  let processed = 0;
  let errors = 0;
  let totalPricesAdded = 0;

  for (const filing of filings) {
    const idx = processed + 1;
    console.log(`\n[${idx}/${filings.length}] ${filing.company.ticker} - Filing ${filing.filingDate.toISOString().split('T')[0]}`);

    try {
      const ticker = filing.company.ticker;
      const filingDate = filing.filingDate;

      // Calculate date range: 90 days before filing date
      const endDate = new Date(filingDate);
      const startDate = new Date(filingDate);
      startDate.setDate(startDate.getDate() - 90);

      console.log(`  📅 Fetching prices: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

      // Check how many prices we already have
      const existingPrices = await prisma.stockPrice.count({
        where: {
          ticker,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      console.log(`  📊 Already have ${existingPrices} prices in this range`);

      // Fetch historical prices from Yahoo Finance
      const historicalPrices = await yahooFinance.historical(ticker, {
        period1: startDate,
        period2: endDate,
        interval: '1d',
      });

      if (!historicalPrices || historicalPrices.length === 0) {
        console.log(`  ⚠️  No historical prices returned`);
        continue;
      }

      console.log(`  📈 Fetched ${historicalPrices.length} historical prices from Yahoo`);

      // Upsert each price point
      let added = 0;
      for (const price of historicalPrices) {
        try {
          await prisma.stockPrice.upsert({
            where: {
              ticker_date: {
                ticker,
                date: price.date,
              },
            },
            create: {
              ticker,
              date: price.date,
              open: price.open,
              high: price.high,
              low: price.low,
              close: price.close,
              volume: price.volume,
              filingId: filing.id,
            },
            update: {
              open: price.open,
              high: price.high,
              low: price.low,
              close: price.close,
              volume: price.volume,
            },
          });
          added++;
        } catch (error) {
          // Likely duplicate, ignore
        }
      }

      console.log(`  ✅ Added/updated ${added} prices`);
      totalPricesAdded += added;
      processed++;

      // Rate limiting
      if (idx % 10 === 0) {
        console.log(`\n⏳ Processed ${idx} filings, pausing 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      errors++;
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(80));
  console.log(`✅ Filings processed:     ${processed}`);
  console.log(`❌ Errors:                ${errors}`);
  console.log(`📈 Total prices added:    ${totalPricesAdded}`);
  console.log('');
  console.log('✅ Next: Re-run momentum indicator backfill');
  console.log('   npx tsx scripts/backfill-momentum-indicators.ts');
  console.log('');

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
