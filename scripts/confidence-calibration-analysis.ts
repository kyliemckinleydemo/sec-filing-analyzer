/**
 * Confidence Calibration Analysis
 *
 * Calculate confidence scores for predictions based on:
 * 1. Feature completeness (more complete data = higher confidence)
 * 2. Historical accuracy in similar scenarios
 * 3. Model certainty (distance from decision boundary)
 * 4. Market cap segment (mega-caps more predictable)
 * 5. Volatility (lower volatility = higher confidence)
 */

import { prisma } from '../lib/prisma';
import * as fs from 'fs';

interface ConfidenceFactors {
  featureCompleteness: number; // 0-1
  historicalAccuracy: number; // 0-1 (segment-specific)
  modelCertainty: number; // 0-1 (how strong the signal)
  volatility: number; // 0-1 (inverse volatility)
  marketCapBonus: number; // 0-0.2 (mega/mid boost)
}

interface PredictionWithConfidence {
  ticker: string;
  filingDate: Date;
  filingType: string;
  marketCap: number;

  // Prediction
  predicted7dReturn: number;
  actual7dReturn: number;

  // Accuracy
  directionCorrect: boolean;
  absoluteError: number;

  // Confidence components
  confidence: ConfidenceFactors;
  overallConfidence: number; // 0-100
  confidenceBucket: 'high' | 'medium' | 'low';

  // Feature info
  featuresUsed: string[];
  featuresMissing: string[];
}

