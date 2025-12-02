import { prisma } from '../lib/prisma';

async function checkCompany() {
  const company = await prisma.company.findUnique({
    where: { ticker: 'EFX' },
    select: {
      id: true,
      ticker: true,
      name: true,
      cik: true,
      _count: {
        select: {
          filings: true
        }
      }
    }
  });

  if (company) {
    console.log('✅ EFX is in the database:');
    console.log(`   Company: ${company.name}`);
    console.log(`   Ticker: ${company.ticker}`);
    console.log(`   CIK: ${company.cik}`);
    console.log(`   Filings: ${company._count.filings}`);

    // Get some recent filings
    const recentFilings = await prisma.filing.findMany({
      where: { companyId: company.id },
      orderBy: { filingDate: 'desc' },
      take: 5,
      select: {
        filingType: true,
        filingDate: true,
        accessionNumber: true
      }
    });

    if (recentFilings.length > 0) {
      console.log('\n   Recent filings:');
      recentFilings.forEach(f => {
        const dateStr = f.filingDate.toISOString().split('T')[0];
        console.log(`   - ${f.filingType} on ${dateStr} (${f.accessionNumber})`);
      });
    }
  } else {
    console.log('❌ EFX is NOT in the database');

    // Check if it's in the top 1000 tickers
    const { TOP_1000_TICKERS } = await import('../lib/top1000-tickers');
    const isInTop1000 = TOP_1000_TICKERS.includes('EFX');
    console.log(`   Is EFX in TOP_1000_TICKERS list? ${isInTop1000 ? 'Yes' : 'No'}`);
  }
}

checkCompany()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
