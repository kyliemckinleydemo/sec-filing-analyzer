/**
 * Mega-Cap Model Optimization
 *
 * Goal: Achieve 65-70% direction accuracy on mega-cap stocks (>$500B market cap)
 *
 * Strategy:
 * 1. Ensemble routing: Champion (rule-based) for 10-K, Linear for 10-Q/8-K
 * 2. Integrate momentum features (MA, RSI, volume patterns)
 * 3. Add S&P 500 and VIX macro context
 * 4. Test on mega-cap subset and measure improvements
 */

import { prisma } from '../lib/prisma';

interface MegaCapTrainingData {
  // Target
  actual7dReturn: number;

  // Filing context
  filingType: string;
  riskScore: number | null;
  sentimentScore: number | null;

  // Company fundamentals (at filing time)
  marketCap: number | null;
  currentPrice: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  analystRatingCount: number | null;
  analystTargetPrice: number | null;
  analystBuyCount: number | null;
  analystHoldCount: number | null;
  analystSellCount: number | null;
  analystBullishRatio: number | null;
  epsActual: number | null;
  epsEstimateCurrentQ: number | null;
  epsEstimateCurrentY: number | null;
  epsEstimateNextQ: number | null;
  epsEstimateNextY: number | null;
  revenueEstimateCurrentQ: number | null;
  revenueEstimateCurrentY: number | null;
  dividendYield: number | null;
  beta: number | null;

  // Derived features
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  volume: number | null;
  averageVolume: number | null;
  priceToHigh: number | null;
  priceToLow: number | null;
  priceToTarget: number | null;
  volumeRatio: number | null;

  // Momentum features (NEW)
  ma30: number | null;
  ma50: number | null;
  ma200: number | null;
  priceToMA30: number | null;
  priceToMA50: number | null;
  priceToMA200: number | null;
  rsi14: number | null;
  rsi30: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr14: number | null;
  volatility30: number | null;
  volumeMA30: number | null;
  volumeRatioMA: number | null;
  return7d: number | null;
  return30d: number | null;
  return90d: number | null;

  // Macro features (NEW)
  spxClose: number | null;
  spxReturn7d: number | null;
  spxReturn30d: number | null;
  vixClose: number | null;
  vixMA30: number | null;
  fedFundsRate: number | null;
  treasury10y: number | null;
  yieldCurve2y10y: number | null;
  fedFundsChange30d: number | null;
  treasury10yChange30d: number | null;
}

// Champion Model (Rule-Based)
function championModel(data: MegaCapTrainingData): number {
  let prediction = 0;

  // Risk score impact (-1 to 1)
  if (data.riskScore !== null) {
    prediction -= data.riskScore * 0.5;
  }

  // Sentiment score impact (-1 to 1)
  if (data.sentimentScore !== null) {
    prediction += data.sentimentScore * 0.8;
  }

  // Valuation impact (PE ratio)
  if (data.peRatio !== null && data.peRatio > 0) {
    if (data.peRatio < 15) prediction += 1.0; // Undervalued
    else if (data.peRatio > 30) prediction -= 1.0; // Overvalued
  }

  // Analyst sentiment
  if (data.analystBullishRatio !== null) {
    if (data.analystBullishRatio > 0.6) prediction += 1.5;
    else if (data.analystBullishRatio < 0.4) prediction -= 1.5;
  }

  // Price to target
  if (data.priceToTarget !== null && data.priceToTarget > 0) {
    if (data.priceToTarget < 0.9) prediction += 1.0; // Below target
    else if (data.priceToTarget > 1.1) prediction -= 1.0; // Above target
  }

  // Momentum boost (NEW)
  if (data.priceToMA30 !== null && data.priceToMA30 > 1.02) {
    prediction += 0.5; // Price above MA30 = bullish
  }
  if (data.rsi14 !== null) {
    if (data.rsi14 < 30) prediction += 0.5; // Oversold
    else if (data.rsi14 > 70) prediction -= 0.5; // Overbought
  }

  // Market context boost (NEW)
  if (data.spxReturn7d !== null && data.spxReturn7d > 2) {
    prediction += 0.3; // Rising tide lifts all boats
  }
  if (data.vixClose !== null && data.vixClose > 30) {
    prediction -= 0.3; // High volatility = caution
  }

  return prediction;
}

