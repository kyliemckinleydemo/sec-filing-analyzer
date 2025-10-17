/**
 * Export ML Dataset with ALL Available Features
 *
 * Uses Company table directly (not CompanySnapshot which is empty)
 * Exports to CSV for Python ML analysis
 */

import { prisma } from '../lib/prisma';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

interface MLDataPoint {
  // Identifiers
  filingId: string;
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: string;

  // Target variables
  actual7dReturn: number;
  actual30dReturn: number | null;
  actual7dAlpha: number | null;
  actual30dAlpha: number | null;

  // Filing analysis (Claude AI)
  riskScore: number;
  sentimentScore: number;

  // Company fundamentals (from Company table - current snapshot)
  marketCap: number;
  currentPrice: number;
  peRatio: number | null;
  forwardPE: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  analystTargetPrice: number | null;

  // Derived features
  priceToHigh: number | null;
  priceToLow: number | null;
  priceToTarget: number | null;

  // Technical indicators (momentum)
  ma30: number | null;
  ma50: number | null;
  ma200: number | null;
  priceToMA30: number | null;
  priceToMA50: number | null;
  rsi14: number | null;
  macd: number | null;
  volatility30: number | null;
  return30d: number | null;

  // Macro indicators
  spxReturn7d: number | null;
  spxReturn30d: number | null;
  vixClose: number | null;

  // Analyst consensus (from analysisData JSON)
  analystUpsidePotential: number | null; // % upside to target price
  analystConsensusScore: number | null; // 0-100 scale (100=Strong Buy)
  analystCoverage: number | null; // Number of analysts covering

  // Analyst activity in 30 days before filing (from analysisData JSON)
  upgradesLast30d: number | null; // Number of upgrades
  downgradesLast30d: number | null; // Number of downgrades
  netUpgrades: number | null; // Upgrades - Downgrades
  majorUpgrades: number | null; // Upgrades from major firms
  majorDowngrades: number | null; // Downgrades from major firms

  // Market cap category
  marketCapCategory: string; // "mega", "large", "mid", "small"
}

