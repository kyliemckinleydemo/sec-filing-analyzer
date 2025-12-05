import { prisma } from '../lib/prisma';

/**
 * Test EFX 10-Q Prediction
 * Test the correct EFX 10-Q filing from 10/21/2025
 */

async function testEFX() {
  console.log('=== Testing EFX 10-Q Prediction ===\n');

  const accession = '0000033185-25-000064'; // EFX 10-Q filed 10/21/2025

  // Check database
  console.log('1. Database record:');
  const filing = await prisma.filing.findUnique({
    where: { accessionNumber: accession },
    select: {
      accessionNumber: true,
      filingType: true,
      filingDate: true,
      concernLevel: true,
      sentimentScore: true,
      riskScore: true,
      predicted7dReturn: true,
      predictionConfidence: true,
      company: {
        select: {
          ticker: true
        }
      }
    }
  });

  console.log(JSON.stringify(filing, null, 2));

  // Test production API
  console.log('\n2. Production API response:');
  const response = await fetch(`https://sec-filing-analyzer.vercel.app/api/predict/${accession}`);

  if (!response.ok) {
    console.error('API Error:', response.status, response.statusText);
    return;
  }

  const data = await response.json();
  console.log('Model Version:', data.prediction?.modelVersion);
  console.log('Concern Level (from features):', data.prediction?.features?.concernLevel);
  console.log('Sentiment Score:', data.prediction?.features?.sentimentScore);
  console.log('Risk Score Delta:', data.prediction?.features?.riskScoreDelta);
  console.log('Analyst Net Upgrades:', data.prediction?.features?.analystNetUpgrades);
  console.log('Predicted Return:', data.prediction?.predicted7dReturn);
  console.log('Confidence:', data.prediction?.confidence);
}

testEFX()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
