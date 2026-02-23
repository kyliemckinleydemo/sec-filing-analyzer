import { prisma } from '../lib/prisma';
import yahooFinance from '../lib/yahoo-finance-singleton';

async function testBackfill() {
  console.log('Testing sector backfill with 5 companies...\n');

  // Get 5 companies without sector data
  const companies = await prisma.company.findMany({
    where: {
      sector: null,
      ticker: { in: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'] }
    },
    select: {
      id: true,
      ticker: true,
      name: true,
    }
  });

  console.log(`Found ${companies.length} test companies\n`);

  for (const company of companies) {
    try {
      console.log(`Fetching ${company.ticker}...`);

      const summary = await yahooFinance.quoteSummary(company.ticker, {
        modules: ['assetProfile']
      });

      if (summary.assetProfile?.sector) {
        console.log(`  ✓ ${company.ticker}: ${summary.assetProfile.sector}`);
      } else {
        console.log(`  ⚠ ${company.ticker}: No sector found`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      console.error(`  ✗ ${company.ticker}: ${error.message}`);
    }
  }

  console.log('\nTest complete!');
  await prisma.$disconnect();
}

testBackfill().catch(console.error);
