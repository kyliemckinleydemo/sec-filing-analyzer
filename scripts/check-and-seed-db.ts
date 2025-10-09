import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking database state...');

  const companyCount = await prisma.company.count();
  const filingCount = await prisma.filing.count();

  console.log(`Companies: ${companyCount}`);
  console.log(`Filings: ${filingCount}`);

  if (companyCount === 0) {
    console.log('\n📊 Database is empty. Seeding with priority companies...\n');

    const priorityCompanies = [
      { ticker: 'AAPL', cik: '0000320193', name: 'Apple Inc.' },
      { ticker: 'MSFT', cik: '0000789019', name: 'Microsoft Corp' },
      { ticker: 'GOOGL', cik: '0001652044', name: 'Alphabet Inc.' },
      { ticker: 'AMZN', cik: '0001018724', name: 'Amazon.com Inc' },
      { ticker: 'META', cik: '0001326801', name: 'Meta Platforms Inc' },
      { ticker: 'TSLA', cik: '0001318605', name: 'Tesla Inc' },
      { ticker: 'NVDA', cik: '0001045810', name: 'NVIDIA Corp' },
      { ticker: 'AVGO', cik: '0001730168', name: 'Broadcom Inc.' },
    ];

    for (const company of priorityCompanies) {
      try {
        await prisma.company.create({
          data: company,
        });
        console.log(`✅ Added ${company.ticker} - ${company.name}`);
      } catch (error: any) {
        console.log(`⚠️  ${company.ticker} already exists or error: ${error.message}`);
      }
    }

    console.log('\n✅ Seeding complete!');
  } else {
    console.log('\n✅ Database already has data.');
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
