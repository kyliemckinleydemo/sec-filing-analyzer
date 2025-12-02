import { prisma } from '../lib/prisma';

async function checkEFXFiling() {
  console.log('=== Checking EFX 10-Q from October 2024 ===\n');

  // Find the filing
  const filing = await prisma.filing.findFirst({
    where: {
      company: { ticker: 'EFX' },
      filingType: '10-Q',
      filingDate: {
        gte: new Date('2024-10-01'),
        lte: new Date('2024-11-30')
      }
    },
    include: {
      company: true
    }
  });

  if (!filing) {
    console.log('❌ No EFX 10-Q found in Oct/Nov 2024');

    // Check all EFX filings
    const allFilings = await prisma.filing.findMany({
      where: { company: { ticker: 'EFX' } },
      select: {
        accessionNumber: true,
        filingDate: true,
        filingType: true
      },
      orderBy: { filingDate: 'desc' },
      take: 10
    });

    console.log('\nRecent EFX filings:');
    allFilings.forEach(f => {
      console.log(`  ${f.filingType} - ${f.filingDate.toISOString().split('T')[0]} - ${f.accessionNumber}`);
    });
    return;
  }

  console.log('✅ Found Filing:');
  console.log(`  Accession: ${filing.accessionNumber}`);
  console.log(`  Filing Date: ${filing.filingDate.toISOString().split('T')[0]}`);
  console.log(`  Filing Type: ${filing.filingType}`);
  console.log(`\nAnalysis Data Available: ${filing.analysisData ? 'YES' : 'NO'}`);

  if (filing.analysisData) {
    try {
      const analysis = JSON.parse(filing.analysisData);
      console.log('\nAnalysis Data Structure:');
      console.log(`  - Risk Score: ${analysis.risk?.riskScore || analysis.risks?.riskScore}`);
      console.log(`  - Sentiment: ${analysis.sentiment?.sentimentScore}`);
      console.log(`  - Analyst Data: ${analysis.analyst ? 'YES' : 'NO'}`);

      if (analysis.analyst) {
        console.log('\n📊 Analyst Activity Data:');
        console.log(`  Consensus Score: ${analysis.analyst.consensusScore}`);
        console.log(`  Upside Potential: ${analysis.analyst.upsidePotential}%`);
        console.log(`  Number of Analysts: ${analysis.analyst.numberOfAnalysts}`);
        console.log(`  Target Price: $${analysis.analyst.targetPrice}`);

        if (analysis.analyst.activity) {
          console.log('\n  Activity (30 days before filing):');
          console.log(`    - Upgrades: ${analysis.analyst.activity.upgradesLast30d}`);
          console.log(`    - Downgrades: ${analysis.analyst.activity.downgradesLast30d}`);
          console.log(`    - Net Upgrades: ${analysis.analyst.activity.netUpgrades}`);
          console.log(`    - Major Upgrades: ${analysis.analyst.activity.majorUpgrades}`);
          console.log(`    - Major Downgrades: ${analysis.analyst.activity.majorDowngrades}`);
        } else {
          console.log('\n  ❌ NO activity data found!');
        }
      } else {
        console.log('\n  ❌ NO analyst data found in analysisData!');
      }
    } catch (e: any) {
      console.error('Error parsing analysisData:', e.message);
    }
  } else {
    console.log('\n❌ No analysisData - filing needs to be analyzed!');
  }

  console.log(`\nPrediction Data in Database:`);
  console.log(`  - predicted7dReturn: ${filing.predicted7dReturn}`);
  console.log(`  - predictionConfidence: ${filing.predictionConfidence}`);

  console.log(`\n📈 Company-Level Data:`);
  console.log(`  - Current Price: $${filing.company.currentPrice || 'N/A'}`);
  console.log(`  - Analyst Target: $${filing.company.analystTargetPrice || 'N/A'}`);
  console.log(`  - Yahoo Last Updated: ${filing.company.yahooLastUpdated?.toISOString().split('T')[0] || 'Never'}`);
}

checkEFXFiling()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
