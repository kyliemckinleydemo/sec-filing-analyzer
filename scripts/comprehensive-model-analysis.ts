/**
 * Comprehensive Model Analysis - Data Export
 * 
 * Extracts training data and exports to CSV for Python ML analysis
 */

import { prisma } from '../lib/prisma';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

async function main() {
  console.log('🚀 Comprehensive Model Analysis - Data Export\n');
  
  // Get filings with complete data
  const filings = await prisma.filing.findMany({
    where: {
      AND: [
        { filingType: { in: ['10-K', '10-Q'] } },
        { actual7dReturn: { not: null } },
        { riskScore: { not: null } },
        { sentimentScore: { not: null } },
      ],
    },
    include: {
      company: true,
      snapshot: true,
    },
    orderBy: {
      filingDate: 'asc',
    },
  });

  console.log('Found ' + filings.length + ' filings with complete data\n');

  if (filings.length === 0) {
    console.log('No data available. Run backfill scripts first.');
    await prisma.$disconnect();
    return;
  }

  // Create directories
  if (!existsSync('./data')) mkdirSync('./data');
  if (!existsSync('./analysis')) mkdirSync('./analysis');
  
  // Build CSV
  const rows: string[] = [];
  rows.push('filingId,ticker,filingType,filingDate,actual7dReturn,currentPrice,marketCap,peRatio,forwardPE,epsActual,epsEstimateCurrentY,epsEstimateNextY,dividendYield,riskScore,sentimentScore');
  
  for (const filing of filings) {
    const s = filing.snapshot;
    const row = [
      filing.id,
      filing.company.ticker,
      filing.filingType,
      filing.filingDate.toISOString(),
      filing.actual7dReturn,
      s?.currentPrice ?? '',
      s?.marketCap ?? '',
      s?.peRatio ?? '',
      s?.forwardPE ?? '',
      s?.epsActual ?? '',
      s?.epsEstimateCurrentY ?? '',
      s?.epsEstimateNextY ?? '',
      s?.dividendYield ?? '',
      filing.riskScore,
      filing.sentimentScore,
    ].join(',');
    rows.push(row);
  }
  
  const csv = rows.join('\n');
  writeFileSync('./data/training_data.csv', csv);
  
  console.log('✅ Exported to data/training_data.csv');
  console.log('\nSummary:');
  console.log('  Total samples: ' + filings.length);
  console.log('  10-K filings: ' + filings.filter(f => f.filingType === '10-K').length);
  console.log('  10-Q filings: ' + filings.filter(f => f.filingType === '10-Q').length);
  console.log('  Unique tickers: ' + new Set(filings.map(f => f.company.ticker)).size);
  console.log('\nNext: Run filtered-champion-challenger.ts or Python analysis');
  
  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