// Challenger 1 Model (Linear Regression with Momentum)
function linearModel(data: MegaCapTrainingData): number {
  let prediction = 0;

  // Core coefficients from previous analysis
  if (data.currentPrice !== null) prediction += data.currentPrice * -0.0078;
  if (data.epsEstimateCurrentY !== null) prediction += data.epsEstimateCurrentY * 0.0909;
  if (data.epsEstimateNextY !== null) prediction += data.epsEstimateNextY * 0.0635;
  if (data.epsActual !== null) prediction += data.epsActual * 0.0534;
  if (data.forwardPE !== null) prediction += data.forwardPE * 0.0450;
  if (data.priceToHigh !== null) prediction += data.priceToHigh * 2.7294;
  if (data.priceToLow !== null) prediction += data.priceToLow * 0.5406;
  if (data.riskScore !== null) prediction += data.riskScore * 0.0716;
  if (data.dividendYield !== null) prediction += data.dividendYield * -0.1071;

  // Momentum coefficients (NEW - to be optimized)
  if (data.priceToMA30 !== null) prediction += (data.priceToMA30 - 1) * 5.0;
  if (data.rsi14 !== null) prediction += (data.rsi14 - 50) * 0.05;
  if (data.macdHistogram !== null) prediction += data.macdHistogram * 0.3;
  if (data.volatility30 !== null) prediction += data.volatility30 * -0.2;
  if (data.return30d !== null) prediction += data.return30d * 0.15;

  // Macro coefficients (NEW - to be optimized)
  if (data.spxReturn7d !== null) prediction += data.spxReturn7d * 0.25;
  if (data.vixClose !== null) prediction += (data.vixClose - 20) * -0.05;

  return prediction;
}

// Ensemble Model: Route by filing type
function ensembleModel(data: MegaCapTrainingData): number {
  if (data.filingType === '10-K') {
    return championModel(data);
  } else {
    return linearModel(data);
  }
}

