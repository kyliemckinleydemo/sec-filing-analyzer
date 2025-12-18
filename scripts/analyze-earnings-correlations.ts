import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeEarningsCorrelations() {
  console.log('📊 ANALYZING EARNINGS SURPRISE CORRELATIONS\n');
  console.log('═'.repeat(80));

  // Get all filings with earnings data and returns
  const filings = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null },
      epsSurprise: { not: null },
    },
    select: {
      id: true,
      filingDate: true,
      actual7dReturn: true,
      actual30dReturn: true,
      consensusEPS: true,
      actualEPS: true,
      epsSurprise: true,
      consensusRevenue: true,
      actualRevenue: true,
      revenueSurprise: true,
      company: {
        select: {
          ticker: true,
        }
      }
    }
  });

  console.log(`Found ${filings.length} filings with earnings surprise data\n`);

  if (filings.length === 0) {
    console.log('❌ No data to analyze. Run backfill first.');
    await prisma.$disconnect();
    return;
  }

  // Calculate correlations
  const stats = calculateCorrelations(filings);

  // Print results
  console.log('═'.repeat(80));
  console.log('CORRELATION ANALYSIS');
  console.log('═'.repeat(80));
  console.log(`\nSample Size: ${stats.count} filings\n`);

  console.log('EPS SURPRISE vs RETURNS:');
  console.log(`  7-day return:   ${stats.epsVs7d.toFixed(4)} ${formatSignificance(stats.epsVs7d)}`);
  console.log(`  30-day return:  ${stats.epsVs30d.toFixed(4)} ${formatSignificance(stats.epsVs30d)}`);

  if (stats.revenueCount > 0) {
    console.log(`\nREVENUE SURPRISE vs RETURNS: (${stats.revenueCount} samples)`);
    console.log(`  7-day return:   ${stats.revenueVs7d.toFixed(4)} ${formatSignificance(stats.revenueVs7d)}`);
    console.log(`  30-day return:  ${stats.revenueVs30d.toFixed(4)} ${formatSignificance(stats.revenueVs30d)}`);
  }

  // Beat/Miss Analysis
  console.log('\n' + '═'.repeat(80));
  console.log('BEAT/MISS ANALYSIS');
  console.log('═'.repeat(80));

  const beatMissStats = analyzeBeatMiss(filings);

  console.log(`\nEPS BEATS (surprise > 2%): ${beatMissStats.epsBeats.count}`);
  console.log(`  Avg 7d return:  ${(beatMissStats.epsBeats.avg7d * 100).toFixed(2)}%`);
  console.log(`  Avg 30d return: ${(beatMissStats.epsBeats.avg30d * 100).toFixed(2)}%`);

  console.log(`\nEPS MISSES (surprise < -2%): ${beatMissStats.epsMisses.count}`);
  console.log(`  Avg 7d return:  ${(beatMissStats.epsMisses.avg7d * 100).toFixed(2)}%`);
  console.log(`  Avg 30d return: ${(beatMissStats.epsMisses.avg30d * 100).toFixed(2)}%`);

  console.log(`\nEPS INLINE (±2%): ${beatMissStats.epsInline.count}`);
  console.log(`  Avg 7d return:  ${(beatMissStats.epsInline.avg7d * 100).toFixed(2)}%`);
  console.log(`  Avg 30d return: ${(beatMissStats.epsInline.avg30d * 100).toFixed(2)}%`);

  // Magnitude Analysis
  console.log('\n' + '═'.repeat(80));
  console.log('SURPRISE MAGNITUDE DISTRIBUTION');
  console.log('═'.repeat(80));

  const buckets = bucketizeSurprises(filings);
  console.log('\nEPS Surprise Distribution:');
  for (const bucket of buckets) {
    const bar = '█'.repeat(Math.round(bucket.pct / 2));
    console.log(`  ${bucket.label.padEnd(15)} ${bucket.count.toString().padStart(4)} (${bucket.pct.toFixed(1)}%) ${bar}`);
  }

  console.log('\n═'.repeat(80));
  console.log('INTERPRETATION');
  console.log('═'.repeat(80));
  console.log('\nCorrelation strength guide:');
  console.log('  0.00 - 0.10: Negligible');
  console.log('  0.10 - 0.30: Weak');
  console.log('  0.30 - 0.50: Moderate');
  console.log('  0.50+:       Strong\n');

  const strongestCorr = Math.max(Math.abs(stats.epsVs7d), Math.abs(stats.epsVs30d));

  if (strongestCorr > 0.15) {
    console.log('✅ Earnings surprises show predictive power!');
    console.log(`   Strongest correlation: ${strongestCorr.toFixed(3)}`);
    console.log('   → Model should include earnings surprise as key feature');
  } else {
    console.log('⚠️  Earnings surprises show weak correlation');
    console.log('   → May need to combine with other features');
    console.log('   → Or use non-linear models to capture patterns');
  }

  console.log('\n');
  await prisma.$disconnect();
}

