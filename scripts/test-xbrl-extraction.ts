import { prisma } from '../lib/prisma';

/**
 * Test if recent filings have XBRL structuredData
 */
async function testXBRLExtraction() {
  console.log('🔍 Testing XBRL extraction in recent filings...\n');

  // Check the 10 most recent filings
  const recentFilings = await prisma.filing.findMany({
    where: {
      analysisData: { not: null }
    },
    include: { company: true },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  console.log(`Found ${recentFilings.length} recent filings with analysisData\n`);

  let withStructuredData = 0;
  let withoutStructuredData = 0;

  for (const filing of recentFilings) {
    let analysisData;
    try {
      analysisData = JSON.parse(filing.analysisData!);
    } catch {
      console.log(`❌ ${filing.company.ticker} - Failed to parse analysisData`);
      continue;
    }

    const hasStructuredData = analysisData?.financialMetrics?.structuredData;

    if (hasStructuredData) {
      withStructuredData++;
      const sd = analysisData.financialMetrics.structuredData;
      console.log(`✅ ${filing.company.ticker} (${filing.filingType}) - Created: ${filing.createdAt.toISOString().split('T')[0]}`);
      console.log(`   Revenue: ${sd.revenue ? `$${(sd.revenue / 1e9).toFixed(2)}B` : 'N/A'}`);
      console.log(`   Revenue YoY: ${sd.revenueYoY || 'N/A'}`);
      console.log(`   EPS: ${sd.eps || 'N/A'}`);
      console.log(`   EPS YoY: ${sd.epsYoY || 'N/A'}`);
      console.log(`   Gross Margin: ${sd.grossMargin ? `${sd.grossMargin.toFixed(1)}%` : 'N/A'}`);
    } else {
      withoutStructuredData++;
      console.log(`❌ ${filing.company.ticker} (${filing.filingType}) - Created: ${filing.createdAt.toISOString().split('T')[0]} - NO structuredData`);
    }
    console.log('');
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ With structuredData: ${withStructuredData}`);
  console.log(`   ❌ Without structuredData: ${withoutStructuredData}`);

  if (withStructuredData === 0) {
    console.log('\n⚠️  WARNING: No recent filings have structuredData!');
    console.log('   This means XBRL extraction is not working in current code.');
  } else if (withoutStructuredData > 0) {
    console.log('\n⚠️  Some recent filings missing structuredData');
    console.log('   Check logs for XBRL parsing errors');
  } else {
    console.log('\n✅ All recent filings have structuredData - XBRL extraction working!');
  }
}

testXBRLExtraction()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