async function main() {
  console.log('🎯 Confidence Calibration Analysis\n');
  console.log('═'.repeat(80));
  console.log('');

  // Get all filings with predictions
  const filings = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null },
      analysisData: { not: null },
    },
    include: {
      company: {
        include: {
          snapshots: {
            orderBy: { snapshotDate: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  console.log(`📊 Analyzing ${filings.length} filings for confidence calibration\n`);

  const predictions: PredictionWithConfidence[] = [];

  for (const filing of filings) {
    const snapshot = filing.company.snapshots[0];
    if (!snapshot) continue;

    const analysisData = filing.analysisData as any;

    // Calculate champion model prediction
    const prediction = calculateChampionPrediction(snapshot, analysisData);

    // Get technical indicators
    const technical = await prisma.technicalIndicators.findFirst({
      where: {
        ticker: filing.company.ticker,
        date: { lte: filing.filingDate },
      },
      orderBy: { date: 'desc' },
    });

    // Get macro
    const macro = await prisma.macroIndicators.findFirst({
      where: { date: { lte: filing.filingDate } },
      orderBy: { date: 'desc' },
    });

    // Calculate confidence
    const confidence = calculateConfidence(snapshot, analysisData, technical, macro);

    const result: PredictionWithConfidence = {
      ticker: filing.company.ticker,
      filingDate: filing.filingDate,
      filingType: filing.filingType,
      marketCap: snapshot.marketCap || 0,
      predicted7dReturn: prediction.value,
      actual7dReturn: filing.actual7dReturn!,
      directionCorrect:
        (prediction.value > 0 && filing.actual7dReturn! > 0) ||
        (prediction.value < 0 && filing.actual7dReturn! < 0),
      absoluteError: Math.abs(prediction.value - filing.actual7dReturn!),
      confidence: confidence.factors,
      overallConfidence: confidence.score,
      confidenceBucket: confidence.bucket,
      featuresUsed: prediction.featuresUsed,
      featuresMissing: prediction.featuresMissing,
    };

    predictions.push(result);
  }

  // Analyze confidence calibration
  const report = analyzeCalibration(predictions);

  console.log(report);

  // Save detailed results
  fs.writeFileSync(
    'confidence-calibration-results.json',
    JSON.stringify(predictions, null, 2)
  );

  fs.writeFileSync(
    'confidence-calibration-report.txt',
    report
  );

  console.log('\n📄 Detailed results saved to: confidence-calibration-results.json');
  console.log('📄 Report saved to: confidence-calibration-report.txt\n');

  await prisma.$disconnect();
}

function calculateChampionPrediction(snapshot: any, analysisData: any) {
  let prediction = 0;
  const featuresUsed: string[] = [];
  const featuresMissing: string[] = [];

  // Risk score
  if (analysisData?.riskScore !== null) {
    prediction -= analysisData.riskScore * 0.5;
    featuresUsed.push('riskScore');
  } else {
    featuresMissing.push('riskScore');
  }

  // Sentiment
  if (analysisData?.sentimentScore !== null) {
    prediction += analysisData.sentimentScore * 0.8;
    featuresUsed.push('sentimentScore');
  } else {
    featuresMissing.push('sentimentScore');
  }

  // PE ratio
  if (snapshot.peRatio !== null && snapshot.peRatio > 0) {
    if (snapshot.peRatio < 15) prediction += 1.0;
    else if (snapshot.peRatio > 30) prediction -= 1.0;
    featuresUsed.push('peRatio');
  } else {
    featuresMissing.push('peRatio');
  }

  // Analyst bullish ratio
  if (snapshot.analystBuyCount && snapshot.analystRatingCount) {
    const ratio = snapshot.analystBuyCount / snapshot.analystRatingCount;
    if (ratio > 0.6) prediction += 1.5;
    else if (ratio < 0.4) prediction -= 1.5;
    featuresUsed.push('analystBullishRatio');
  } else {
    featuresMissing.push('analystBullishRatio');
  }

  // Price to target
  if (snapshot.currentPrice && snapshot.analystTargetPrice) {
    const ratio = snapshot.currentPrice / snapshot.analystTargetPrice;
    if (ratio < 0.9) prediction += 1.0;
    else if (ratio > 1.1) prediction -= 1.0;
    featuresUsed.push('priceToTarget');
  } else {
    featuresMissing.push('priceToTarget');
  }

  return {
    value: prediction,
    featuresUsed,
    featuresMissing,
  };
}

function calculateConfidence(
  snapshot: any,
  analysisData: any,
  technical: any,
  macro: any
): { score: number; bucket: 'high' | 'medium' | 'low'; factors: ConfidenceFactors } {
  // 1. Feature completeness (40% weight)
  const coreFeatures = [
    analysisData?.riskScore,
    analysisData?.sentimentScore,
    snapshot.peRatio,
    snapshot.currentPrice,
    snapshot.marketCap,
  ];
  const coreComplete = coreFeatures.filter(f => f !== null && f !== undefined).length / coreFeatures.length;

  const analystFeatures = [
    snapshot.analystTargetPrice,
    snapshot.analystBuyCount,
    snapshot.analystRatingCount,
  ];
  const analystComplete = analystFeatures.filter(f => f !== null && f !== undefined).length / analystFeatures.length;

  const momentumComplete = technical ? 1.0 : 0.0;
  const macroComplete = macro ? 1.0 : 0.0;

  const featureCompleteness = (
    coreComplete * 0.5 +
    analystComplete * 0.25 +
    momentumComplete * 0.15 +
    macroComplete * 0.10
  );

  // 2. Historical accuracy for this segment (30% weight)
  const marketCap = snapshot.marketCap || 0;
  let historicalAccuracy = 0.51; // baseline

  if (marketCap >= 500_000_000_000) {
    historicalAccuracy = 0.58; // mega-cap
  } else if (marketCap >= 50_000_000_000) {
    historicalAccuracy = 0.56; // mid-cap
  } else {
    historicalAccuracy = 0.45; // small-cap
  }

  // 3. Model certainty (20% weight) - how strong is the signal?
  let modelCertainty = 0.5; // neutral

  // Strong signals increase certainty
  if (analysisData?.sentimentScore) {
    const sentimentStrength = Math.abs(analysisData.sentimentScore);
    modelCertainty = Math.max(modelCertainty, sentimentStrength);
  }

  // Analyst consensus
  if (snapshot.analystBuyCount && snapshot.analystRatingCount) {
    const ratio = snapshot.analystBuyCount / snapshot.analystRatingCount;
    if (ratio > 0.7 || ratio < 0.3) {
      modelCertainty = Math.max(modelCertainty, 0.8); // Strong consensus
    }
  }

  // 4. Volatility (10% weight) - lower volatility = higher confidence
  let volatilityScore = 0.5;
  if (technical?.volatility30) {
    // Invert: high volatility = low confidence
    // Typical volatility: 20-40%
    volatilityScore = Math.max(0, 1 - (technical.volatility30 / 40));
  }

  // 5. Market cap bonus (extra boost for mega/mid caps)
  let marketCapBonus = 0;
  if (marketCap >= 500_000_000_000) {
    marketCapBonus = 0.15; // mega-cap bonus
  } else if (marketCap >= 50_000_000_000 && marketCap < 200_000_000_000) {
    marketCapBonus = 0.10; // mid-cap bonus
  }

  // Calculate overall confidence (0-100 scale)
  const rawScore =
    featureCompleteness * 0.40 +
    historicalAccuracy * 0.30 +
    modelCertainty * 0.20 +
    volatilityScore * 0.10 +
    marketCapBonus;

  const confidenceScore = Math.min(100, Math.max(0, rawScore * 100));

  // Bucket
  let bucket: 'high' | 'medium' | 'low';
  if (confidenceScore >= 65) bucket = 'high';
  else if (confidenceScore >= 50) bucket = 'medium';
  else bucket = 'low';

  return {
    score: confidenceScore,
    bucket,
    factors: {
      featureCompleteness,
      historicalAccuracy,
      modelCertainty,
      volatility: volatilityScore,
      marketCapBonus,
    },
  };
}

function analyzeCalibration(predictions: PredictionWithConfidence[]): string {
  let report = '\n';
  report += '═'.repeat(80) + '\n';
  report += '           CONFIDENCE CALIBRATION ANALYSIS\n';
  report += '═'.repeat(80) + '\n\n';

  // Group by confidence bucket
  const high = predictions.filter(p => p.confidenceBucket === 'high');
  const medium = predictions.filter(p => p.confidenceBucket === 'medium');
  const low = predictions.filter(p => p.confidenceBucket === 'low');

  report += `Total predictions: ${predictions.length}\n`;
  report += `  High confidence (65-100):   ${high.length} predictions\n`;
  report += `  Medium confidence (50-64):  ${medium.length} predictions\n`;
  report += `  Low confidence (0-49):      ${low.length} predictions\n\n`;

  report += '─'.repeat(80) + '\n';
  report += '1. CALIBRATION BY CONFIDENCE LEVEL\n';
  report += '─'.repeat(80) + '\n\n';

  report += 'Is our confidence score well-calibrated?\n';
  report += '(High confidence should = high accuracy)\n\n';

  for (const [bucket, preds] of [['High', high], ['Medium', medium], ['Low', low]] as const) {
    if (preds.length === 0) continue;

    const correct = preds.filter(p => p.directionCorrect).length;
    const accuracy = (correct / preds.length) * 100;
    const avgError = preds.reduce((sum, p) => sum + p.absoluteError, 0) / preds.length;
    const avgConfidence = preds.reduce((sum, p) => sum + p.overallConfidence, 0) / preds.length;

    report += `${bucket} Confidence:\n`;
    report += `  Samples:          ${preds.length}\n`;
    report += `  Avg Confidence:   ${avgConfidence.toFixed(1)}\n`;
    report += `  Direction Acc:    ${accuracy.toFixed(1)}%\n`;
    report += `  Avg Error:        ${avgError.toFixed(2)}%\n`;
    report += `  Calibration:      ${accuracy >= avgConfidence ? '✅ Well-calibrated' : '⚠️ Over-confident'}\n\n`;
  }

  report += '─'.repeat(80) + '\n';
  report += '2. CONFIDENCE FACTORS ANALYSIS\n';
  report += '─'.repeat(80) + '\n\n';

  // Analyze what drives confidence
  const highAccuracy = predictions.filter(p => p.directionCorrect);
  const lowAccuracy = predictions.filter(p => !p.directionCorrect);

  const avgHighConf = highAccuracy.reduce((sum, p) => sum + p.overallConfidence, 0) / highAccuracy.length;
  const avgLowConf = lowAccuracy.reduce((sum, p) => sum + p.overallConfidence, 0) / lowAccuracy.length;

  report += `Correct predictions avg confidence: ${avgHighConf.toFixed(1)}\n`;
  report += `Incorrect predictions avg confidence: ${avgLowConf.toFixed(1)}\n`;
  report += `Difference: ${(avgHighConf - avgLowConf).toFixed(1)} points\n\n`;

  // Feature completeness analysis
  const avgCompleteCorrect = highAccuracy.reduce((sum, p) => sum + p.confidence.featureCompleteness, 0) / highAccuracy.length;
  const avgCompleteIncorrect = lowAccuracy.reduce((sum, p) => sum + p.confidence.featureCompleteness, 0) / lowAccuracy.length;

  report += 'Feature Completeness:\n';
  report += `  Correct predictions:   ${(avgCompleteCorrect * 100).toFixed(1)}%\n`;
  report += `  Incorrect predictions: ${(avgCompleteIncorrect * 100).toFixed(1)}%\n`;
  report += `  Impact: ${((avgCompleteCorrect - avgCompleteIncorrect) * 100).toFixed(1)} points\n\n`;

  report += '─'.repeat(80) + '\n';
  report += '3. CONFIDENCE BY MARKET CAP\n';
  report += '─'.repeat(80) + '\n\n';

  const megaCap = predictions.filter(p => p.marketCap >= 500_000_000_000);
  const largeCap = predictions.filter(p => p.marketCap >= 200_000_000_000 && p.marketCap < 500_000_000_000);
  const midCap = predictions.filter(p => p.marketCap >= 50_000_000_000 && p.marketCap < 200_000_000_000);
  const smallCap = predictions.filter(p => p.marketCap < 50_000_000_000);

  for (const [name, preds] of [
    ['Mega-Cap (>$500B)', megaCap],
    ['Large-Cap ($200-500B)', largeCap],
    ['Mid-Cap ($50-200B)', midCap],
    ['Small-Cap (<$50B)', smallCap],
  ] as const) {
    if (preds.length === 0) continue;

    const correct = preds.filter(p => p.directionCorrect).length;
    const accuracy = (correct / preds.length) * 100;
    const avgConf = preds.reduce((sum, p) => sum + p.overallConfidence, 0) / preds.length;
    const avgError = preds.reduce((sum, p) => sum + p.absoluteError, 0) / preds.length;

    report += `${name}:\n`;
    report += `  Samples:        ${preds.length}\n`;
    report += `  Avg Confidence: ${avgConf.toFixed(1)}\n`;
    report += `  Direction Acc:  ${accuracy.toFixed(1)}%\n`;
    report += `  Avg Error:      ${avgError.toFixed(2)}%\n\n`;
  }

  report += '═'.repeat(80) + '\n';
  report += '4. RECOMMENDATIONS FOR UI\n';
  report += '═'.repeat(80) + '\n\n';

  const calibrationGap = Math.abs(
    (high.filter(p => p.directionCorrect).length / high.length * 100) -
    (high.reduce((sum, p) => sum + p.overallConfidence, 0) / high.length)
  );

  if (calibrationGap < 5) {
    report += '✅ WELL-CALIBRATED: Confidence scores match actual accuracy\n\n';
    report += 'Recommended UI messaging:\n';
    report += '- High confidence (65+): "High confidence prediction based on complete data"\n';
    report += '- Medium confidence (50-64): "Moderate confidence prediction"\n';
    report += '- Low confidence (<50): "Low confidence - limited data available"\n\n';
  } else {
    report += '⚠️  RECALIBRATION NEEDED: Confidence scores do not match accuracy\n\n';
    report += 'Recommended actions:\n';
    report += '1. Adjust confidence threshold boundaries\n';
    report += '2. Re-weight confidence factors\n';
    report += '3. Add more historical data for calibration\n\n';
  }

  report += 'Confidence Score Formula:\n';
  report += '  = 0.40 × Feature Completeness\n';
  report += '  + 0.30 × Historical Accuracy (segment)\n';
  report += '  + 0.20 × Model Certainty (signal strength)\n';
  report += '  + 0.10 × Volatility Score (inverse)\n';
  report += '  + Bonus for Mega/Mid-caps\n\n';

  report += '═'.repeat(80) + '\n\n';

  return report;
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
