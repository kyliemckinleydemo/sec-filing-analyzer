import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Checking AAPL filings ===\n');

  const filings = await prisma.filing.findMany({
    where: {
      company: {
        ticker: 'AAPL'
      }
    },
    include: {
      company: {
        select: {
          ticker: true,
          name: true
        }
      }
    },
    orderBy: {
      filingDate: 'desc'
    },
    take: 5
  });

  console.log(`Found ${filings.length} AAPL filings:\n`);

  filings.forEach((f, i) => {
    console.log(`${i + 1}. ${f.filingType}`);
    console.log(`   Accession: ${f.accessionNumber}`);
    console.log(`   Filing Date: ${f.filingDate}`);
    console.log(`   Filing Date (ISO): ${f.filingDate.toISOString()}`);
    console.log(`   Report Date: ${f.reportDate}`);
    console.log(`   Report Date (ISO): ${f.reportDate?.toISOString() || 'null'}`);
    console.log(`   URL: ${f.filingUrl}`);
    console.log();
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
