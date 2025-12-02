import { prisma } from '../lib/prisma';

async function checkEFXLatest10Q() {
  console.log('=== Checking Latest EFX 10-Q (October 2025) ===\n');

  // Get the October 2025 10-Q
  const filing = await prisma.filing.findFirst({
    where: {
      accessionNumber: '0000033185-25-000064'
    },
    include: {
      company: true
    }
  });

  if (!filing) {
    console.log('❌ Filing not found');
    return;
  }

  console.log('✅ Found Filing:');
  console.log(`  Accession: ${filing.accessionNumber}`);
  console.log(`  Filing Date: ${filing.filingDate.toISOString().split('T')[0]}`);
  console.log(`  Filing Type: ${filing.filingType}`);
  console.log(`  Ticker: ${filing.company.ticker}`);
  console.log(`  Company: ${filing.company.name}`);
  console.log(`\nAnalysis Data Available: ${filing.analysisData ? 'YES' : 'NO'}`);

  if (filing.analysisData) {
    try {
      const analysis = JSON.parse(filing.analysisData);
      console.log('\n✅ Analysis Data Found:');
      console.log(`  - Risk Score: ${analysis.risk?.riskScore || analysis.risks?.riskScore}`);
      console.log(`  - Sentiment: ${analysis.sentiment?.sentimentScore}`);
      console.log(`  - Concern Level: ${analysis.concernAssessment?.concernLevel}`);
      console.log(`  - Analyst Data: ${analysis.analyst ? 'YES' : 'NO'}`);

      if (analysis.analyst) {
        console.log('\n📊 Analyst Data Found:');
        console.log(`  Consensus Score: ${analysis.analyst.consensusScore}`);
        console.log(`  Upside Potential: ${analysis.analyst.upsidePotential}%`);
        console.log(`  Number of Analysts: ${analysis.analyst.numberOfAnalysts}`);
        console.log(`  Target Price: $${analysis.analyst.targetPrice}`);

        if (analysis.analyst.activity) {
          console.log('\n  ✅ Activity Data (30 days before filing):');
          console.log(`    - Upgrades: ${analysis.analyst.activity.upgradesLast30d}`);
          console.log(`    - Downgrades: ${analysis.analyst.activity.downgradesLast30d}`);
          console.log(`    - Net Upgrades: ${analysis.analyst.activity.netUpgrades}`);
          console.log(`    - Major Upgrades: ${analysis.analyst.activity.majorUpgrades}`);
          console.log(`    - Major Downgrades: ${analysis.analyst.activity.majorDowngrades}`);

          if (analysis.analyst.activity.netUpgrades === 0 &&
              analysis.analyst.activity.upgradesLast30d === 0 &&
              analysis.analyst.activity.downgradesLast30d === 0) {
            console.log('\n  ⚠️  All activity values are 0 - no analyst activity in 30 days before filing');
          }
        } else {
          console.log('\n  ❌ NO activity data in analyst object!');
        }
      } else {
        console.log('\n  ❌ NO analyst data in analysisData!');
        console.log('\n  This filing needs analyst data backfilled!');
        console.log('  Run: npx tsx scripts/backfill-analyst-data-for-filing.ts 0000033185-25-000064');
      }
    } catch (e: any) {
      console.error('Error parsing analysisData:', e.message);
    }
  } else {
    console.log('\n❌ No analysisData - filing was never analyzed!');
  }

  console.log(`\nPrediction Data in Database:`);
  console.log(`  - predicted7dReturn: ${filing.predicted7dReturn ?? 'NULL'}`);
  console.log(`  - predictionConfidence: ${filing.predictionConfidence ?? 'NULL'}`);

  if (!filing.predicted7dReturn) {
    console.log('\n  ❌ No ML prediction stored - this is why legacy model was shown!');
    console.log('  Reasons:');
    console.log('    1. ML prediction may have failed during analysis');
    console.log('    2. Analyst activity data was missing or all zeros');
    console.log('    3. Python ML script may have errored');
  }

  console.log(`\n📈 Company-Level Data:`);
  console.log(`  - Current Price: $${filing.company.currentPrice || 'N/A'}`);
  console.log(`  - Analyst Target: $${filing.company.analystTargetPrice || 'N/A'}`);
  console.log(`  - Market Cap: $${filing.company.marketCap ? (filing.company.marketCap / 1e9).toFixed(2) + 'B' : 'N/A'}`);
  console.log(`  - Yahoo Last Updated: ${filing.company.yahooLastUpdated?.toISOString().split('T')[0] || 'Never'}`);
}

checkEFXLatest10Q()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
