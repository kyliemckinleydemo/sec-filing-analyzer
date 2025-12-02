/**
 * Analyze Mega-Cap and Large-Cap Characteristics
 *
 * Understand what makes these segments different and what features might help
 */

import { prisma } from '../lib/prisma';

async function analyzeMegaLargeCaps() {
  console.log('🔍 ANALYZING MEGA-CAP AND LARGE-CAP CHARACTERISTICS\n');
  console.log('═'.repeat(80));

  // Get all filings with returns
  const filings = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null },
      riskScore: { not: null },
      sentimentScore: { not: null }
    },
    include: { company: true },
    orderBy: { filingDate: 'desc' }
  });

  // Categorize by market cap
  const megaCaps = filings.filter(f => (f.company?.marketCap ?? 0) >= 500_000_000_000);
  const largeCaps = filings.filter(f => {
    const mc = f.company?.marketCap ?? 0;
    return mc >= 200_000_000_000 && mc < 500_000_000_000;
  });
  const midCaps = filings.filter(f => {
    const mc = f.company?.marketCap ?? 0;
    return mc >= 50_000_000_000 && mc < 200_000_000_000;
  });
  const smallCaps = filings.filter(f => (f.company?.marketCap ?? 0) < 50_000_000_000);

  console.log('\n📊 Sample Distribution:');
  console.log(`   Mega-cap: ${megaCaps.length}`);
  console.log(`   Large-cap: ${largeCaps.length}`);
  console.log(`   Mid-cap: ${midCaps.length}`);
  console.log(`   Small-cap: ${smallCaps.length}`);

  // Function to analyze segment
  function analyzeSegment(name: string, filings: typeof megaCaps) {
    console.log(`\n\n${'═'.repeat(80)}`);
    console.log(`📈 ${name.toUpperCase()} ANALYSIS (${filings.length} samples)`);
    console.log('═'.repeat(80));

    // Return statistics
    const returns = filings.map(f => f.actual7dReturn!);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length
    );
    const positive = returns.filter(r => r > 0).length;
    const negative = returns.filter(r => r < 0).length;

    console.log('\n📊 Return Characteristics:');
    console.log(`   Average 7-day return: ${(avgReturn * 100).toFixed(2)}%`);
    console.log(`   Std deviation: ${(stdDev * 100).toFixed(2)}%`);
    console.log(`   Positive returns: ${positive}/${filings.length} (${(positive/filings.length*100).toFixed(1)}%)`);
    console.log(`   Negative returns: ${negative}/${filings.length} (${(negative/filings.length*100).toFixed(1)}%)`);
    console.log(`   Min: ${(Math.min(...returns) * 100).toFixed(2)}%`);
    console.log(`   Max: ${(Math.max(...returns) * 100).toFixed(2)}%`);

    // Risk and sentiment scores
    const riskScores = filings.map(f => f.riskScore!);
    const sentimentScores = filings.map(f => f.sentimentScore!);

    console.log('\n🎯 AI Analysis Scores:');
    console.log(`   Average risk score: ${(riskScores.reduce((a,b) => a+b, 0) / riskScores.length).toFixed(1)}`);
    console.log(`   Average sentiment score: ${(sentimentScores.reduce((a,b) => a+b, 0) / sentimentScores.length).toFixed(1)}`);

    // Analyst coverage
    const withAnalystData = filings.filter(f => {
      if (!f.analysisData) return false;
      try {
        const data = typeof f.analysisData === 'string' ? JSON.parse(f.analysisData) : f.analysisData;
        return (data as any)?.analyst?.numberOfAnalysts > 0;
      } catch { return false; }
    });

    const analystCounts = withAnalystData.map(f => {
      const data = typeof f.analysisData === 'string' ? JSON.parse(f.analysisData) : f.analysisData;
      return (data as any)?.analyst?.numberOfAnalysts || 0;
    });

    console.log('\n👥 Analyst Coverage:');
    console.log(`   Filings with analyst data: ${withAnalystData.length}/${filings.length}`);
    if (analystCounts.length > 0) {
      console.log(`   Average # of analysts: ${(analystCounts.reduce((a,b) => a+b, 0) / analystCounts.length).toFixed(1)}`);
      console.log(`   Max analysts: ${Math.max(...analystCounts)}`);
    }

    // Analyst activity
    const withActivity = filings.filter(f => {
      if (!f.analysisData) return false;
      try {
        const data = typeof f.analysisData === 'string' ? JSON.parse(f.analysisData) : f.analysisData;
        const activity = (data as any)?.analyst?.activity;
        return activity && (activity.upgradesLast7d > 0 || activity.downgradesLast7d > 0);
      } catch { return false; }
    });

    console.log('\n📈 Analyst Activity (7 days before filing):');
    console.log(`   Filings with activity: ${withActivity.length}/${filings.length} (${(withActivity.length/filings.length*100).toFixed(1)}%)`);

    if (withActivity.length > 0) {
      let totalUpgrades = 0;
      let totalDowngrades = 0;

      withActivity.forEach(f => {
        try {
          const data = typeof f.analysisData === 'string' ? JSON.parse(f.analysisData) : f.analysisData;
          const activity = (data as any)?.analyst?.activity;
          totalUpgrades += activity?.upgradesLast7d || 0;
          totalDowngrades += activity?.downgradesLast7d || 0;
        } catch {}
      });

      console.log(`   Total upgrades: ${totalUpgrades}`);
      console.log(`   Total downgrades: ${totalDowngrades}`);
      console.log(`   Upgrades per active filing: ${(totalUpgrades / withActivity.length).toFixed(2)}`);
      console.log(`   Downgrades per active filing: ${(totalDowngrades / withActivity.length).toFixed(2)}`);
    }

    // Technical indicator availability
    const filingDates = filings.map(f => f.filingDate);
    console.log('\n📊 Data Completeness:');
    console.log(`   Filing date range: ${filingDates[filingDates.length-1].toISOString().split('T')[0]} to ${filingDates[0].toISOString().split('T')[0]}`);
  }

  analyzeSegment('Mega-Cap', megaCaps);
  analyzeSegment('Large-Cap', largeCaps);
  analyzeSegment('Mid-Cap', midCaps);
  analyzeSegment('Small-Cap', smallCaps);

  console.log('\n\n' + '═'.repeat(80));
  console.log('💡 KEY INSIGHTS FOR MEGA/LARGE-CAP IMPROVEMENT');
  console.log('═'.repeat(80));

  // Compare performance patterns
  const megaReturns = megaCaps.map(f => f.actual7dReturn!);
  const largeReturns = largeCaps.map(f => f.actual7dReturn!);
  const midReturns = midCaps.map(f => f.actual7dReturn!);

  const megaStd = Math.sqrt(megaReturns.map(r => Math.pow(r - megaReturns.reduce((a,b)=>a+b,0)/megaReturns.length, 2)).reduce((a,b) => a+b, 0) / megaReturns.length);
  const largeStd = Math.sqrt(largeReturns.map(r => Math.pow(r - largeReturns.reduce((a,b)=>a+b,0)/largeReturns.length, 2)).reduce((a,b) => a+b, 0) / largeReturns.length);
  const midStd = Math.sqrt(midReturns.map(r => Math.pow(r - midReturns.reduce((a,b)=>a+b,0)/midReturns.length, 2)).reduce((a,b) => a+b, 0) / midReturns.length);

  console.log('\n1. VOLATILITY COMPARISON:');
  console.log(`   Mega-cap std dev: ${(megaStd * 100).toFixed(2)}%`);
  console.log(`   Large-cap std dev: ${(largeStd * 100).toFixed(2)}%`);
  console.log(`   Mid-cap std dev: ${(midStd * 100).toFixed(2)}%`);
  console.log(`   → Higher volatility = harder to predict`);

  console.log('\n2. ANALYST COVERAGE:');
  console.log(`   → Mega/large-caps have MORE analyst coverage`);
  console.log(`   → Analyst activity features should help more for these segments`);

  console.log('\n3. FEATURE AVAILABILITY:');
  console.log(`   → Check if momentum indicators (MA, RSI) are available`);
  console.log(`   → Check if macro indicators (VIX, S&P) are available`);

  console.log('\n4. POTENTIAL IMPROVEMENTS:');
  console.log(`   ✅ Widen analyst activity window (7d → 30d)`);
  console.log(`   ✅ Add momentum indicators if available`);
  console.log(`   ✅ Add macro context (market regime)`);
  console.log(`   ✅ Consider interaction features (risk × sentiment)`);

  await prisma.$disconnect();
}

analyzeMegaLargeCaps().catch(console.error);
