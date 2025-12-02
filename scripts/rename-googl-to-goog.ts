/**
 * Rename GOOGL to GOOG
 *
 * Since the user prefers GOOG (more popular), we'll:
 * 1. Delete the new GOOG record we just created
 * 2. Update GOOGL ticker to GOOG
 */

import { prisma } from '../lib/prisma';

async function main() {
  console.log('Renaming GOOGL to GOOG...\n');

  // Get both records
  const googl = await prisma.company.findUnique({
    where: { ticker: 'GOOGL' },
  });

  const goog = await prisma.company.findUnique({
    where: { ticker: 'GOOG' },
  });

  if (!googl) {
    console.log('❌ GOOGL not found');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found GOOGL: ${googl.name} (ID: ${googl.id})`);

  if (goog) {
    console.log(`Found GOOG: ${goog.name} (ID: ${goog.id})`);

    // Check if GOOG has any filings
    const googFilings = await prisma.filing.count({
      where: { companyId: goog.id },
    });

    console.log(`  GOOG has ${googFilings} filings`);

    // Delete the new GOOG record (we just created it, so it should have no filings)
    if (googFilings === 0) {
      await prisma.company.delete({
        where: { id: goog.id },
      });
      console.log('✅ Deleted empty GOOG record');
    } else {
      console.log('⚠️  GOOG has filings - keeping both tickers');
      await prisma.$disconnect();
      return;
    }
  }

  // Check GOOGL filings count
  const googlFilings = await prisma.filing.count({
    where: { companyId: googl.id },
  });

  console.log(`\nGOOGL has ${googlFilings} filings`);

  // Update GOOGL to GOOG
  await prisma.company.update({
    where: { id: googl.id },
    data: {
      ticker: 'GOOG',
      name: 'Alphabet Inc.',
    },
  });

  console.log('✅ Renamed GOOGL to GOOG');
  console.log(`\nGOOG now has ${googlFilings} filings and CIK ${googl.cik}`);

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
