/**
 * Backfill Macro Indicators
 *
 * Fetches S&P 500, VIX, and interest rate data for all filing dates
 * This provides market context that's critical for mega-cap prediction
 */

import { prisma } from '../lib/prisma';
import yahooFinance from '../lib/yahoo-finance-singleton';

async function main() {
  console.log('🚀 Backfilling Macro Indicators\n');
  console.log('═'.repeat(80));

  // Get all unique filing dates
  const filings = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null },
    },
    select: {
      filingDate: true,
    },
    orderBy: { filingDate: 'asc' },
  });

  const uniqueDates = Array.from(
    new Set(filings.map(f => f.filingDate.toISOString().split('T')[0]))
  ).map(d => new Date(d));

  console.log(`\n📊 Found ${uniqueDates.length} unique filing dates\n`);
  console.log('═'.repeat(80));

  // Check which dates already have macro data - batch query
  const existingMacro = await prisma.macroIndicators.findMany({
    select: { date: true },
  });

  const existingDates = new Set(
    existingMacro.map(m => m.date.toISOString().split('T')[0])
  );

  const datesToFetch = uniqueDates.filter(
    d => !existingDates.has(d.toISOString().split('T')[0])
  );

  console.log(`\n✅ Already have: ${existingMacro.length} dates`);
  console.log(`📅 Need to fetch: ${datesToFetch.length} dates\n`);

  if (datesToFetch.length === 0) {
    console.log('✅ All macro data already exists!\n');
    await prisma.$disconnect();
    return;
  }

  console.log('═'.repeat(80));

  let processed = 0;
  let errors = 0;

  // Fetch data for date range
  const startDate = new Date(Math.min(...datesToFetch.map(d => d.getTime())));
  const endDate = new Date(Math.max(...datesToFetch.map(d => d.getTime())));

  // Add 30 days buffer before start date for moving averages
  startDate.setDate(startDate.getDate() - 30);

  console.log(`\n📈 Fetching S&P 500 (^GSPC) from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}\n`);

  try {
    const spxData = await yahooFinance.historical('^GSPC', {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    console.log(`✅ Fetched ${spxData.length} S&P 500 data points\n`);

    // Calculate returns for each date
    const spxByDate = new Map(spxData.map(d => [d.date.toISOString().split('T')[0], d]));

    console.log('📈 Fetching VIX (^VIX)...\n');

    const vixData = await yahooFinance.historical('^VIX', {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    console.log(`✅ Fetched ${vixData.length} VIX data points\n`);

    const vixByDate = new Map(vixData.map(d => [d.date.toISOString().split('T')[0], d]));

    // Prepare batch upsert data
    const macroIndicatorsData = [];

    // Process each date
    for (let i = 0; i < spxData.length; i++) {
      const date = spxData[i].date;
      const dateStr = date.toISOString().split('T')[0];

      // Skip if not in our target dates and not needed for moving averages
      const isTargetDate = datesToFetch.some(
        d => d.toISOString().split('T')[0] === dateStr
      );

      if (!isTargetDate && i < spxData.length - 30) {
        continue; // Only process target dates and last 30 days for MA calculation
      }

      try {
        const spxClose = spxData[i].close;
        const vixClose = vixByDate.get(dateStr)?.close ?? null;

        // Calculate 7-day and 30-day returns
        let spxReturn7d = null;
        let spxReturn30d = null;

        if (i >= 7) {
          const price7dAgo = spxData[i - 7].close;
          spxReturn7d = ((spxClose - price7dAgo) / price7dAgo) * 100;
        }

        if (i >= 30) {
          const price30dAgo = spxData[i - 30].close;
          spxReturn30d = ((spxClose - price30dAgo) / price30dAgo) * 100;
        }

        // Calculate VIX 30-day MA
        let vixMA30 = null;
        if (i >= 30) {
          const vixLast30 = [];
          for (let j = i - 29; j <= i; j++) {
            const vixDateStr = spxData[j].date.toISOString().split('T')[0];
            const vixVal = vixByDate.get(vixDateStr)?.close;
            if (vixVal) vixLast30.push(vixVal);
          }
          if (vixLast30.length > 0) {
            vixMA30 = vixLast30.reduce((a, b) => a + b, 0) / vixLast30.length;
          }
        }

        macroIndicatorsData.push({
          date,
          spxClose,
          spxReturn7d,
          spxReturn30d,
          vixClose,
          vixMA30,
        });

        processed++;

        if (processed % 50 === 0) {
          console.log(`⏳ Processed ${processed} dates...`);
        }
      } catch (error) {
        console.log(`  ❌ Error processing ${dateStr}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        errors++;
      }
    }

    // Batch upsert all macro indicators
    console.log(`\n💾 Batch upserting ${macroIndicatorsData.length} macro indicators...`);
    for (const data of macroIndicatorsData) {
      await prisma.macroIndicators.upsert({
        where: { date: data.date },
        create: data,
        update: data,
      });
    }
    console.log(`✅ Batch upsert completed\n`);

  } catch (error) {
    console.error(`❌ Error fetching market data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    errors++;
  }

  console.log('\n' + '═'.repeat(80));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(80));
  console.log(`✅ Dates processed:       ${processed}`);
  console.log(`❌ Errors:                ${errors}`);
  console.log('');

  // Show sample data
  const sampleMacro = await prisma.macroIndicators.findMany({
    take: 3,
    orderBy: { date: 'desc' },
  });

  console.log('📊 Sample Macro Indicators:');
  for (const macro of sampleMacro) {
    console.log(`\n  ${macro.date.toISOString().split('T')[0]}:`);
    console.log(`    SPX Close: ${macro.spxClose?.toFixed(2)}`);
    console.log(`    SPX 7d Return: ${macro.spxReturn7d?.toFixed(2)}%`);
    console.log(`    SPX 30d Return: ${macro.spxReturn30d?.toFixed(2)}%`);
    console.log(`    VIX Close: ${macro.vixClose?.toFixed(2)}`);
    console.log(`    VIX MA30: ${macro.vixMA30?.toFixed(2)}`);
  }

  console.log('');
  console.log('✅ Next: Run mega-cap optimization');
  console.log('   npx tsx scripts/mega-cap-optimization.ts');
  console.log('');

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});