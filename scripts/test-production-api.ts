import { prisma } from '../lib/prisma';

/**
 * Test Production API
 * Tests the prediction API locally to see debug logs
 */

async function testAPI() {
  console.log('=== Testing Prediction API ===\n');

  const accession = '0001628280-25-011824';

  // First, check database directly
  console.log('1. Checking database directly...');
  const filing = await prisma.filing.findUnique({
    where: { accessionNumber: accession },
    select: {
      accessionNumber: true,
      concernLevel: true,
      sentimentScore: true,
      riskScore: true,
      predicted7dReturn: true,
      company: {
        select: {
          ticker: true
        }
      }
    }
  });

  console.log('Database filing data:', JSON.stringify(filing, null, 2));

  // Now test production API
  console.log('\n2. Testing production API...');
  const response = await fetch(`https://sec-filing-analyzer.vercel.app/api/predict/${accession}`);

  if (!response.ok) {
    console.error('API Error:', response.status, response.statusText);
    const text = await response.text();
    console.log('Response:', text.slice(0, 500));
    return;
  }

  const data = await response.json();
  console.log('\nAPI Response:');
  console.log('- Model Version:', data.prediction?.modelVersion);
  console.log('- Concern Level:', data.prediction?.features?.concernLevel);
  console.log('- Sentiment Score:', data.prediction?.features?.sentimentScore);
  console.log('- Analyst Net Upgrades:', data.prediction?.features?.analystNetUpgrades);
  console.log('- Predicted Return:', data.prediction?.predicted7dReturn);
}

testAPI()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