async function extractMegaCapTrainingData(): Promise<MegaCapTrainingData[]> {
  console.log('📊 Extracting mega-cap training data with momentum features...\n');

  const filings = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null },
    },
    include: {
      company: {
        include: {
          snapshots: {
            where: {
              snapshotDate: {
                lte: new Date(),
              },
            },
            orderBy: { snapshotDate: 'desc' },
            take: 1,
          },
        },
      },
    },
    orderBy: { filingDate: 'asc' },
  });

  const trainingData: MegaCapTrainingData[] = [];

  for (const filing of filings) {
    const snapshot = filing.company.snapshots[0];
    if (!snapshot) continue;

    // Filter to mega-caps only (>$500B)
    const marketCap = snapshot.marketCap;
    if (!marketCap || marketCap < 500_000_000_000) continue;

    // Get technical indicators for this filing date
    const technicalIndicators = await prisma.technicalIndicators.findFirst({
      where: {
        ticker: filing.company.ticker,
        date: {
          lte: filing.filingDate,
        },
      },
      orderBy: { date: 'desc' },
    });

    // Get macro indicators for this filing date
    const macroIndicators = await prisma.macroIndicators.findFirst({
      where: {
        date: {
          lte: filing.filingDate,
        },
      },
      orderBy: { date: 'desc' },
    });

    const analysisData = filing.analysisData as any;

    const dataPoint: MegaCapTrainingData = {
      actual7dReturn: filing.actual7dReturn!,
      filingType: filing.filingType,
      riskScore: analysisData?.riskScore ?? null,
      sentimentScore: analysisData?.sentimentScore ?? null,

      // Company fundamentals
      marketCap: snapshot.marketCap,
      currentPrice: snapshot.currentPrice,
      peRatio: snapshot.peRatio,
      forwardPE: snapshot.forwardPE,
      analystRatingCount: snapshot.analystRatingCount,
      analystTargetPrice: snapshot.analystTargetPrice,
      analystBuyCount: snapshot.analystBuyCount,
      analystHoldCount: snapshot.analystHoldCount,
      analystSellCount: snapshot.analystSellCount,
      analystBullishRatio:
        snapshot.analystBuyCount && snapshot.analystRatingCount
          ? snapshot.analystBuyCount / snapshot.analystRatingCount
          : null,
      epsActual: snapshot.epsActual,
      epsEstimateCurrentQ: snapshot.epsEstimateCurrentQ,
      epsEstimateCurrentY: snapshot.epsEstimateCurrentY,
      epsEstimateNextQ: snapshot.epsEstimateNextQ,
      epsEstimateNextY: snapshot.epsEstimateNextY,
      revenueEstimateCurrentQ: snapshot.revenueEstimateCurrentQ,
      revenueEstimateCurrentY: snapshot.revenueEstimateCurrentY,
      dividendYield: snapshot.dividendYield,
      beta: snapshot.beta,

      // Derived features
      fiftyTwoWeekHigh: snapshot.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: snapshot.fiftyTwoWeekLow,
      volume: snapshot.volume,
      averageVolume: snapshot.averageVolume,
      priceToHigh:
        snapshot.currentPrice && snapshot.fiftyTwoWeekHigh
          ? snapshot.currentPrice / snapshot.fiftyTwoWeekHigh
          : null,
      priceToLow:
        snapshot.currentPrice && snapshot.fiftyTwoWeekLow
          ? snapshot.currentPrice / snapshot.fiftyTwoWeekLow
          : null,
      priceToTarget:
        snapshot.currentPrice && snapshot.analystTargetPrice
          ? snapshot.currentPrice / snapshot.analystTargetPrice
          : null,
      volumeRatio:
        snapshot.volume && snapshot.averageVolume
          ? snapshot.volume / snapshot.averageVolume
          : null,

      // Momentum features
      ma30: technicalIndicators?.ma30 ?? null,
      ma50: technicalIndicators?.ma50 ?? null,
      ma200: technicalIndicators?.ma200 ?? null,
      priceToMA30: technicalIndicators?.priceToMA30 ?? null,
      priceToMA50: technicalIndicators?.priceToMA50 ?? null,
      priceToMA200: technicalIndicators?.priceToMA200 ?? null,
      rsi14: technicalIndicators?.rsi14 ?? null,
      rsi30: technicalIndicators?.rsi30 ?? null,
      macd: technicalIndicators?.macd ?? null,
      macdSignal: technicalIndicators?.macdSignal ?? null,
      macdHistogram: technicalIndicators?.macdHistogram ?? null,
      atr14: technicalIndicators?.atr14 ?? null,
      volatility30: technicalIndicators?.volatility30 ?? null,
      volumeMA30: technicalIndicators?.volumeMA30 ?? null,
      volumeRatioMA: technicalIndicators?.volumeRatio ?? null,
      return7d: technicalIndicators?.return7d ?? null,
      return30d: technicalIndicators?.return30d ?? null,
      return90d: technicalIndicators?.return90d ?? null,

      // Macro features
      spxClose: macroIndicators?.spxClose ?? null,
      spxReturn7d: macroIndicators?.spxReturn7d ?? null,
      spxReturn30d: macroIndicators?.spxReturn30d ?? null,
      vixClose: macroIndicators?.vixClose ?? null,
      vixMA30: macroIndicators?.vixMA30 ?? null,
      fedFundsRate: macroIndicators?.fedFundsRate ?? null,
      treasury10y: macroIndicators?.treasury10y ?? null,
      yieldCurve2y10y: macroIndicators?.yieldCurve2y10y ?? null,
      fedFundsChange30d: macroIndicators?.fedFundsChange30d ?? null,
      treasury10yChange30d: macroIndicators?.treasury10yChange30d ?? null,
    };

    trainingData.push(dataPoint);
  }

  console.log(`✅ Extracted ${trainingData.length} mega-cap samples\n`);

  // Show feature completeness for momentum/macro
  const momentumComplete = trainingData.filter(d => d.ma30 !== null).length;
  const macroComplete = trainingData.filter(d => d.spxReturn7d !== null).length;

  console.log('📈 Enhanced Feature Completeness:');
  console.log(`  Momentum features: ${momentumComplete}/${trainingData.length} (${((momentumComplete / trainingData.length) * 100).toFixed(1)}%)`);
  console.log(`  Macro features: ${macroComplete}/${trainingData.length} (${((macroComplete / trainingData.length) * 100).toFixed(1)}%)`);
  console.log('');

  return trainingData;
}

