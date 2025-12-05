import { prisma } from '../lib/prisma';

async function checkRecentFilings() {
  // Get most recent filings
  const recentFilings = await prisma.filing.findMany({
    orderBy: { filingDate: 'desc' },
    take: 10,
    select: {
      filingType: true,
      filingDate: true,
      createdAt: true,
      company: {
        select: {
          ticker: true,
          name: true
        }
      }
    }
  });

  console.log('Most recent filings in database:');
  console.log('='.repeat(80));
  for (const filing of recentFilings) {
    const filingDate = new Date(filing.filingDate);
    const createdAt = new Date(filing.createdAt);
    const daysAgo = Math.floor((Date.now() - filingDate.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`${filing.company.ticker} (${filing.company.name})`);
    console.log(`  Type: ${filing.filingType}`);
    console.log(`  Filing Date: ${filingDate.toLocaleDateString()} (${daysAgo} days ago)`);
    console.log(`  Added to DB: ${createdAt.toLocaleString()}`);
    console.log('');
  }

  // Check today's date
  console.log(`Today's date: ${new Date().toLocaleDateString()}`);
  console.log(`Current time: ${new Date().toLocaleString()}`);
}

checkRecentFilings()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
