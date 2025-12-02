/**
 * Add Missing Mega-Cap Companies
 *
 * Adds the 7 missing mega-cap companies identified by the backfill script:
 * GOOG, INTC, CMCSA, TSM, ASML, SAP, NVO
 */

import { prisma } from '../lib/prisma';

interface CompanyInfo {
  ticker: string;
  name: string;
  cik: string;
}

const MISSING_MEGACAPS: CompanyInfo[] = [
  // Note: GOOG and GOOGL share CIK 0001652044, GOOGL already exists
  // We don't need GOOG separately since they file together
  {
    ticker: 'INTC',
    name: 'Intel Corporation',
    cik: '0000050863',
  },
  {
    ticker: 'CMCSA',
    name: 'Comcast Corporation',
    cik: '0001166691',
  },
  {
    ticker: 'TSM',
    name: 'Taiwan Semiconductor Manufacturing Company Limited',
    cik: '0001046179',
  },
  {
    ticker: 'ASML',
    name: 'ASML Holding N.V.',
    cik: '0000937966',
  },
  {
    ticker: 'SAP',
    name: 'SAP SE',
    cik: '0001000184',
  },
  {
    ticker: 'NVO',
    name: 'Novo Nordisk A/S',
    cik: '0000353278',
  },
];

async function main() {
  console.log('🏢 Adding Missing Mega-Cap Companies\n');
  console.log('═'.repeat(80));
  console.log('');

  let added = 0;
  let skipped = 0;

  for (const company of MISSING_MEGACAPS) {
    console.log(`Processing ${company.ticker} (${company.name})...`);

    // Check if already exists
    const existing = await prisma.company.findUnique({
      where: { ticker: company.ticker },
    });

    if (existing) {
      console.log(`  ⏭️  Already exists (ID: ${existing.id})`);
      skipped++;
      continue;
    }

    // Create company
    const created = await prisma.company.create({
      data: {
        ticker: company.ticker,
        name: company.name,
        cik: company.cik,
        sector: 'Technology', // Default, can be updated later
        industry: 'Unknown',
      },
    });

    console.log(`  ✅ Added (ID: ${created.id})`);
    added++;
  }

  console.log('');
  console.log('═'.repeat(80));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Companies added:    ${added}`);
  console.log(`Already existed:    ${skipped}`);
  console.log(`Total processed:    ${MISSING_MEGACAPS.length}`);
  console.log('');

  if (added > 0) {
    console.log('✅ Next step: Re-run backfill script to fetch filings for new companies');
    console.log('   npx tsx scripts/backfill-megacap-earnings.ts');
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