function calculateCorrelations(filings: any[]) {
  const with7d = filings.filter(f => f.actual7dReturn !== null && f.epsSurprise !== null);
  const with30d = filings.filter(f => f.actual30dReturn !== null && f.epsSurprise !== null);

  const withRevenue = filings.filter(f => f.revenueSurprise !== null);

  return {
    count: with7d.length,
    epsVs7d: correlation(with7d.map(f => f.epsSurprise), with7d.map(f => f.actual7dReturn)),
    epsVs30d: correlation(with30d.map(f => f.epsSurprise), with30d.map(f => f.actual30dReturn)),
    revenueCount: withRevenue.length,
    revenueVs7d: withRevenue.length > 0 ? correlation(withRevenue.map(f => f.revenueSurprise), withRevenue.map(f => f.actual7dReturn)) : 0,
    revenueVs30d: withRevenue.length > 0 && withRevenue.filter(f => f.actual30dReturn).length > 0 ? correlation(withRevenue.filter(f => f.actual30dReturn).map(f => f.revenueSurprise), withRevenue.filter(f => f.actual30dReturn).map(f => f.actual30dReturn)) : 0,
  };
}

function analyzeBeatMiss(filings: any[]) {
  const beats = filings.filter(f => f.epsSurprise > 2);
  const misses = filings.filter(f => f.epsSurprise < -2);
  const inline = filings.filter(f => f.epsSurprise >= -2 && f.epsSurprise <= 2);

  return {
    epsBeats: {
      count: beats.length,
      avg7d: average(beats.map(f => f.actual7dReturn)),
      avg30d: average(beats.filter(f => f.actual30dReturn).map(f => f.actual30dReturn)),
    },
    epsMisses: {
      count: misses.length,
      avg7d: average(misses.map(f => f.actual7dReturn)),
      avg30d: average(misses.filter(f => f.actual30dReturn).map(f => f.actual30dReturn)),
    },
    epsInline: {
      count: inline.length,
      avg7d: average(inline.map(f => f.actual7dReturn)),
      avg30d: average(inline.filter(f => f.actual30dReturn).map(f => f.actual30dReturn)),
    },
  };
}

function bucketizeSurprises(filings: any[]) {
  const buckets = [
    { label: '< -10%', min: -Infinity, max: -10, count: 0 },
    { label: '-10% to -5%', min: -10, max: -5, count: 0 },
    { label: '-5% to -2%', min: -5, max: -2, count: 0 },
    { label: '-2% to 2%', min: -2, max: 2, count: 0 },
    { label: '2% to 5%', min: 2, max: 5, count: 0 },
    { label: '5% to 10%', min: 5, max: 10, count: 0 },
    { label: '> 10%', min: 10, max: Infinity, count: 0 },
  ];

  for (const filing of filings) {
    const surprise = filing.epsSurprise;
    for (const bucket of buckets) {
      if (surprise > bucket.min && surprise <= bucket.max) {
        bucket.count++;
        break;
      }
    }
  }

  const total = filings.length;
  return buckets.map(b => ({ ...b, pct: (b.count / total) * 100 }));
}

function correlation(x: number[], y: number[]): number {
  if (x.length === 0 || x.length !== y.length) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return numerator / denominator;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatSignificance(corr: number): string {
  const abs = Math.abs(corr);
  if (abs < 0.1) return '(negligible)';
  if (abs < 0.3) return '(weak)';
  if (abs < 0.5) return '(moderate)';
  return '(strong)';
}

analyzeEarningsCorrelations().catch(console.error);
