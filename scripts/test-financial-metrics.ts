import { prisma } from '../lib/prisma';

async function testFinancialMetrics() {
  console.log('Checking financialMetrics in Filing.analysisData...\n');

  // Get a 10-Q or 10-K filing (more likely to have financial data)
  const filing = await prisma.filing.findFirst({
    where: {
      analysisData: { not: null },
      filingType: { in: ['10-Q', '10-K'] }
    },
    include: {
      company: {
        select: { ticker: true, name: true }
      }
    }
  });

  if (!filing) {
    console.log('No 10-Q/10-K filings with analysisData found!');
    return;
  }

  console.log(`Found ${filing.filingType} for ${filing.company.ticker}:`);
  console.log(`Filing Date: ${filing.filingDate}`);
  console.log(`Report Date: ${filing.reportDate}\n`);

  // Parse the analysisData
  try {
    const analysisData = JSON.parse(filing.analysisData);

    if (analysisData.financialMetrics) {
      console.log('✅ financialMetrics found!');
      console.log('\nfinancialMetrics:');
      console.log(JSON.stringify(analysisData.financialMetrics, null, 2));
    } else {
      console.log('❌ No financialMetrics field');
    }

    // Check all top-level keys
    console.log('\n\nAll keys in analysisData:');
    for (const key of Object.keys(analysisData)) {
      console.log(`  ${key}:`, typeof analysisData[key]);
      if (typeof analysisData[key] === 'object' && analysisData[key] !== null) {
        console.log(`    └─ sub-keys:`, Object.keys(analysisData[key]).join(', '));
      }
    }

  } catch (error: any) {
    console.log('Error parsing analysisData:', error.message);
  }
}

testFinancialMetrics()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
