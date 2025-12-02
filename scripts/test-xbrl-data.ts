import { prisma } from '../lib/prisma';

async function testXBRLData() {
  console.log('Checking XBRL data structure in Filing.analysisData...\n');

  // Get one filing with analysisData
  const filing = await prisma.filing.findFirst({
    where: {
      analysisData: { not: null }
    },
    include: {
      company: {
        select: { ticker: true, name: true }
      }
    }
  });

  if (!filing) {
    console.log('No filings with analysisData found!');
    return;
  }

  console.log(`Found filing for ${filing.company.ticker}:`);
  console.log(`Filing ID: ${filing.id}`);
  console.log(`Filing Type: ${filing.filingType}`);
  console.log(`Filing Date: ${filing.filingDate}`);
  console.log(`Report Date: ${filing.reportDate}\n`);

  // Parse the analysisData
  try {
    const analysisData = JSON.parse(filing.analysisData);
    console.log('analysisData structure:');
    console.log(`Keys: ${Object.keys(analysisData).join(', ')}\n`);

    // Check for structured data
    if (analysisData.structuredData) {
      console.log('✅ structuredData found!');
      console.log('structuredData keys:', Object.keys(analysisData.structuredData).join(', '));
      console.log('\nstructuredData sample:');
      console.log(JSON.stringify(analysisData.structuredData, null, 2).substring(0, 500));
    } else {
      console.log('❌ No structuredData field');
      console.log('\nFull analysisData:');
      console.log(JSON.stringify(analysisData, null, 2).substring(0, 1000));
    }
  } catch (error: any) {
    console.log('Error parsing analysisData:', error.message);
  }
}

testXBRLData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
