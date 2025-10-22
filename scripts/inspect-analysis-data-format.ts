import { prisma } from '../lib/prisma';

async function inspectAnalysisData() {
  console.log('🔍 Inspecting analysisData format...\n');

  const filing = await prisma.filing.findFirst({
    where: {
      analysisData: { not: null },
      concernLevel: { not: null }
    },
    include: { company: true }
  });

  if (!filing) {
    console.log('No filings found with analysisData');
    return;
  }

  console.log(`📄 Filing: ${filing.company.name} (${filing.company.ticker})`);
  console.log(`   Type: ${filing.filingType}`);
  console.log(`   Date: ${filing.filingDate.toISOString().split('T')[0]}\n`);

  let analysisData;
  try {
    analysisData = JSON.parse(filing.analysisData!);
  } catch (e) {
    console.log('Failed to parse analysisData');
    return;
  }

  console.log('📊 analysisData keys:', Object.keys(analysisData));

  if (analysisData.financialMetrics) {
    console.log('\n💰 financialMetrics keys:', Object.keys(analysisData.financialMetrics));

    if (analysisData.financialMetrics.structuredData) {
      console.log('\n✅ structuredData found:', Object.keys(analysisData.financialMetrics.structuredData));
      console.log('\nSample values:');
      console.log(JSON.stringify(analysisData.financialMetrics.structuredData, null, 2));
    } else {
      console.log('\n⚠️  No structuredData found');
      console.log('\nFinancialMetrics content:');
      console.log(JSON.stringify(analysisData.financialMetrics, null, 2).substring(0, 500));
    }
  } else {
    console.log('\n⚠️  No financialMetrics found');
  }

  // Also check a recent filing
  console.log('\n\n🔍 Checking most recent filing...\n');
  const recentFiling = await prisma.filing.findFirst({
    where: {
      analysisData: { not: null }
    },
    include: { company: true },
    orderBy: { filingDate: 'desc' }
  });

  if (recentFiling) {
    console.log(`📄 Recent Filing: ${recentFiling.company.name} (${recentFiling.company.ticker})`);
    console.log(`   Type: ${recentFiling.filingType}`);
    console.log(`   Date: ${recentFiling.filingDate.toISOString().split('T')[0]}\n`);

    let recentAnalysisData;
    try {
      recentAnalysisData = JSON.parse(recentFiling.analysisData!);
    } catch {}

    if (recentAnalysisData) {
      console.log('📊 analysisData keys:', Object.keys(recentAnalysisData));
      if (recentAnalysisData.financialMetrics?.structuredData) {
        console.log('✅ Has structuredData with keys:', Object.keys(recentAnalysisData.financialMetrics.structuredData));
      } else {
        console.log('⚠️  No structuredData');
      }
    }
  }
}

inspectAnalysisData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
