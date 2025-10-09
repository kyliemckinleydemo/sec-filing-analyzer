import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const filing = await prisma.filing.findUnique({
    where: { accessionNumber: '0000950170-25-100235' },
    include: { company: true }
  });

  if (!filing) {
    console.log('Filing not found in database');
    return;
  }

  console.log('Filing found:');
  console.log('Company:', filing.company.name);
  console.log('Type:', filing.filingType);
  console.log('Date:', filing.filingDate);
  console.log('Risk Score:', filing.riskScore);
  console.log('Has Analysis:', !!filing.analysisData);

  if (filing.analysisData) {
    const analysis = JSON.parse(filing.analysisData);
    console.log('\n=== RISK ANALYSIS ===');
    console.log('Overall Trend:', analysis.risks?.overallTrend);
    console.log('Risk Score:', analysis.risks?.riskScore);
    console.log('Prior Risk Score:', analysis.risks?.priorRiskScore);
    console.log('New Risks:', analysis.risks?.newRisks?.length || 0);
    console.log('\nTop Risk Changes:');
    if (analysis.risks?.topChanges) {
      analysis.risks.topChanges.slice(0, 5).forEach((change: string, i: number) => {
        console.log(`  ${i+1}. ${change}`);
      });
    }

    console.log('\n=== NEW RISKS ===');
    if (analysis.risks?.newRisks) {
      analysis.risks.newRisks.forEach((risk: any) => {
        console.log(`\nTitle: ${risk.title}`);
        console.log(`Severity: ${risk.severity}`);
        console.log(`Impact: ${risk.impact}`);
      });
    }
  }

  await prisma.$disconnect();
}

check().catch(console.error);
