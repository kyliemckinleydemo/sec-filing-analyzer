import { prisma } from '../lib/prisma';

/**
 * Re-analyze a filing by clearing cached analysis
 * Usage: npx tsx scripts/reanalyze-filing.ts <accession-number>
 */

async function reanalyzeFiling(accessionNumber: string) {
  console.log(`=== Re-analyzing filing ${accessionNumber} ===\n`);

  // Find the filing
  const filing = await prisma.filing.findUnique({
    where: { accessionNumber },
    select: {
      id: true,
      accessionNumber: true,
      filingType: true,
      company: {
        select: {
          ticker: true,
          name: true
        }
      },
      analysisData: true
    }
  });

  if (!filing) {
    console.error('❌ Filing not found');
    return;
  }

  console.log(`Found: ${filing.company.ticker} ${filing.filingType}`);
  console.log(`Company: ${filing.company.name}\n`);

  if (!filing.analysisData) {
    console.log('⚠️  No existing analysis to clear');
  } else {
    console.log('Clearing existing analysis data...');
  }

  // Clear analysis fields to force re-analysis
  await prisma.filing.update({
    where: { accessionNumber },
    data: {
      analysisData: null,
      sentimentScore: null,
      riskScore: null,
      concernLevel: null,
      predicted7dReturn: null,
      predictionConfidence: null
    }
  });

  console.log('✅ Cleared cached analysis\n');
  console.log('Next access will trigger fresh analysis with updated prompts.');
  console.log(`\nAccess: https://sec-filing-analyzer.vercel.app/filing/${accessionNumber}`);
}

const accession = process.argv[2];
if (!accession) {
  console.error('Usage: npx tsx scripts/reanalyze-filing.ts <accession-number>');
  process.exit(1);
}

reanalyzeFiling(accession)
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
