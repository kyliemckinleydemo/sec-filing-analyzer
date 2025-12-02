import { prisma } from '../lib/prisma';

async function checkStats() {
  const totalCompanies = await prisma.company.count();
  const companiesWithFilings = await prisma.company.count({
    where: {
      filings: {
        some: {}
      }
    }
  });
  const totalFilings = await prisma.filing.count();

  console.log('=== Current Database Stats ===');
  console.log(`Total Companies: ${totalCompanies}`);
  console.log(`Companies with Filings: ${companiesWithFilings}`);
  console.log(`Total Filings: ${totalFilings}`);

  // Check EFX specifically
  const efx = await prisma.company.findUnique({
    where: { ticker: 'EFX' },
    include: {
      filings: {
        take: 5,
        orderBy: { filingDate: 'desc' }
      }
    }
  });

  console.log('\n=== EFX Company Data ===');
  if (efx) {
    console.log(`Ticker: ${efx.ticker}`);
    console.log(`Name: ${efx.name}`);
    console.log(`CIK: ${efx.cik}`);
    console.log(`Filings Count: ${efx.filings.length} (showing latest 5)`);
  } else {
    console.log('EFX not found in database!');
  }
}

checkStats()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
