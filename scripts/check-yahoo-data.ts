import { prisma } from '../lib/prisma';

async function checkYahooData() {
  const companies = await prisma.company.findMany({
    select: {
      ticker: true,
      name: true,
      currentPrice: true,
      analystTargetPrice: true,
      yahooFinanceData: true,
      yahooLastUpdated: true
    },
    take: 5
  });

  console.log('Sample companies and their Yahoo Finance data:\n');
  companies.forEach(c => {
    console.log(`${c.ticker} (${c.name}):`);
    console.log(`  currentPrice: ${c.currentPrice}`);
    console.log(`  analystTargetPrice: ${c.analystTargetPrice}`);
    console.log(`  yahooLastUpdated: ${c.yahooLastUpdated}`);
    if (c.yahooFinanceData) {
      const data = typeof c.yahooFinanceData === 'string' ? JSON.parse(c.yahooFinanceData) : c.yahooFinanceData;
      console.log(`  yahooFinanceData keys: ${Object.keys(data).join(', ')}`);
      if (data.targetMeanPrice) console.log(`    targetMeanPrice in JSON: ${data.targetMeanPrice}`);
    } else {
      console.log('  yahooFinanceData: null');
    }
    console.log('');
  });

  // Check total counts
  const totalCompanies = await prisma.company.count();
  const withCurrentPrice = await prisma.company.count({
    where: { currentPrice: { not: null } }
  });
  const withAnalystTarget = await prisma.company.count({
    where: { analystTargetPrice: { not: null } }
  });
  const withYahooData = await prisma.company.count({
    where: { yahooFinanceData: { not: null } }
  });

  console.log('=== Database Statistics ===');
  console.log(`Total companies: ${totalCompanies}`);
  console.log(`With currentPrice: ${withCurrentPrice}`);
  console.log(`With analystTargetPrice: ${withAnalystTarget}`);
  console.log(`With yahooFinanceData: ${withYahooData}`);
}

checkYahooData()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
