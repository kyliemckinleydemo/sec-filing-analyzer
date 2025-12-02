import { prisma } from '../lib/prisma';

async function main() {
  const filings = await prisma.filing.findMany({
    where: {
      predicted7dReturn: { not: null },
      predictionConfidence: { not: null }
    },
    include: { company: true },
    orderBy: { filingDate: 'desc' }
  });

  console.log(`\nFound ${filings.length} filings with ML predictions:\n`);

  filings.forEach(f => {
    const meetsCriteria = (f.predictionConfidence! >= 0.60) && (Math.abs(f.predicted7dReturn!) >= 2.0);
    console.log(`${f.company?.ticker || 'N/A'}: ${f.predicted7dReturn?.toFixed(2)}% (confidence: ${(f.predictionConfidence! * 100).toFixed(0)}%) ${meetsCriteria ? '✅ TRADEABLE' : '❌'}`);
  });

  console.log(`\nTo generate ML predictions for all filings, you need to run the ML analysis on each filing.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
