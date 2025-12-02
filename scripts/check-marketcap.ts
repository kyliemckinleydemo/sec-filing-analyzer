import { prisma } from '../lib/prisma';

async function main() {
  const companies = await prisma.company.findMany({
    where: {
      ticker: { in: ['AAPL', 'MSFT', 'TSLA', 'NVDA'] },
    },
    select: {
      ticker: true,
      name: true,
      marketCap: true,
    },
  });

  console.log('Market Cap Values in Database:');
  companies.forEach(c => {
    console.log(`${c.ticker}: ${c.marketCap}`);
    if (c.marketCap) {
      console.log(`  As millions: $${(c.marketCap / 1_000_000).toFixed(2)}M`);
      console.log(`  As billions: $${(c.marketCap / 1_000_000_000).toFixed(2)}B`);
      console.log(`  As trillions: $${(c.marketCap / 1_000_000_000_000).toFixed(2)}T`);
    }
  });

  await prisma.$disconnect();
}

main();
