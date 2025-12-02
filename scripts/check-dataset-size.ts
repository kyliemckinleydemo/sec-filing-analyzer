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

    // Market cap distribution
    console.log('\n📊 Market Cap Distribution:');
    console.log('─'.repeat(80));

    const microCap = await prisma.filing.count({
      where: {
        analysisData: { not: null },
        actual7dReturn: { not: null },
        company: { marketCap: { lt: 10_000_000_000 } },
      },
    });

    const smallCap = await prisma.filing.count({
      where: {
        analysisData: { not: null },
        actual7dReturn: { not: null },
        company: { marketCap: { gte: 10_000_000_000, lt: 200_000_000_000 } },
      },
    });

    const largeCap = await prisma.filing.count({
      where: {
        analysisData: { not: null },
        actual7dReturn: { not: null },
        company: { marketCap: { gte: 200_000_000_000, lt: 500_000_000_000 } },
      },
    });

    const megaCap = await prisma.filing.count({
      where: {
        analysisData: { not: null },
        actual7dReturn: { not: null },
        company: { marketCap: { gte: 500_000_000_000 } },
      },
    });

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
