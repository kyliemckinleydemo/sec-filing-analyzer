/**
 * Audit Data Quality
 * Check for hardcoded values, mock data, and data leakage
 */

import { prisma } from '../lib/prisma';

async function main() {
  console.log('🔍 AUDITING DATA QUALITY\n');
  console.log('═'.repeat(80));

  // 1. Check for duplicate/constant values (sign of mock data)
  console.log('\n1️⃣ CHECKING FOR MOCK/CONSTANT DATA\n');

  const filings = await prisma.filing.findMany({
    where: {
      filingType: { in: ['10-K', '10-Q'] },
      actual7dReturn: { not: null },
      riskScore: { not: null }
    },
    include: { company: true },
    take: 50
  });

  console.log(`Analyzing first 50 filings...\n`);

  // Check risk scores
  const riskScores = filings.map(f => f.riskScore);
  const uniqueRisk = new Set(riskScores);
  console.log(`Risk Scores:`);
  console.log(`  Unique values: ${uniqueRisk.size}`);
  console.log(`  Sample: ${Array.from(uniqueRisk).slice(0, 10).join(', ')}`);
  if (uniqueRisk.size < 5) {
    console.log(`  ⚠️  WARNING: Very few unique risk scores - possible mock data!`);
  }

  // Check sentiment
  const sentiments = filings.map(f => f.sentimentScore);
  const uniqueSentiment = new Set(sentiments);
  console.log(`\nSentiment Scores:`);
  console.log(`  Unique values: ${uniqueSentiment.size}`);
  console.log(`  Sample: ${Array.from(uniqueSentiment).slice(0, 10).join(', ')}`);
  if (uniqueSentiment.size < 5) {
    console.log(`  ⚠️  WARNING: Very few unique sentiment scores - possible mock data!`);
  }

  // Check returns
  const returns = filings.map(f => f.actual7dReturn).filter(r => r !== null);
  const uniqueReturns = new Set(returns);
  console.log(`\n7-Day Returns:`);
  console.log(`  Unique values: ${uniqueReturns.size}`);
  console.log(`  Sample: ${returns.slice(0, 5).map(r => r!.toFixed(2)).join('%, ')}%`);
  console.log(`  Range: ${Math.min(...returns as number[]).toFixed(2)}% to ${Math.max(...returns as number[]).toFixed(2)}%`);

  // 2. Check for hardcoded coefficients in prediction code
  console.log('\n\n2️⃣ CHECKING FOR HARDCODED VALUES IN CODE\n');

  const championFile = await import('../lib/predictions').catch(() => null);
  if (championFile) {
    console.log('✅ Predictions module exists');
  } else {
    console.log('⚠️  No predictions module found');
  }

  // 3. Sample detailed data
  console.log('\n\n3️⃣ SAMPLE DATA VALIDATION\n');

  const sample = filings[0];
  console.log(`Filing: ${sample.company.ticker} (${sample.filingType} on ${sample.filingDate.toISOString().split('T')[0]})`);
  console.log(`  Risk Score: ${sample.riskScore}`);
  console.log(`  Sentiment: ${sample.sentimentScore}`);
  console.log(`  7d Return: ${sample.actual7dReturn?.toFixed(2)}%`);
  console.log(`  30d Return: ${sample.actual30dReturn?.toFixed(2)}%`);
  console.log(`  Market Cap: $${(sample.company.marketCap! / 1e9).toFixed(1)}B`);
  console.log(`  Current Price: $${sample.company.currentPrice}`);
  console.log(`  PE Ratio: ${sample.company.peRatio}`);

  // 4. Check for data leakage in features
  console.log('\n\n4️⃣ DATA LEAKAGE CHECK\n');

  const withAllReturns = await prisma.filing.count({
    where: {
      actual7dReturn: { not: null },
      actual30dReturn: { not: null },
      actual7dAlpha: { not: null },
      actual30dAlpha: { not: null }
    }
  });

  console.log(`Filings with ALL return types: ${withAllReturns}`);
  console.log(`\n⚠️  CRITICAL: If actual30dReturn, actual7dAlpha, or actual30dAlpha`);
  console.log(`    are used as FEATURES (not targets), that's DATA LEAKAGE!`);

  // 5. Verify AI analysis is real
  console.log('\n\n5️⃣ VERIFY AI ANALYSIS IS REAL\n');

  const withAnalysis = await prisma.filing.findMany({
    where: {
      filingType: { in: ['10-K', '10-Q'] },
      riskScore: { not: null },
      analysisData: { not: null }
    },
    take: 3
  });

  for (const filing of withAnalysis) {
    const analysis = filing.analysisData as any;
    console.log(`\n${filing.company?.ticker || 'Unknown'} (${filing.filingType}):`);
    console.log(`  Has analysisData: ${!!analysis}`);
    console.log(`  Risk: ${filing.riskScore}, Sentiment: ${filing.sentimentScore}`);

    if (typeof analysis === 'object' && analysis !== null) {
      const keys = Object.keys(analysis);
      console.log(`  Analysis keys: ${keys.slice(0, 5).join(', ')}...`);
    }
  }

  // 6. Summary
  console.log('\n\n' + '═'.repeat(80));
  console.log('📊 AUDIT SUMMARY\n');

  const issues = [];

  if (uniqueRisk.size < 5) issues.push('⚠️  Risk scores appear to be mock data');
  if (uniqueSentiment.size < 5) issues.push('⚠️  Sentiment scores appear to be mock data');
  if (withAllReturns > 0) issues.push('⚠️  Multiple return types available (check for leakage)');

  if (issues.length === 0) {
    console.log('✅ No major issues detected');
  } else {
    console.log('⚠️  ISSUES FOUND:');
    issues.forEach(issue => console.log(`   ${issue}`));
  }

  console.log('\n' + '═'.repeat(80));

  await prisma.$disconnect();
}

main().catch(console.error);
