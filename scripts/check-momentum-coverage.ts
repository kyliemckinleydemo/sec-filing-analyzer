/**
 * Check momentum indicator coverage for our filings
 */

import { prisma } from '../lib/prisma';

async function main() {
  console.log('📊 Checking momentum indicator coverage\n');

  // Count total technical indicators
  const totalTech = await prisma.technicalIndicators.count();
  console.log(`Total technical indicators in DB: ${totalTech}`);

  // Count filings with returns
  const filingsWithReturns = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null }
    },
    include: { company: true }
  });

  console.log(`\nFilings with returns: ${filingsWithReturns.length}`);

  // Check how many have technical indicators
  let withTech = 0;
  let sampleMismatches: string[] = [];

  for (const filing of filingsWithReturns.slice(0, 10)) {
    const tech = await prisma.technicalIndicators.findFirst({
      where: {
        ticker: filing.company.ticker,
        date: { lte: filing.filingDate }
      },
      orderBy: { date: 'desc' }
    });

    if (tech) {
      withTech++;
      const daysDiff = Math.floor((filing.filingDate.getTime() - tech.date.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`✅ ${filing.company.ticker}: Tech from ${daysDiff} days before filing`);
    } else {
      sampleMismatches.push(filing.company.ticker);
      console.log(`❌ ${filing.company.ticker}: No tech indicators found`);
    }
  }

  console.log(`\n📈 Sample coverage: ${withTech}/10`);

  if (sampleMismatches.length > 0) {
    console.log(`\n⚠️  Tickers without tech indicators: ${sampleMismatches.join(', ')}`);

    // Check if these tickers have ANY technical indicators
    for (const ticker of sampleMismatches) {
      const count = await prisma.technicalIndicators.count({
        where: { ticker }
      });
      console.log(`   ${ticker}: ${count} tech indicators in DB`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
