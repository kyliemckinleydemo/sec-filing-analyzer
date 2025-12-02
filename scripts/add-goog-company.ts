/**
 * Add GOOG ticker as a Company
 *
 * Now that we've removed the unique constraint on CIK,
 * we can add GOOG with the same CIK as GOOGL.
 */

import { prisma } from '../lib/prisma';

async function main() {
  console.log('Adding GOOG ticker...\n');

  // Check if GOOG already exists
  const existing = await prisma.company.findUnique({
    where: { ticker: 'GOOG' },
  });

  if (existing) {
    console.log('✅ GOOG already exists');
    await prisma.$disconnect();
    return;
  }

  // Get GOOGL to find the CIK
  const googl = await prisma.company.findUnique({
    where: { ticker: 'GOOGL' },
  });

  if (!googl) {
    console.log('❌ GOOGL not found - cannot add GOOG');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found GOOGL: ${googl.name} (CIK: ${googl.cik})`);

  // Add GOOG with same CIK
  const goog = await prisma.company.create({
    data: {
      ticker: 'GOOG',
      name: 'Alphabet Inc. (Class C)',
      cik: googl.cik, // Same CIK as GOOGL
      sector: googl.sector,
      industry: googl.industry,
    },
  });

  console.log(`✅ Added GOOG (ID: ${goog.id})`);
  console.log('\nNote: GOOG and GOOGL share filings via CIK ${googl.cik}');

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