function evaluateModel(
  name: string,
  predictFn: (data: MegaCapTrainingData) => number,
  data: MegaCapTrainingData[]
): {
  name: string;
  directionAccuracy: number;
  mae: number;
  accuracyByFilingType: Record<string, number>;
} {
  let correct = 0;
  let totalError = 0;
  const byFilingType: Record<string, { correct: number; total: number }> = {};

  for (const sample of data) {
    const prediction = predictFn(sample);
    const actual = sample.actual7dReturn;

    const predictedDirection = prediction > 0 ? 'up' : 'down';
    const actualDirection = actual > 0 ? 'up' : 'down';

    if (predictedDirection === actualDirection) {
      correct++;
    }

    totalError += Math.abs(prediction - actual);

    // Track by filing type
    if (!byFilingType[sample.filingType]) {
      byFilingType[sample.filingType] = { correct: 0, total: 0 };
    }
    byFilingType[sample.filingType].total++;
    if (predictedDirection === actualDirection) {
      byFilingType[sample.filingType].correct++;
    }
  }

  const accuracyByFilingType: Record<string, number> = {};
  for (const [type, stats] of Object.entries(byFilingType)) {
    accuracyByFilingType[type] = (stats.correct / stats.total) * 100;
  }

  return {
    name,
    directionAccuracy: (correct / data.length) * 100,
    mae: totalError / data.length,
    accuracyByFilingType,
  };
}

async function main() {
  console.log('🏁 Starting Mega-Cap Model Optimization\n');
  console.log('═'.repeat(80));
  console.log('');

  // Extract training data
  const trainingData = await extractMegaCapTrainingData();

  if (trainingData.length < 10) {
    console.log('⚠️  Insufficient mega-cap samples. Need at least 10.\n');
    return;
  }

  console.log('🏆 Testing Models on Mega-Cap Stocks (>$500B)\n');
  console.log('═'.repeat(80));
  console.log('');

  // Test each model
  const championResults = evaluateModel('Champion (Rule-Based)', championModel, trainingData);
  const linearResults = evaluateModel('Challenger 1 (Linear + Momentum)', linearModel, trainingData);
  const ensembleResults = evaluateModel('Ensemble (Champion for 10-K, Linear for 10-Q/8-K)', ensembleModel, trainingData);

  // Print results
  console.log('');
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('           MEGA-CAP MODEL OPTIMIZATION RESULTS');
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Dataset: ${trainingData.length} mega-cap filings (market cap >$500B)`);
  console.log('');
  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log('1. OVERALL PERFORMANCE');
  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log('');
  console.log(
    `${'Model'.padEnd(40)} ${'Accuracy'.padEnd(12)} ${'MAE'.padEnd(10)}`
  );
  console.log('─'.repeat(80));

  for (const result of [championResults, linearResults, ensembleResults]) {
    console.log(
      `${result.name.padEnd(40)} ${result.directionAccuracy.toFixed(1).padEnd(12)}% ${result.mae.toFixed(3).padEnd(10)}`
    );
  }

  console.log('');
  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log('2. PERFORMANCE BY FILING TYPE');
  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log('');

  const filingTypes = ['10-K', '10-Q', '8-K'];
  for (const filingType of filingTypes) {
    console.log(`${filingType}:`);
    console.log(`  Champion:         ${(championResults.accuracyByFilingType[filingType] || 0).toFixed(1)}%`);
    console.log(`  Linear+Momentum:  ${(linearResults.accuracyByFilingType[filingType] || 0).toFixed(1)}%`);
    console.log(`  Ensemble:         ${(ensembleResults.accuracyByFilingType[filingType] || 0).toFixed(1)}%`);
    console.log('');
  }

  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('3. RECOMMENDATION');
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Determine best model
  const models = [championResults, linearResults, ensembleResults];
  models.sort((a, b) => b.directionAccuracy - a.directionAccuracy);

  console.log(`🥇 Best Model: ${models[0].name}`);
  console.log(`   Direction Accuracy: ${models[0].directionAccuracy.toFixed(1)}%`);
  console.log(`   Mean Absolute Error: ${models[0].mae.toFixed(3)}%`);
  console.log('');

  if (ensembleResults.directionAccuracy > Math.max(championResults.directionAccuracy, linearResults.directionAccuracy)) {
    console.log('✅ RECOMMENDATION: Deploy Ensemble Model');
    console.log('   The ensemble routing strategy provides the best overall accuracy');
    console.log('   by leveraging Champion for 10-K and Linear for 10-Q/8-K filings.');
  } else if (ensembleResults.directionAccuracy >= 65) {
    console.log('✅ RECOMMENDATION: Deploy Ensemble Model');
    console.log('   The ensemble achieves the target 65%+ accuracy for mega-caps.');
  } else {
    console.log('⚠️  TARGET NOT MET: Need to reach 65-70% mega-cap accuracy');
    console.log('   Consider:');
    console.log('   - Optimizing momentum feature coefficients');
    console.log('   - Adding sector-specific features');
    console.log('   - Collecting more macro indicator data');
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
