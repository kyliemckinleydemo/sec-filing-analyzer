/**
 * Check Backfill Status and Readiness for Model Development
 *
 * Checks:
 * 1. Total mega-cap earnings reports (10-K/10-Q)
 * 2. Coverage by company
 * 3. Data completeness (7-day returns, momentum, macro)
 * 4. Readiness for filtered analysis
 */

import { prisma } from '../lib/prisma';

async function main() {
  console.log('📊 BACKFILL STATUS REPORT\n');
  console.log('═'.repeat(80));
  console.log('');

  // 1. Count mega-cap companies
  const megacapCompanies = await prisma.company.findMany({
    where: {
      ticker: {
        in: [
          'AAPL', 'MSFT', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO',
          'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC',
          'LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO',
          'WMT', 'PG', 'COST', 'HD', 'NKE', 'MCD',
          'XOM', 'CVX', 'COP',
          'ORCL', 'CRM', 'CSCO', 'NFLX', 'ADBE', 'INTC', 'AMD', 'QCOM',
          'PEP', 'KO', 'DIS', 'CMCSA', 'VZ', 'PFE', 'ABT', 'TMUS',
          'TSM', 'ASML', 'SAP', 'NVO',
        ],
      },
    },
    include: {
      _count: {
        select: { filings: true },
      },
    },
  });

  console.log(`📈 MEGA-CAP COMPANIES: ${megacapCompanies.length}/49 in database\n`);

  // 2. Count earnings filings (10-K/10-Q only)
  const earningsFilings = await prisma.filing.findMany({
    where: {
      filingType: { in: ['10-K', '10-Q'] },
      company: {
        ticker: {
          in: megacapCompanies.map(c => c.ticker),
        },
      },
    },
    include: {
      company: true,
    },
  });

  console.log(`📋 EARNINGS FILINGS: ${earningsFilings.length} total (10-K/10-Q)\n`);

  // 3. Data completeness breakdown
  const withAnalysis = earningsFilings.filter(f => f.analysisData);
  const with7dReturn = earningsFilings.filter(f => f.actual7dReturn !== null);

  const filingIds = earningsFilings.map(f => f.id);

  const snapshotsCount = await prisma.companySnapshot.count({
    where: {
      filingId: { in: filingIds },
    },
  });

  // Technical indicators are linked by ticker/date, not filing
  const technicalCount = await prisma.technicalIndicators.count();

  console.log('📊 DATA COMPLETENESS:\n');
  console.log(`  Claude Analysis:      ${withAnalysis.length}/${earningsFilings.length} (${((withAnalysis.length / earningsFilings.length) * 100).toFixed(1)}%)`);
  console.log(`  7-Day Returns:        ${with7dReturn.length}/${earningsFilings.length} (${((with7dReturn.length / earningsFilings.length) * 100).toFixed(1)}%)`);
  console.log(`  Company Snapshots:    ${snapshotsCount}/${earningsFilings.length} (${((snapshotsCount / earningsFilings.length) * 100).toFixed(1)}%)`);
  console.log(`  Technical Indicators: ${technicalCount}/${earningsFilings.length} (${((technicalCount / earningsFilings.length) * 100).toFixed(1)}%)`);
  console.log('');

  // 4. Ready for filtered analysis
  const readyForAnalysis = earningsFilings.filter(f =>
    f.analysisData && f.actual7dReturn !== null
  );

  console.log(`✅ READY FOR ANALYSIS: ${readyForAnalysis.length} filings with complete data\n`);

  // 5. Breakdown by filing type
  const filingTypeBreakdown = {
    '10-K': readyForAnalysis.filter(f => f.filingType === '10-K').length,
    '10-Q': readyForAnalysis.filter(f => f.filingType === '10-Q').length,
  };

  console.log('📈 FILING TYPE BREAKDOWN (Ready):\n');
  console.log(`  10-K (Annual):    ${filingTypeBreakdown['10-K']} filings`);
  console.log(`  10-Q (Quarterly): ${filingTypeBreakdown['10-Q']} filings`);
  console.log('');

  // 6. Top companies by filing count
  const companyCounts = megacapCompanies
    .map(c => ({
      ticker: c.ticker,
      name: c.name,
      filings: earningsFilings.filter(f => f.companyId === c.id).length,
      ready: readyForAnalysis.filter(f => f.companyId === c.id).length,
    }))
    .filter(c => c.filings > 0)
    .sort((a, b) => b.ready - a.ready);

  console.log('🏆 TOP 10 COMPANIES (by ready filings):\n');
  companyCounts.slice(0, 10).forEach((c, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${c.ticker.padEnd(6)} ${c.ready.toString().padStart(2)} ready / ${c.filings.toString().padStart(2)} total`);
  });
  console.log('');

  // 7. Companies with no filings yet
  const noFilings = megacapCompanies.filter(c => c._count.filings === 0);
  if (noFilings.length > 0) {
    console.log(`⚠️  COMPANIES WITH NO FILINGS: ${noFilings.length}\n`);
    noFilings.forEach(c => {
      console.log(`  - ${c.ticker}: ${c.name}`);
    });
    console.log('');
  }

  // 8. Recommendation
  console.log('═'.repeat(80));
  console.log('📋 NEXT STEPS:\n');

  if (readyForAnalysis.length < 50) {
    console.log('⏳ WAIT: Backfill still in progress');
    console.log(`   Current: ${readyForAnalysis.length} ready filings`);
    console.log('   Target: 200+ for statistical power');
    console.log('   Action: Wait for backfill to complete, then run:');
    console.log('           1. npx tsx scripts/backfill-stock-prices.ts');
    console.log('           2. npx tsx scripts/backfill-momentum-indicators.ts');
  } else if (readyForAnalysis.length < 200) {
    console.log('🔄 IN PROGRESS: Good start, but need more data');
    console.log(`   Current: ${readyForAnalysis.length} ready filings`);
    console.log('   Target: 200+ for statistical power');
    console.log('   Action: Continue backfill, then:');
    console.log('           1. npx tsx scripts/backfill-stock-prices.ts (if needed)');
    console.log('           2. npx tsx scripts/backfill-momentum-indicators.ts (if needed)');
  } else {
    console.log('✅ READY: Sufficient data for model development!');
    console.log(`   Current: ${readyForAnalysis.length} ready filings`);
    console.log('   Action: Run filtered champion-challenger analysis:');
    console.log('           npx tsx scripts/filtered-champion-challenger.ts');
  }

  console.log('');
  console.log('═'.repeat(80));

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
