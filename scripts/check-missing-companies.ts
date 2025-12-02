import { prisma } from '../lib/prisma';

async function main() {
  const tickers = ['GOOG', 'GOOGL', 'INTC', 'CMCSA', 'TSM', 'ASML', 'SAP', 'NVO'];

  for (const ticker of tickers) {
    const company = await prisma.company.findUnique({
      where: { ticker },
    });

    if (company) {
      console.log(`✅ ${ticker}: ${company.name} (CIK: ${company.cik})`);
    } else {
      console.log(`❌ ${ticker}: NOT FOUND`);
    }
  }

  await prisma.$disconnect();
}

main();
