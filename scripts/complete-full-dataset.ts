/**
 * Complete Full Dataset Pipeline
 *
 * This script ensures ALL data is present for comprehensive model analysis:
 * 1. Check which companies need 7-day returns backfilled
 * 2. Backfill historical prices (90 days) for any missing companies
 * 3. Calculate momentum indicators for all companies
 * 4. Ensure macro indicators exist for all filing dates
 * 5. Run comprehensive champion-challenger analysis with momentum
 */

import { prisma } from '../lib/prisma';
import { execSync } from 'child_process';

interface DataGaps {
  companiesNeedingReturns: number;
  filingsNeedingHistoricalPrices: number;
  tickersNeedingMomentum: number;
  datesNeedingMacro: number;
}

async function assessDataGaps(): Promise<DataGaps> {
  console.log('🔍 Assessing data completeness...\n');

  // 1. Check analyzed filings without 7-day returns
  const analyzedWithoutReturns = await prisma.filing.count({
    where: {
      analysisData: { not: null },
      actual7dReturn: null,
    },
  });

  // 2. Check filings with returns but no historical prices (for momentum)
  const filingsWithReturns = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null },
    },
    select: {
      id: true,
      filingDate: true,
      company: {
        select: {
          ticker: true,
        },
      },
    },
  });

  let needHistoricalPrices = 0;
  for (const filing of filingsWithReturns) {
    const startDate = new Date(filing.filingDate);
    startDate.setDate(startDate.getDate() - 90);

    const historicalCount = await prisma.stockPrice.count({
      where: {
        ticker: filing.company.ticker,
        date: {
          gte: startDate,
          lte: filing.filingDate,
        },
      },
    });

    // Should have ~63 trading days (90 calendar days * 70%)
    if (historicalCount < 50) {
      needHistoricalPrices++;
    }
  }

  // 3. Check which tickers need momentum indicators
  const tickersWithReturns = await prisma.filing.findMany({
    where: { actual7dReturn: { not: null } },
    select: { company: { select: { ticker: true } } },
    distinct: ['companyId'],
  });

  let needMomentum = 0;
  for (const filing of tickersWithReturns) {
    const momentumCount = await prisma.technicalIndicators.count({
      where: { ticker: filing.company.ticker },
    });

    if (momentumCount < 10) {
      needMomentum++;
    }
  }

  // 4. Check macro indicators coverage
  const uniqueFilingDates = await prisma.filing.findMany({
    where: { actual7dReturn: { not: null } },
    select: { filingDate: true },
    distinct: ['filingDate'],
  });

  let needMacro = 0;
  for (const filing of uniqueFilingDates) {
    const macroExists = await prisma.macroIndicators.findFirst({
      where: {
        date: {
          lte: filing.filingDate,
          gte: new Date(filing.filingDate.getTime() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    if (!macroExists) {
      needMacro++;
    }
  }

  return {
    companiesNeedingReturns: analyzedWithoutReturns,
    filingsNeedingHistoricalPrices: needHistoricalPrices,
    tickersNeedingMomentum: needMomentum,
    datesNeedingMacro: needMacro,
  };
}

async function main() {
  console.log('🚀 Complete Full Dataset Pipeline\n');
  console.log('═'.repeat(80));
  console.log('');

  // Step 1: Assess current state
  const gaps = await assessDataGaps();

  console.log('📊 DATA COMPLETENESS ASSESSMENT');
  console.log('═'.repeat(80));
  console.log(`Filings needing 7-day returns:      ${gaps.companiesNeedingReturns}`);
  console.log(`Filings needing historical prices:  ${gaps.filingsNeedingHistoricalPrices}`);
  console.log(`Tickers needing momentum data:      ${gaps.tickersNeedingMomentum}`);
  console.log(`Filing dates needing macro data:    ${gaps.datesNeedingMacro}`);
  console.log('═'.repeat(80));
  console.log('');

  const steps = [
    {
      name: '1. Backfill 7-day returns for all analyzed filings',
      command: 'npx tsx scripts/backfill-stock-prices.ts',
      condition: gaps.companiesNeedingReturns > 0,
      log: 'full-returns-backfill.log',
    },
    {
      name: '2. Backfill 90-day historical prices for momentum calculations',
      command: 'npx tsx scripts/backfill-historical-prices.ts',
      condition: gaps.filingsNeedingHistoricalPrices > 0,
      log: 'full-historical-backfill.log',
    },
    {
      name: '3. Calculate momentum indicators for all tickers',
      command: 'npx tsx scripts/backfill-momentum-indicators.ts',
      condition: gaps.tickersNeedingMomentum > 0,
      log: 'full-momentum-backfill.log',
    },
    {
      name: '4. Backfill macro indicators (SPX, VIX) for all dates',
      command: 'npx tsx scripts/backfill-macro-indicators.ts',
      condition: gaps.datesNeedingMacro > 0,
      log: 'full-macro-backfill.log',
    },
  ];

  let stepsRun = 0;
  let stepsSkipped = 0;

  for (const step of steps) {
    console.log(`\n${step.name}`);
    console.log('─'.repeat(80));

    if (!step.condition) {
      console.log('✅ Already complete, skipping...');
      stepsSkipped++;
      continue;
    }

    try {
      console.log(`Running: ${step.command}\n`);
      execSync(`${step.command} 2>&1 | tee ${step.log}`, {
        stdio: 'inherit',
        maxBuffer: 100 * 1024 * 1024, // 100MB buffer
      });
      console.log(`\n✅ ${step.name} complete`);
      stepsRun++;
    } catch (error) {
      console.error(`\n❌ ${step.name} failed`);
      console.error(`Check ${step.log} for details\n`);
      throw error;
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('📊 DATA BACKFILL SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Steps run:     ${stepsRun}`);
  console.log(`Steps skipped: ${stepsSkipped}`);
  console.log('');

  // Final data check
  const finalStats = await getFinalStats();

  console.log('📈 FINAL DATASET STATISTICS');
  console.log('═'.repeat(80));
  console.log(`Total companies analyzed:          ${finalStats.companiesAnalyzed}`);
  console.log(`Total filings with 7-day returns:  ${finalStats.filingsWithReturns}`);
  console.log(`Total historical price points:     ${finalStats.historicalPrices}`);
  console.log(`Total momentum indicator records:  ${finalStats.momentumRecords}`);
  console.log(`Total macro indicator dates:       ${finalStats.macroDates}`);
  console.log('');

  console.log('📊 BREAKDOWN BY MARKET CAP');
  console.log('─'.repeat(80));
  console.log(`Mega Cap (>$500B):      ${finalStats.megaCapFilings} filings`);
  console.log(`Large Cap ($200-500B):  ${finalStats.largeCapFilings} filings`);
  console.log(`Mid Cap ($50-200B):     ${finalStats.midCapFilings} filings`);
  console.log(`Small Cap (<$50B):      ${finalStats.smallCapFilings} filings`);
  console.log('═'.repeat(80));
  console.log('');

  console.log('✅ DATASET COMPLETE! Ready for comprehensive analysis.');
  console.log('');
  console.log('🚀 Next step: Run comprehensive champion-challenger analysis');
  console.log('   npx tsx scripts/comprehensive-model-analysis.ts');
  console.log('');

  await prisma.$disconnect();
}

async function getFinalStats() {
  const companiesAnalyzed = await prisma.company.count({
    where: {
      filings: {
        some: {
          analysisData: { not: null },
        },
      },
    },
  });

  const filingsWithReturns = await prisma.filing.count({
    where: { actual7dReturn: { not: null } },
  });

  const historicalPrices = await prisma.stockPrice.count();
  const momentumRecords = await prisma.technicalIndicators.count();
  const macroDates = await prisma.macroIndicators.count();

  // Count by market cap
  const megaCapFilings = await prisma.filing.count({
    where: {
      actual7dReturn: { not: null },
      company: {
        snapshots: {
          some: {
            marketCap: { gte: 500_000_000_000 },
          },
        },
      },
    },
  });

  const largeCapFilings = await prisma.filing.count({
    where: {
      actual7dReturn: { not: null },
      company: {
        snapshots: {
          some: {
            marketCap: { gte: 200_000_000_000, lt: 500_000_000_000 },
          },
        },
      },
    },
  });

  const midCapFilings = await prisma.filing.count({
    where: {
      actual7dReturn: { not: null },
      company: {
        snapshots: {
          some: {
            marketCap: { gte: 50_000_000_000, lt: 200_000_000_000 },
          },
        },
      },
    },
  });

  const smallCapFilings = await prisma.filing.count({
    where: {
      actual7dReturn: { not: null },
      company: {
        snapshots: {
          some: {
            marketCap: { lt: 50_000_000_000 },
          },
        },
      },
    },
  });

  return {
    companiesAnalyzed,
    filingsWithReturns,
    historicalPrices,
    momentumRecords,
    macroDates,
    megaCapFilings,
    largeCapFilings,
    midCapFilings,
    smallCapFilings,
  };
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
