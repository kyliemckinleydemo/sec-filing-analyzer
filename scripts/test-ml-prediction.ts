import { prisma } from '../lib/prisma';
import { generateMLPrediction } from '../lib/ml-prediction';

async function main() {
  console.log('🧪 Testing ML Prediction Integration\n');

  // Find a recent filing with company data
  const allFilings = await prisma.filing.findMany({
    where: {
      filingType: { in: ['10-K', '10-Q'] }
    },
    include: {
      company: true
    },
    orderBy: { filingDate: 'desc' },
    take: 50
  });

  const filing = allFilings.find(f => f.company !== null);

  if (!filing || !filing.company) {
    console.error('❌ No suitable filing found for testing');
    return;
  }

  console.log(`📄 Testing with filing:`);
  console.log(`   Company: ${filing.company.name} (${filing.company.ticker})`);
  console.log(`   Filing: ${filing.filingType} - ${filing.filingDate.toDateString()}`);
  console.log(`   Accession: ${filing.accessionNumber}\n`);

  try {
    console.log('🔬 Generating ML prediction...\n');

    const prediction = await generateMLPrediction({
      filingId: filing.id,
      ticker: filing.company.ticker,
      filingType: filing.filingType,
      filingDate: filing.filingDate
    });

    console.log('✅ ML Prediction Generated!\n');
    console.log('📊 Results:');
    console.log(`   Predicted 7-Day Return: ${prediction.predicted7dReturn > 0 ? '+' : ''}${prediction.predicted7dReturn.toFixed(2)}%`);
    console.log(`   Confidence: ${(prediction.predictionConfidence * 100).toFixed(0)}%`);

    const tradingSignal = (prediction.predictionConfidence >= 0.60 && Math.abs(prediction.predicted7dReturn) >= 2.0)
      ? (prediction.predicted7dReturn > 0 ? 'BUY' : 'SELL')
      : 'HOLD';

    console.log(`   Trading Signal: ${tradingSignal}`);

    if (tradingSignal === 'HOLD') {
      console.log(`   (Below threshold: confidence=${(prediction.predictionConfidence * 100).toFixed(0)}%, abs return=${Math.abs(prediction.predicted7dReturn).toFixed(2)}%)`);
    }

    console.log('\n✨ Test successful! The ML prediction integration is working.\n');

  } catch (error: any) {
    console.error('❌ ML Prediction failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
