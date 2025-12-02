/**
 * Debug why momentum indicators aren't showing up in export
 */

import { prisma } from '../lib/prisma';

async function main() {
  console.log('🔍 Debugging momentum indicator export\n');

  // Get first 5 filings that should have momentum
  const filings = await prisma.filing.findMany({
    where: {
      filingType: { in: ['10-K', '10-Q'] },
      actual7dReturn: { not: null },
      riskScore: { not: null },
      sentimentScore: { not: null }
    },
    include: { company: true },
    orderBy: { filingDate: 'asc' },
    take: 5
  });

  for (const filing of filings) {
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`Filing: ${filing.company.ticker} (${filing.filingType})`);
    console.log(`Date: ${filing.filingDate.toISOString().split('T')[0]}`);

    // Try to find technical indicators
    const tech = await prisma.technicalIndicators.findFirst({
      where: {
        ticker: filing.company.ticker,
        date: { lte: filing.filingDate }
      },
      orderBy: { date: 'desc' }
    });

    if (tech) {
      const daysDiff = Math.floor((filing.filingDate.getTime() - tech.date.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`✅ Found tech indicators from ${daysDiff} days before`);
      console.log(`   Date: ${tech.date.toISOString().split('T')[0]}`);
      console.log(`   MA30: ${tech.ma30}`);
      console.log(`   MA50: ${tech.ma50}`);
      console.log(`   RSI14: ${tech.rsi14}`);
      console.log(`   MACD: ${tech.macd}`);
    } else {
      console.log(`❌ No tech indicators found`);

      // Check if ANY exist for this ticker
      const count = await prisma.technicalIndicators.count({
        where: { ticker: filing.company.ticker }
      });
      console.log(`   Total tech indicators for ${filing.company.ticker}: ${count}`);

      if (count > 0) {
        // Show date range
        const earliest = await prisma.technicalIndicators.findFirst({
          where: { ticker: filing.company.ticker },
          orderBy: { date: 'asc' }
        });
        const latest = await prisma.technicalIndicators.findFirst({
          where: { ticker: filing.company.ticker },
          orderBy: { date: 'desc' }
        });
        console.log(`   Date range: ${earliest?.date.toISOString().split('T')[0]} to ${latest?.date.toISOString().split('T')[0]}`);
        console.log(`   Filing date: ${filing.filingDate.toISOString().split('T')[0]}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
