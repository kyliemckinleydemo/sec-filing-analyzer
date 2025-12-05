import { prisma } from '../lib/prisma';

/**
 * Check Production Filings
 * See what filings are actually in the production database
 */

async function checkFilings() {
  console.log('=== Checking Production Database ===\n');

  // Count total filings
  const totalFilings = await prisma.filing.count();
  console.log(`Total filings: ${totalFilings}`);

  // Get recent filings
  const recentFilings = await prisma.filing.findMany({
    take: 10,
    orderBy: { filingDate: 'desc' },
    select: {
      accessionNumber: true,
      filingType: true,
      filingDate: true,
      concernLevel: true,
      sentimentScore: true,
      predicted7dReturn: true,
      company: {
        select: {
          ticker: true
        }
      }
    }
  });

  console.log('\nRecent filings:');
  for (const filing of recentFilings) {
    console.log(`- ${filing.company.ticker} ${filing.filingType} (${filing.filingDate.toISOString().slice(0, 10)}) - Concern: ${filing.concernLevel}, Sentiment: ${filing.sentimentScore}`);
  }

  // Check for EFX specifically
  console.log('\nSearching for EFX filings...');
  const efxFilings = await prisma.filing.findMany({
    where: {
      company: {
        ticker: 'EFX'
      }
    },
    select: {
      accessionNumber: true,
      filingType: true,
      filingDate: true,
      concernLevel: true,
      sentimentScore: true
    }
  });

  console.log(`Found ${efxFilings.length} EFX filings:`);
  for (const filing of efxFilings) {
    console.log(`- ${filing.accessionNumber} ${filing.filingType} (${filing.filingDate.toISOString().slice(0, 10)}) - Concern: ${filing.concernLevel}`);
  }
}

checkFilings()
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });
