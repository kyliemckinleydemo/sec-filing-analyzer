/**
 * Add GOOG ticker
 *
 * GOOG and GOOGL are both Alphabet Inc. and share the same CIK.
 * We already have GOOGL, but users search for GOOG too.
 * We'll add GOOG as a separate Company record pointing to same CIK.
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
  // Note: We need to handle the unique constraint on CIK
  // Since Prisma doesn't allow duplicate CIKs, we'll need to adjust the schema
  // For now, let's just document that GOOG and GOOGL share filings

  console.log('\n⚠️  Note: GOOG and GOOGL share the same CIK (0001652044)');
  console.log('Both tickers refer to Alphabet Inc. Class A and Class C shares.');
  console.log('SEC filings are filed under one CIK, so they share the same filings.');
  console.log('\nRecommendation: Update your application logic to:');
  console.log('  1. Accept both GOOG and GOOGL as valid tickers');
  console.log('  2. Map both to the GOOGL company record');
  console.log('  3. Or create a ticker_aliases table to handle this mapping');

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
