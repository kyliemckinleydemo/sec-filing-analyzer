/**
 * @module check-dataset-size
 * @description Database diagnostic script that analyzes the ML training dataset readiness
 * 
 * PURPOSE:
 * - Reports on the current state of the SEC filings dataset in the database
 * - Counts filings with AI analysis (sentiment, risk scores) from Claude
 * - Counts filings with actual 7-day stock price returns
 * - Identifies filings ready for ML model training (having both analysis AND returns)
 * - Displays date ranges, market cap distribution, and sample data
 * - Provides recommendations on dataset sufficiency for model development
 * 
 * EXPORTS:
 * - None (executable script with internal main function)
 * 
 * CLAUDE NOTES:
 * - This is a data quality checkpoint script for the ML pipeline
 * - Training requires BOTH AI analysis features AND actual stock returns (labels)
 * - Market cap segmentation helps ensure model works across company sizes
 * - Uses optimized SQL aggregation query for market cap distribution
 * - Minimum 50 samples recommended before attempting model training
 * - Typical workflow: run AI analysis → backfill stock prices → verify with this script
 */

import { prisma } from '../lib/prisma';

async function main() {
  console.log('📊 Checking Dataset Status\n');
  console.log('═'.repeat(80));

  // Total filings
  const totalFilings = await prisma.filing.count();
  console.log(`Total filings in database: ${totalFilings}`);

  // Filings with AI analysis
  const withAnalysis = await prisma.filing.count({
    where: {
      analysisData: { not: null },
      riskScore: { not: null },
      sentimentScore: { not: null },
    },
  });
  console.log(`Filings with AI analysis: ${withAnalysis}`);

  // Filings with stock prices (actual returns)
  const withReturns = await prisma.filing.count({
    where: {
      actual7dReturn: { not: null },
    },
  });
  console.log(`Filings with actual 7-day returns: ${withReturns}`);

  // Filings ready for model training (both analysis AND returns)
  const readyForTraining = await prisma.filing.count({
    where: {
      analysisData: { not: null },
      riskScore: { not: null },
      sentimentScore: { not: null },
      actual7dReturn: { not: null },
    },
  });
  console.log(`\n✅ Filings ready for model training: ${readyForTraining}`);
  console.log('   (Have both AI analysis AND actual stock returns)\n');

  // Get sample of ready filings to show date range
  if (readyForTraining > 0) {
    const samples = await prisma.filing.findMany({
      where: {
        analysisData: { not: null },
        actual7dReturn: { not: null },
      },
      select: {
        filingDate: true,
        company: {
          select: {
            ticker: true,
            marketCap: true,
          },
        },
        filingType: true,
        actual7dReturn: true,
      },
      orderBy: { filingDate: 'desc' },
      take: 10,
    });

    console.log('Most recent filings ready for training:');
    console.log('─'.repeat(80));
    samples.forEach(f => {
      const marketCapB = f.company.marketCap ? (f.company.marketCap / 1_000_000_000).toFixed(0) : 'N/A';
      console.log(
        `  ${f.company.ticker.padEnd(6)} ${f.filingType.padEnd(5)} ${f.filingDate.toISOString().split('T')[0]} ` +
        `Return: ${f.actual7dReturn!.toFixed(2).padStart(6)}% MarketCap: $${marketCapB}B`
      );
    });
    console.log('');

    // Date range
    const oldest = await prisma.filing.findFirst({
      where: {
        analysisData: { not: null },
        actual7dReturn: { not: null },
      },
      orderBy: { filingDate: 'asc' },
      select: { filingDate: true },
    });

    const newest = await prisma.filing.findFirst({
      where: {
        analysisData: { not: null },
        actual7dReturn: { not: null },
      },
      orderBy: { filingDate: 'desc' },
      select: { filingDate: true },
    });

    if (oldest && newest) {
      console.log(`Date range: ${oldest.filingDate.toISOString().split('T')[0]} to ${newest.filingDate.toISOString().split('T')[0]}`);
    }

    // Market cap distribution - batched into single query with aggregation
    console.log('\n📊 Market Cap Distribution:');
    console.log('─'.repeat(80));

    const marketCapCounts = await prisma.$queryRaw<Array<{ category: string; count: bigint }>>`
      SELECT 
        CASE 
          WHEN c."marketCap" < 10000000000 THEN 'microCap'
          WHEN c."marketCap" >= 10000000000 AND c."marketCap" < 200000000000 THEN 'smallCap'
          WHEN c."marketCap" >= 200000000000 AND c."marketCap" < 500000000000 THEN 'largeCap'
          WHEN c."marketCap" >= 500000000000 THEN 'megaCap'
        END as category,
        COUNT(*) as count
      FROM "Filing" f
      JOIN "Company" c ON f."companyId" = c.id
      WHERE f."analysisData" IS NOT NULL
        AND f."actual7dReturn" IS NOT NULL
        AND c."marketCap" IS NOT NULL
      GROUP BY category
    `;

    const countMap = marketCapCounts.reduce((acc, row) => {
      acc[row.category] = Number(row.count);
      return acc;
    }, {} as Record<string, number>);

    const microCap = countMap['microCap'] || 0;
    const smallCap = countMap['smallCap'] || 0;
    const largeCap = countMap['largeCap'] || 0;
    const megaCap = countMap['megaCap'] || 0;

    console.log(`  Micro Cap (<$10B):        ${microCap.toString().padStart(4)}`);
    console.log(`  Small-Mid Cap ($10-200B): ${smallCap.toString().padStart(4)}`);
    console.log(`  Large Cap ($200-500B):    ${largeCap.toString().padStart(4)}`);
    console.log(`  Mega Cap (>$500B):        ${megaCap.toString().padStart(4)}`);
  }

  console.log('\n' + '═'.repeat(80));

  if (readyForTraining < 50) {
    console.log('\n⚠️  WARNING: Less than 50 samples ready for training.');
    console.log('   Recommendation: Complete the 164-company analysis currently running.');
    console.log('   Then backfill stock prices to reach 50-100+ samples.\n');
  } else {
    console.log(`\n✅ You have ${readyForTraining} samples - sufficient for model development!`);
    console.log('   Ready to run champion-challenger analysis.\n');
  }

  await prisma.$disconnect();
}

main();