async function main() {
  console.log('🚀 EXPORTING ML DATASET\n');
  console.log('═'.repeat(80));

  // Get all filings with returns and analysis
  const filings = await prisma.filing.findMany({
    where: {
      filingType: { in: ['10-K', '10-Q'] },
      actual7dReturn: { not: null },
      riskScore: { not: null },
      sentimentScore: { not: null }
    },
    include: {
      company: true
    },
    orderBy: {
      filingDate: 'asc'
    }
  });

  console.log(`\n📊 Found ${filings.length} filings with returns and AI analysis`);

  if (filings.length === 0) {
    console.log('\n❌ No data to export. Run backfill-stock-prices.ts first.');
    await prisma.$disconnect();
    return;
  }

  const dataPoints: MLDataPoint[] = [];
  let skipped = {
    missingMarketCap: 0,
    missingPrice: 0,
    total: 0
  };

  for (const filing of filings) {
    const company = filing.company;

    // Skip if missing critical data
    if (!company.marketCap || !company.currentPrice) {
      skipped.total++;
      if (!company.marketCap) skipped.missingMarketCap++;
      if (!company.currentPrice) skipped.missingPrice++;
      continue;
    }

    // Get technical indicators (nearest date before filing)
    const technical = await prisma.technicalIndicators.findFirst({
      where: {
        ticker: company.ticker,
        date: { lte: filing.filingDate }
      },
      orderBy: { date: 'desc' }
    });

    // Get macro indicators (nearest date before filing)
    const macro = await prisma.macroIndicators.findFirst({
      where: { date: { lte: filing.filingDate } },
      orderBy: { date: 'desc' }
    });

    // Calculate derived features
    const priceToHigh = company.fiftyTwoWeekHigh
      ? company.currentPrice / company.fiftyTwoWeekHigh
      : null;

    const priceToLow = company.fiftyTwoWeekLow
      ? company.currentPrice / company.fiftyTwoWeekLow
      : null;

    const priceToTarget = company.analystTargetPrice
      ? company.currentPrice / company.analystTargetPrice
      : null;

    // Market cap category
    let marketCapCategory: string;
    if (company.marketCap >= 500_000_000_000) {
      marketCapCategory = 'mega';
    } else if (company.marketCap >= 200_000_000_000) {
      marketCapCategory = 'large';
    } else if (company.marketCap >= 50_000_000_000) {
      marketCapCategory = 'mid';
    } else {
      marketCapCategory = 'small';
    }

    // Extract analyst data from analysisData JSON
    let analystUpsidePotential: number | null = null;
    let analystConsensusScore: number | null = null;
    let analystCoverage: number | null = null;
    let upgradesLast30d: number | null = null;
    let downgradesLast30d: number | null = null;
    let netUpgrades: number | null = null;
    let majorUpgrades: number | null = null;
    let majorDowngrades: number | null = null;

    if (filing.analysisData) {
      try {
        const analysisData = typeof filing.analysisData === 'string'
          ? JSON.parse(filing.analysisData)
          : filing.analysisData;

        const analyst = (analysisData as any)?.analyst;
        if (analyst) {
          // Consensus data
          analystUpsidePotential = analyst.upsidePotential ?? null;
          analystConsensusScore = analyst.consensusScore ?? null;
          analystCoverage = analyst.numberOfAnalysts ?? null;

          // Activity data (upgrades/downgrades in 30 days before filing)
          const activity = analyst.activity;
          if (activity) {
            upgradesLast30d = activity.upgradesLast30d ?? null;
            downgradesLast30d = activity.downgradesLast30d ?? null;
            netUpgrades = activity.netUpgrades ?? null;
            majorUpgrades = activity.majorUpgrades ?? null;
            majorDowngrades = activity.majorDowngrades ?? null;
          }
        }
      } catch (e) {
        // Skip if parsing fails
      }
    }

    dataPoints.push({
      // Identifiers
      filingId: filing.id,
      ticker: company.ticker,
      companyName: company.name,
      filingType: filing.filingType,
      filingDate: filing.filingDate.toISOString(),

      // Targets
      actual7dReturn: filing.actual7dReturn!,
      actual30dReturn: filing.actual30dReturn,
      actual7dAlpha: filing.actual7dAlpha,
      actual30dAlpha: filing.actual30dAlpha,

      // Filing analysis
      riskScore: filing.riskScore!,
      sentimentScore: filing.sentimentScore!,

      // Fundamentals
      marketCap: company.marketCap,
      currentPrice: company.currentPrice,
      peRatio: company.peRatio,
      forwardPE: company.forwardPE,
      fiftyTwoWeekHigh: company.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: company.fiftyTwoWeekLow,
      analystTargetPrice: company.analystTargetPrice,

      // Derived
      priceToHigh,
      priceToLow,
      priceToTarget,

      // Technical
      ma30: technical?.ma30 ?? null,
      ma50: technical?.ma50 ?? null,
      ma200: technical?.ma200 ?? null,
      priceToMA30: technical?.priceToMA30 ?? null,
      priceToMA50: technical?.priceToMA50 ?? null,
      rsi14: technical?.rsi14 ?? null,
      macd: technical?.macd ?? null,
      volatility30: technical?.volatility30 ?? null,
      return30d: technical?.return30d ?? null,

      // Macro
      spxReturn7d: macro?.spxReturn7d ?? null,
      spxReturn30d: macro?.spxReturn30d ?? null,
      vixClose: macro?.vixClose ?? null,

      // Analyst consensus
      analystUpsidePotential,
      analystConsensusScore,
      analystCoverage,

      // Analyst activity (30 days before filing)
      upgradesLast30d,
      downgradesLast30d,
      netUpgrades,
      majorUpgrades,
      majorDowngrades,

      // Category
      marketCapCategory
    });
  }

  console.log(`\n✅ Processed ${dataPoints.length} complete samples`);

  if (skipped.total > 0) {
    console.log(`\n⚠️  Skipped ${skipped.total} filings:`);
    console.log(`   Missing market cap: ${skipped.missingMarketCap}`);
    console.log(`   Missing price: ${skipped.missingPrice}`);
  }

  // Summary statistics
  const megaCaps = dataPoints.filter(d => d.marketCapCategory === 'mega').length;
  const largeCaps = dataPoints.filter(d => d.marketCapCategory === 'large').length;
  const midCaps = dataPoints.filter(d => d.marketCapCategory === 'mid').length;
  const smallCaps = dataPoints.filter(d => d.marketCapCategory === 'small').length;

  const tenK = dataPoints.filter(d => d.filingType === '10-K').length;
  const tenQ = dataPoints.filter(d => d.filingType === '10-Q').length;

  console.log('\n📈 Dataset Breakdown:');
  console.log(`   Filing types: ${tenK} 10-K, ${tenQ} 10-Q`);
  console.log(`   Market caps: ${megaCaps} mega, ${largeCaps} large, ${midCaps} mid, ${smallCaps} small`);

  // Feature completeness
  const withTechnical = dataPoints.filter(d => d.ma30 !== null).length;
  const withMacro = dataPoints.filter(d => d.spxReturn7d !== null).length;
  const withPE = dataPoints.filter(d => d.peRatio !== null).length;
  const withTargetPrice = dataPoints.filter(d => d.analystTargetPrice !== null).length;
  const withAnalystData = dataPoints.filter(d => d.analystConsensusScore !== null).length;
  const withAnalystActivity = dataPoints.filter(d =>
    d.upgradesLast30d !== null || d.downgradesLast30d !== null
  ).length;
  const withUpgrades = dataPoints.filter(d => (d.upgradesLast30d ?? 0) > 0).length;
  const withDowngrades = dataPoints.filter(d => (d.downgradesLast30d ?? 0) > 0).length;

  console.log('\n📊 Feature Completeness:');
  console.log(`   Technical indicators: ${withTechnical}/${dataPoints.length} (${(withTechnical/dataPoints.length*100).toFixed(1)}%)`);
  console.log(`   Macro indicators: ${withMacro}/${dataPoints.length} (${(withMacro/dataPoints.length*100).toFixed(1)}%)`);
  console.log(`   PE ratio: ${withPE}/${dataPoints.length} (${(withPE/dataPoints.length*100).toFixed(1)}%)`);
  console.log(`   Analyst consensus: ${withAnalystData}/${dataPoints.length} (${(withAnalystData/dataPoints.length*100).toFixed(1)}%)`);
  console.log(`   Analyst activity: ${withAnalystActivity}/${dataPoints.length} (${(withAnalystActivity/dataPoints.length*100).toFixed(1)}%)`);
  console.log(`     - With upgrades: ${withUpgrades}`);
  console.log(`     - With downgrades: ${withDowngrades}`);
  console.log(`   Analyst target: ${withTargetPrice}/${dataPoints.length} (${(withTargetPrice/dataPoints.length*100).toFixed(1)}%)`);

  // Create output directory
  if (!existsSync('./data')) {
    mkdirSync('./data');
  }

  // Write CSV
  const headers = Object.keys(dataPoints[0]);
  const rows = [headers.join(',')];

  for (const point of dataPoints) {
    const values = headers.map(h => {
      const value = (point as any)[h];
      if (value === null) return '';
      if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
      return value;
    });
    rows.push(values.join(','));
  }

  const csv = rows.join('\n');
  writeFileSync('./data/ml_dataset.csv', csv);

  console.log('\n✅ Exported to data/ml_dataset.csv');

  // Also export metadata
  const metadata = {
    exportDate: new Date().toISOString(),
    totalSamples: dataPoints.length,
    dateRange: {
      earliest: dataPoints[0].filingDate,
      latest: dataPoints[dataPoints.length - 1].filingDate
    },
    breakdown: {
      filingTypes: { '10-K': tenK, '10-Q': tenQ },
      marketCaps: {
        mega: megaCaps,
        large: largeCaps,
        mid: midCaps,
        small: smallCaps
      }
    },
    featureCompleteness: {
      technical: withTechnical,
      macro: withMacro,
      peRatio: withPE,
      analystTarget: withTargetPrice
    }
  };

  writeFileSync('./data/ml_dataset_metadata.json', JSON.stringify(metadata, null, 2));
  console.log('✅ Exported metadata to data/ml_dataset_metadata.json');

  console.log('\n═'.repeat(80));
  console.log('\n📋 NEXT STEPS:');
  console.log('   1. Run Python ML analysis: python scripts/ml_analysis.py');
  console.log('   2. Or backfill more returns: npx tsx scripts/backfill-stock-prices.ts');
  console.log('');

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
