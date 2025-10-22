import { prisma } from '../lib/prisma';

/**
 * Check if we have enough data for chat queries to work
 */
async function checkDataReadiness() {
  console.log('🔍 Checking chat data readiness...\n');

  // Count filings with complete analysis
  const totalFilings = await prisma.filing.count();
  const filingsWithConcernLevel = await prisma.filing.count({
    where: { concernLevel: { not: null } }
  });
  const filingsWithActual7d = await prisma.filing.count({
    where: { actual7dReturn: { not: null } }
  });
  const filingsWithPredictions = await prisma.filing.count({
    where: { predictions: { some: {} } }
  });
  const filingsWithFinancials = await prisma.filing.count({
    where: { analysisData: { not: null } }
  });

  console.log(`📊 Total Filings: ${totalFilings}`);
  console.log(`📊 Filings with Concern Level: ${filingsWithConcernLevel}`);
  console.log(`📊 Filings with 7-day Returns: ${filingsWithActual7d}`);
  console.log(`📊 Filings with ML Predictions: ${filingsWithPredictions}`);
  console.log(`📊 Filings with Financial Analysis: ${filingsWithFinancials}\n`);

  // Get sample filing to see what data is available
  const sampleFiling = await prisma.filing.findFirst({
    where: {
      concernLevel: { not: null },
      actual7dReturn: { not: null }
    },
    include: {
      company: true,
      predictions: { take: 1, orderBy: { createdAt: 'desc' } }
    }
  });

  if (sampleFiling) {
    console.log('📄 Sample Filing:');
    console.log(`   Company: ${sampleFiling.company.name} (${sampleFiling.company.ticker})`);
    console.log(`   Filing Type: ${sampleFiling.filingType}`);
    console.log(`   Filing Date: ${sampleFiling.filingDate.toISOString().split('T')[0]}`);
    console.log(`   Concern Level: ${sampleFiling.concernLevel}`);
    console.log(`   7-day Return: ${sampleFiling.actual7dReturn?.toFixed(2)}%`);
    console.log(`   Predicted Return: ${sampleFiling.predictions[0]?.predictedReturn?.toFixed(2)}%`);

    // Check if financial data exists
    let analysisData = null;
    try {
      analysisData = sampleFiling.analysisData ? JSON.parse(sampleFiling.analysisData) : null;
    } catch {}

    if (analysisData?.financialMetrics?.structuredData) {
      const fd = analysisData.financialMetrics.structuredData;
      console.log(`   Revenue: ${fd.revenue ? `$${(fd.revenue / 1e9).toFixed(1)}B` : 'N/A'}`);
      console.log(`   Revenue YoY: ${fd.revenueYoY || 'N/A'}`);
      console.log(`   EPS: ${fd.eps || 'N/A'}`);
      console.log(`   EPS YoY: ${fd.epsYoY || 'N/A'}`);
    } else {
      console.log(`   ⚠️  No structured financial data`);
    }
  }

  console.log('\n✅ Data Readiness Summary:');
  if (filingsWithConcernLevel < 5) {
    console.log('   ⚠️  Need more analyzed filings for meaningful queries');
    console.log('   Recommendation: Analyze at least 10-20 filings first');
  } else {
    console.log(`   ✅ ${filingsWithConcernLevel} filings ready for concern level queries`);
  }

  if (filingsWithActual7d < 5) {
    console.log('   ⚠️  Need more filings with actual returns for performance queries');
  } else {
    console.log(`   ✅ ${filingsWithActual7d} filings ready for performance queries`);
  }

  if (filingsWithPredictions < 5) {
    console.log('   ⚠️  Need more filings with ML predictions');
  } else {
    console.log(`   ✅ ${filingsWithPredictions} filings ready for ML accuracy queries`);
  }
}

checkDataReadiness()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
