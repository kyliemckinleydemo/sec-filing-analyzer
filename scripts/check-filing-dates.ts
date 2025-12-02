/**
 * Check filing date range in database
 */

import { prisma } from '../lib/prisma';

async function checkFilingDates() {
  const result = await prisma.filing.aggregate({
    where: {
      actual7dReturn: { not: null }
    },
    _min: { filingDate: true },
    _max: { filingDate: true }
  });

  console.log('Filing date range:');
  console.log(`  Earliest: ${result._min.filingDate?.toISOString().split('T')[0]}`);
  console.log(`  Latest: ${result._max.filingDate?.toISOString().split('T')[0]}`);

  // Check distribution by year
  const filings = await prisma.filing.findMany({
    where: { actual7dReturn: { not: null } },
    select: { filingDate: true }
  });

  const byYear: { [key: string]: number } = {};
  filings.forEach(f => {
    const year = f.filingDate.getFullYear();
    byYear[year] = (byYear[year] || 0) + 1;
  });

  console.log('\nFilings by year:');
  Object.entries(byYear).sort().forEach(([year, count]) => {
    console.log(`  ${year}: ${count}`);
  });

  await prisma.$disconnect();
}

checkFilingDates().catch(console.error);
