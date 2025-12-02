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
      company: true,
      prediction: true,
      mlPrediction: true
    }
  });

  if (!filing) {
    console.log('❌ No EFX 10-Q found in Oct/Nov 2024');
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
      console.log(`  - Risk Score: ${analysis.risk?.riskScore}`);
      console.log(`  - Sentiment: ${analysis.sentiment?.sentimentScore}`);
      console.log(`  - Analyst Data: ${analysis.analyst ? 'YES' : 'NO'}`);

      if (analysis.analyst) {
        console.log('\n📊 Analyst Activity Data:');
        console.log(`  - Activity: ${JSON.stringify(analysis.analyst.activity, null, 2)}`);
        console.log(`  - Consensus: ${analysis.analyst.consensusScore}`);
        console.log(`  - Upside Potential: ${analysis.analyst.upsidePotential}%`);
      }
    } catch (e) {
      console.error('Error parsing analysisData:', e);
    }
  }

  console.log(`\nLegacy Prediction Available: ${filing.prediction ? 'YES' : 'NO'}`);
  if (filing.prediction) {
    console.log(`  - Predicted Return: ${filing.prediction.predicted7dReturn.toFixed(2)}%`);
    console.log(`  - Confidence: ${(filing.prediction.confidence * 100).toFixed(0)}%`);
  }

  console.log(`\nML Prediction Available: ${filing.mlPrediction ? 'YES' : 'NO'}`);
  if (filing.mlPrediction) {
    console.log(`  - Predicted Return: ${filing.mlPrediction.predicted7dReturn.toFixed(2)}%`);
    console.log(`  - Confidence: ${(filing.mlPrediction.predictionConfidence * 100).toFixed(0)}%`);
  } else {
    console.log('  ❌ No ML prediction - this is why legacy model was shown!');
  }

  // Check if company has analyst data
  console.log('\n📈 Company-Level Data:');
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
