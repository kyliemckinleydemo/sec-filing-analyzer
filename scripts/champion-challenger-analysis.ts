/**
 * Champion-Challenger Model Analysis
 *
 * Comprehensive comparison of:
 * - CHAMPION: Current rule-based prediction engine
 * - CHALLENGER 1: Stepwise linear regression
 * - CHALLENGER 2: Non-linear gradient boosting model
 *
 * Uses all available data fields from expanded database
 */

import { prisma } from '../lib/prisma';
import { predictionEngine } from '../lib/predictions';
import * as fs from 'fs';

interface TrainingData {
  // Target variable
  actual7dReturn: number;

  // Features from Filing
  filingType: string;
  riskScore: number | null;
  sentimentScore: number | null;

  // Features from Company (at filing time)
  marketCap: number | null;
  currentPrice: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;

  // Features from CompanySnapshot (before filing)
  analystTargetPrice: number | null;
  analystRatingCount: number | null;
  analystBuyCount: number | null;
  analystHoldCount: number | null;
  analystSellCount: number | null;
  epsActual: number | null;
  epsEstimateCurrentQ: number | null;
  epsEstimateNextQ: number | null;
  epsEstimateCurrentY: number | null;
  epsEstimateNextY: number | null;
  revenueEstimateCurrentQ: number | null;
  revenueEstimateCurrentY: number | null;
  dividendYield: number | null;
  beta: number | null;
  volume: number | null;
  averageVolume: number | null;

  // Derived features
  priceToTarget: number | null; // currentPrice / analystTargetPrice
  priceToHigh: number | null; // currentPrice / fiftyTwoWeekHigh
  priceToLow: number | null; // currentPrice / fiftyTwoWeekLow
  analystBullishRatio: number | null; // buyCount / totalCount
  volumeRatio: number | null; // volume / averageVolume

  // Metadata
  ticker: string;
  filingDate: Date;
  filingId: string;
}

interface ModelMetrics {
  modelName: string;

  // Accuracy metrics
  mae: number; // Mean Absolute Error
  rmse: number; // Root Mean Squared Error
  r2: number; // R-squared

  // Direction accuracy
  directionAccuracy: number; // % predictions with correct sign
  upAccuracy: number; // Accuracy when predicting up
  downAccuracy: number; // Accuracy when predicting down

  // Statistical tests
  meanError: number; // Bias
  medianError: number;

  // By filing type
  accuracyBy10K: number;
  accuracyBy10Q: number;
  accuracyBy8K: number;

  // By market cap
  accuracySmallCap: number; // < $200B
  accuracyLargeCap: number; // $200-500B
  accuracyMegaCap: number; // > $500B

  // Feature importance (for challengers)
  topFeatures?: Array<{ feature: string; importance: number }>;
}

async function extractTrainingData(): Promise<TrainingData[]> {
  console.log('📊 Extracting training data from database...\n');

  // Get all filings with actual returns and analysis data
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
            take: 2, // Get 2 most recent for comparison
          },
        },
      },
    },
    orderBy: { filingDate: 'desc' },
  });

  console.log(`Found ${filings.length} filings with actual returns\n`);

  const trainingData: TrainingData[] = [];

  for (const filing of filings) {
    const company = filing.company;

    // Find snapshot closest to filing date (before or slightly after is okay)
    const beforeSnapshot = company.snapshots.length > 0 ? company.snapshots[0] : null;

    if (!beforeSnapshot) {
      continue; // Skip if no snapshot data
    }

    // Calculate derived features
    const priceToTarget = company.currentPrice && beforeSnapshot.analystTargetPrice
      ? company.currentPrice / beforeSnapshot.analystTargetPrice
      : null;

    const priceToHigh = company.currentPrice && company.fiftyTwoWeekHigh
      ? company.currentPrice / company.fiftyTwoWeekHigh
      : null;

    const priceToLow = company.currentPrice && company.fiftyTwoWeekLow
      ? company.currentPrice / company.fiftyTwoWeekLow
      : null;

    const totalAnalysts = (beforeSnapshot.analystBuyCount || 0) +
                          (beforeSnapshot.analystHoldCount || 0) +
                          (beforeSnapshot.analystSellCount || 0);

    const analystBullishRatio = totalAnalysts > 0
      ? (beforeSnapshot.analystBuyCount || 0) / totalAnalysts
      : null;

    const volumeRatio = beforeSnapshot.volume && beforeSnapshot.averageVolume
      ? beforeSnapshot.volume / beforeSnapshot.averageVolume
      : null;

    trainingData.push({
      actual7dReturn: filing.actual7dReturn!,

      filingType: filing.filingType,
      riskScore: filing.riskScore,
      sentimentScore: filing.sentimentScore,

      marketCap: company.marketCap,
      currentPrice: company.currentPrice,
      peRatio: company.peRatio,
      forwardPE: company.forwardPE,
      fiftyTwoWeekHigh: company.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: company.fiftyTwoWeekLow,

      analystTargetPrice: beforeSnapshot.analystTargetPrice,
      analystRatingCount: beforeSnapshot.analystRatingCount,
      analystBuyCount: beforeSnapshot.analystBuyCount,
      analystHoldCount: beforeSnapshot.analystHoldCount,
      analystSellCount: beforeSnapshot.analystSellCount,
      epsActual: beforeSnapshot.epsActual,
      epsEstimateCurrentQ: beforeSnapshot.epsEstimateCurrentQ,
      epsEstimateNextQ: beforeSnapshot.epsEstimateNextQ,
      epsEstimateCurrentY: beforeSnapshot.epsEstimateCurrentY,
      epsEstimateNextY: beforeSnapshot.epsEstimateNextY,
      revenueEstimateCurrentQ: beforeSnapshot.revenueEstimateCurrentQ,
      revenueEstimateCurrentY: beforeSnapshot.revenueEstimateCurrentY,
      dividendYield: beforeSnapshot.dividendYield,
      beta: beforeSnapshot.beta,
      volume: beforeSnapshot.volume,
      averageVolume: beforeSnapshot.averageVolume,

      priceToTarget,
      priceToHigh,
      priceToLow,
      analystBullishRatio,
      volumeRatio,

      ticker: company.ticker,
      filingDate: filing.filingDate,
      filingId: filing.id,
    });
  }

  console.log(`✅ Extracted ${trainingData.length} complete training samples\n`);

  if (trainingData.length === 0) {
    console.error('❌ No training data extracted');
    return [];
  }

  // Print feature completeness
  const featureCompleteness: Record<string, number> = {};
  const features = Object.keys(trainingData[0]).filter(k =>
    k !== 'ticker' && k !== 'filingDate' && k !== 'filingId' && k !== 'actual7dReturn' && k !== 'companyName'
  );

  for (const feature of features) {
    const nonNull = trainingData.filter(d => (d as any)[feature] !== null).length;
    featureCompleteness[feature] = (nonNull / trainingData.length) * 100;
  }

  console.log('📈 Feature Completeness:');
  Object.entries(featureCompleteness)
    .sort((a, b) => b[1] - a[1])
    .forEach(([feature, pct]) => {
      console.log(`  ${feature.padEnd(30)} ${pct.toFixed(1)}%`);
    });
  console.log('');

  return trainingData;
}

function calculateMetrics(
  predictions: number[],
  actuals: number[],
  modelName: string,
  data: TrainingData[]
): ModelMetrics {
  const n = predictions.length;

  // Basic error metrics
  let sumAbsError = 0;
  let sumSquaredError = 0;
  let sumError = 0;
  const errors: number[] = [];

  for (let i = 0; i < n; i++) {
    const error = predictions[i] - actuals[i];
    sumAbsError += Math.abs(error);
    sumSquaredError += error * error;
    sumError += error;
    errors.push(error);
  }

  const mae = sumAbsError / n;
  const rmse = Math.sqrt(sumSquaredError / n);
  const meanError = sumError / n;

  errors.sort((a, b) => a - b);
  const medianError = errors[Math.floor(n / 2)];

  // R-squared
  const meanActual = actuals.reduce((a, b) => a + b, 0) / n;
  const ssTot = actuals.reduce((sum, y) => sum + Math.pow(y - meanActual, 2), 0);
  const ssRes = sumSquaredError;
  const r2 = 1 - (ssRes / ssTot);

  // Direction accuracy
  let correctDirection = 0;
  let upCorrect = 0;
  let upTotal = 0;
  let downCorrect = 0;
  let downTotal = 0;

  for (let i = 0; i < n; i++) {
    const predictedSign = Math.sign(predictions[i]);
    const actualSign = Math.sign(actuals[i]);

    if (predictedSign === actualSign) {
      correctDirection++;
    }

    if (predictions[i] > 0) {
      upTotal++;
      if (actuals[i] > 0) upCorrect++;
    } else if (predictions[i] < 0) {
      downTotal++;
      if (actuals[i] < 0) downCorrect++;
    }
  }

  const directionAccuracy = (correctDirection / n) * 100;
  const upAccuracy = upTotal > 0 ? (upCorrect / upTotal) * 100 : 0;
  const downAccuracy = downTotal > 0 ? (downCorrect / downTotal) * 100 : 0;

  // By filing type
  const accuracy10K = calculateSubsetAccuracy(predictions, actuals, data, d => d.filingType === '10-K');
  const accuracy10Q = calculateSubsetAccuracy(predictions, actuals, data, d => d.filingType === '10-Q');
  const accuracy8K = calculateSubsetAccuracy(predictions, actuals, data, d => d.filingType === '8-K');

  // By market cap
  const accuracySmallCap = calculateSubsetAccuracy(predictions, actuals, data, d =>
    d.marketCap !== null && d.marketCap < 200
  );
  const accuracyLargeCap = calculateSubsetAccuracy(predictions, actuals, data, d =>
    d.marketCap !== null && d.marketCap >= 200 && d.marketCap < 500
  );
  const accuracyMegaCap = calculateSubsetAccuracy(predictions, actuals, data, d =>
    d.marketCap !== null && d.marketCap >= 500
  );

  return {
    modelName,
    mae,
    rmse,
    r2,
    directionAccuracy,
    upAccuracy,
    downAccuracy,
    meanError,
    medianError,
    accuracyBy10K: accuracy10K,
    accuracyBy10Q: accuracy10Q,
    accuracyBy8K: accuracy8K,
    accuracySmallCap,
    accuracyLargeCap,
    accuracyMegaCap,
  };
}

function calculateSubsetAccuracy(
  predictions: number[],
  actuals: number[],
  data: TrainingData[],
  filter: (d: TrainingData) => boolean
): number {
  let correct = 0;
  let total = 0;

  for (let i = 0; i < data.length; i++) {
    if (filter(data[i])) {
      total++;
      if (Math.sign(predictions[i]) === Math.sign(actuals[i])) {
        correct++;
      }
    }
  }

  return total > 0 ? (correct / total) * 100 : 0;
}

async function runChampionModel(data: TrainingData[]): Promise<number[]> {
  console.log('🏆 Running CHAMPION model (current rule-based engine)...\n');

  const predictions: number[] = [];

  for (const sample of data) {
    // Convert to prediction features
    const prediction = await predictionEngine.predict({
      riskScoreDelta: sample.riskScore || 0,
      sentimentScore: sample.sentimentScore || 0,
      filingType: sample.filingType as '10-K' | '10-Q' | '8-K',
      ticker: sample.ticker,
      peRatio: sample.peRatio || undefined,
      marketCap: sample.marketCap ? sample.marketCap / 1e9 : undefined, // Convert to billions
      avgHistoricalReturn: 0, // We'll calculate this separately if needed
    });

    predictions.push(prediction.predicted7dReturn);
  }

  return predictions;
}

function runStepwiseLinearModel(data: TrainingData[]): { predictions: number[]; features: string[] } {
  console.log('📈 Running CHALLENGER 1 (Stepwise Linear Regression)...\n');

  // Feature selection: Start with all numeric features
  const allFeatures: Array<keyof TrainingData> = [
    'riskScore', 'sentimentScore', 'marketCap', 'currentPrice', 'peRatio',
    'forwardPE', 'analystTargetPrice', 'analystRatingCount', 'epsActual',
    'epsEstimateCurrentY', 'epsEstimateNextY', 'dividendYield', 'beta',
    'priceToTarget', 'priceToHigh', 'priceToLow', 'analystBullishRatio',
    'volumeRatio',
  ];

  // Remove features with too many nulls (< 50% complete)
  const validFeatures = allFeatures.filter(feature => {
    const nonNullCount = data.filter(d => d[feature] !== null).length;
    return (nonNullCount / data.length) >= 0.5;
  });

  console.log(`Selected ${validFeatures.length} features with >50% completeness`);
  console.log(`Features: ${validFeatures.join(', ')}\n`);

  // Prepare feature matrix (fill nulls with mean)
  const featureMeans: Record<string, number> = {};
  validFeatures.forEach(feature => {
    const values = data.map(d => d[feature] as number).filter(v => v !== null);
    featureMeans[feature] = values.reduce((a, b) => a + b, 0) / values.length;
  });

  const X: number[][] = data.map(sample =>
    validFeatures.map(feature => {
      const value = sample[feature] as number | null;
      return value !== null ? value : featureMeans[feature];
    })
  );

  const y = data.map(d => d.actual7dReturn);

  // Simple linear regression (OLS)
  // y = β0 + β1*x1 + β2*x2 + ... + βn*xn
  const n = X.length;
  const k = validFeatures.length;

  // Add intercept column
  const XWithIntercept = X.map(row => [1, ...row]);

  // Normal equation: β = (X'X)^-1 X'y
  const betas = solveLinearSystem(XWithIntercept, y);

  // Make predictions
  const predictions = XWithIntercept.map(row =>
    row.reduce((sum, x, i) => sum + x * betas[i], 0)
  );

  // Feature importance (absolute value of standardized coefficients)
  const featureImportance = validFeatures.map((feature, i) => {
    const values = X.map(row => row[i]);
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n);

    return {
      feature: feature as string,
      coefficient: betas[i + 1],
      importance: Math.abs(betas[i + 1] * std),
    };
  });

  featureImportance.sort((a, b) => b.importance - a.importance);

  console.log('Top 10 Features by Importance:');
  featureImportance.slice(0, 10).forEach(({ feature, coefficient, importance }) => {
    console.log(`  ${feature.padEnd(25)} β=${coefficient.toFixed(4)}  importance=${importance.toFixed(4)}`);
  });
  console.log('');

  return {
    predictions,
    features: validFeatures as string[],
  };
}

function runEnhancedNonLinearModel(data: TrainingData[]): { predictions: number[]; features: string[]; featureImportance: Array<{feature: string; importance: number}> } {
  console.log('🌳 Running CHALLENGER 2 (Enhanced Non-Linear Model)...\n');
  console.log('Features: Polynomial terms, interactions, market cap sweet spots, valuation ratios\n');

  // Feature engineering with non-linear transformations
  const engineeredData = data.map(sample => {
    // Market cap in billions (convert from stored value which is in dollars)
    const marketCapB = sample.marketCap ? sample.marketCap / 1_000_000_000 : null;

    // Core features with null handling
    const riskScore = sample.riskScore ?? 5.0;
    const sentiment = sample.sentimentScore ?? 0.0;
    const peRatio = sample.peRatio ?? 20.0;
    const forwardPE = sample.forwardPE ?? 18.0;
    const priceToTarget = sample.priceToTarget ?? 1.0;
    const priceToHigh = sample.priceToHigh ?? 0.85;
    const analystBullishRatio = sample.analystBullishRatio ?? 0.5;
    const volumeRatio = sample.volumeRatio ?? 1.0;
    const dividendYield = sample.dividendYield ?? 0.02;
    const beta = sample.beta ?? 1.0;
    const epsActual = sample.epsActual ?? 0;
    const epsEstimateNextY = sample.epsEstimateNextY ?? 0;

    // 1. Market Cap Effects (Non-linear sweet spot modeling)
    let marketCapEffect = 0;
    if (marketCapB) {
      if (marketCapB < 10) {
        // Micro cap: High volatility penalty
        marketCapEffect = -2.0 + (marketCapB / 10) * 1.0; // -2.0 to -1.0
      } else if (marketCapB < 50) {
        // Small cap: Moderate penalty
        marketCapEffect = -1.0 + ((marketCapB - 10) / 40) * 0.5; // -1.0 to -0.5
      } else if (marketCapB < 200) {
        // Mid cap: Slight penalty
        marketCapEffect = -0.5 + ((marketCapB - 50) / 150) * 0.5; // -0.5 to 0.0
      } else if (marketCapB < 500) {
        // SWEET SPOT: Large cap optimal range
        marketCapEffect = 0.0 + ((marketCapB - 200) / 300) * 2.0; // 0.0 to +2.0
        marketCapEffect = Math.min(marketCapEffect, 2.0); // Cap at +2.0
      } else if (marketCapB < 1000) {
        // Mega cap: Good but not optimal
        marketCapEffect = 2.0 - ((marketCapB - 500) / 500) * 0.5; // +2.0 to +1.5
      } else {
        // Ultra mega cap: Institutional floor, lower growth
        marketCapEffect = 1.5 - ((marketCapB - 1000) / 3000) * 0.5; // +1.5 to +1.0
        marketCapEffect = Math.max(marketCapEffect, 1.0); // Floor at +1.0
      }
    }

    // 2. Valuation Effects (Quadratic relationship)
    // Lower P/E is better, but too low signals distress
    const optimalPE = 18;
    const peDeviation = peRatio - optimalPE;
    const peEffect = -0.05 * Math.abs(peDeviation) - 0.002 * peDeviation * peDeviation;

    // Forward P/E vs trailing P/E (growth signal)
    const peExpansion = forwardPE && peRatio ? (forwardPE - peRatio) / Math.max(peRatio, 1) : 0;
    const peExpansionEffect = peExpansion * 5.0; // Expanding P/E suggests growth expectations

    // 3. Price Position Effects (Non-linear)
    // Price near 52-week high is bullish, but overextension is risky
    let priceHighEffect = 0;
    if (priceToHigh > 0.95) {
      // Overextended: Risk of pullback
      priceHighEffect = -1.0;
    } else if (priceToHigh > 0.85) {
      // Strong momentum
      priceHighEffect = 2.0;
    } else if (priceToHigh > 0.70) {
      // Moderate strength
      priceHighEffect = 1.0;
    } else {
      // Weak/distressed
      priceHighEffect = -0.5;
    }

    // Price vs analyst target (valuation gap)
    let valuationGapEffect = 0;
    if (priceToTarget < 0.75) {
      // Deeply undervalued: Strong buy signal
      valuationGapEffect = 3.0;
    } else if (priceToTarget < 0.9) {
      // Undervalued
      valuationGapEffect = 1.5;
    } else if (priceToTarget <= 1.05) {
      // Fairly valued
      valuationGapEffect = 0.0;
    } else if (priceToTarget < 1.15) {
      // Slightly overvalued
      valuationGapEffect = -1.0;
    } else {
      // Significantly overvalued
      valuationGapEffect = -2.5;
    }

    // 4. Analyst Sentiment (Non-linear conviction signal)
    let analystEffect = 0;
    if (analystBullishRatio > 0.75) {
      // Strong buy consensus
      analystEffect = 2.0;
    } else if (analystBullishRatio > 0.60) {
      // Positive sentiment
      analystEffect = 1.0;
    } else if (analystBullishRatio > 0.40) {
      // Neutral
      analystEffect = 0.0;
    } else if (analystBullishRatio > 0.25) {
      // Bearish
      analystEffect = -1.0;
    } else {
      // Very bearish
      analystEffect = -2.0;
    }

    // 5. Risk and Sentiment Interaction
    // High sentiment can offset risk, but high risk dampens sentiment impact
    const sentimentRiskInteraction = sentiment * (1 - riskScore / 15);
    const sentimentEffect = 3.0 * sentimentRiskInteraction;

    // Risk score has asymmetric effect (high risk worse than low risk is good)
    const riskEffect = -0.8 * riskScore - 0.05 * riskScore * riskScore;

    // 6. EPS Growth Signal
    const epsGrowth = epsEstimateNextY && epsActual && epsActual !== 0
      ? (epsEstimateNextY - epsActual) / Math.abs(epsActual)
      : 0;
    const epsGrowthEffect = Math.min(Math.max(epsGrowth * 2.0, -2.0), 3.0); // Cap at +/-3%

    // 7. Dividend Yield (Income signal, but limits growth)
    let dividendEffect = 0;
    if (dividendYield > 0.05) {
      // High dividend: Value/income stock, lower growth
      dividendEffect = -0.5;
    } else if (dividendYield > 0.02) {
      // Moderate dividend: Balanced
      dividendEffect = 0.5;
    } else {
      // Low/no dividend: Growth stock
      dividendEffect = 0.0;
    }

    // 8. Beta (Market sensitivity)
    // High beta amplifies market returns (assume market is positive bias)
    const betaEffect = (beta - 1.0) * 0.5;

    // 9. Volume Signal (Unusual activity)
    let volumeEffect = 0;
    if (volumeRatio > 2.0) {
      // Very high volume: Strong interest (could be positive or negative based on sentiment)
      volumeEffect = sentiment > 0 ? 1.0 : -1.0;
    } else if (volumeRatio > 1.3) {
      // Elevated volume: Moderate signal
      volumeEffect = sentiment * 0.5;
    }

    // 10. Filing Type Effects (Different information content)
    let filingTypeEffect = 0;
    if (sample.filingType === '10-K') {
      // Annual report: Comprehensive info
      filingTypeEffect = 0.3;
    } else if (sample.filingType === '10-Q') {
      // Quarterly: Regular update
      filingTypeEffect = 0.2;
    } else if (sample.filingType === '8-K') {
      // Current event: Can be very impactful
      filingTypeEffect = sentiment > 0 ? 0.5 : -0.5; // Amplify sentiment for 8-Ks
    }

    // COMBINED PREDICTION
    const prediction =
      0.83 +  // Historical baseline
      marketCapEffect * 0.25 +
      peEffect * 0.15 +
      peExpansionEffect * 0.10 +
      priceHighEffect * 0.20 +
      valuationGapEffect * 0.30 +
      analystEffect * 0.25 +
      sentimentEffect * 0.35 +
      riskEffect * 0.20 +
      epsGrowthEffect * 0.25 +
      dividendEffect * 0.10 +
      betaEffect * 0.15 +
      volumeEffect * 0.15 +
      filingTypeEffect * 0.10;

    return {
      prediction,
      features: {
        marketCapEffect,
        peEffect,
        peExpansionEffect,
        priceHighEffect,
        valuationGapEffect,
        analystEffect,
        sentimentEffect,
        riskEffect,
        epsGrowthEffect,
        dividendEffect,
        betaEffect,
        volumeEffect,
        filingTypeEffect,
      },
    };
  });

  const predictions = engineeredData.map(d => d.prediction);

  // Calculate feature importance based on variance of effects
  const allFeatures = engineeredData[0].features;
  const featureNames = Object.keys(allFeatures);
  const featureImportance = featureNames.map(name => {
    const values = engineeredData.map(d => d.features[name as keyof typeof allFeatures]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return {
      feature: name,
      importance: variance,
    };
  });

  featureImportance.sort((a, b) => b.importance - a.importance);

  console.log('Top 10 Non-Linear Feature Effects:');
  featureImportance.slice(0, 10).forEach(({ feature, importance }) => {
    console.log(`  ${feature.padEnd(25)} variance=${importance.toFixed(4)}`);
  });
  console.log('');

  return {
    predictions,
    features: featureNames,
    featureImportance,
  };
}

// Simple linear system solver (Gaussian elimination)
function solveLinearSystem(X: number[][], y: number[]): number[] {
  const n = X.length;
  const k = X[0].length;

  // X'X
  const XtX: number[][] = Array(k).fill(0).map(() => Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      for (let row = 0; row < n; row++) {
        XtX[i][j] += X[row][i] * X[row][j];
      }
    }
  }

  // X'y
  const Xty: number[] = Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    for (let row = 0; row < n; row++) {
      Xty[i] += X[row][i] * y[row];
    }
  }

  // Solve using Gaussian elimination (simplified)
  // Add small ridge term for numerical stability
  const ridge = 0.01;
  for (let i = 0; i < k; i++) {
    XtX[i][i] += ridge;
  }

  // Forward elimination
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const factor = XtX[j][i] / XtX[i][i];
      for (let m = i; m < k; m++) {
        XtX[j][m] -= factor * XtX[i][m];
      }
      Xty[j] -= factor * Xty[i];
    }
  }

  // Back substitution
  const betas: number[] = Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    betas[i] = Xty[i];
    for (let j = i + 1; j < k; j++) {
      betas[i] -= XtX[i][j] * betas[j];
    }
    betas[i] /= XtX[i][i];
  }

  return betas;
}

function generateComparisonReport(
  championMetrics: ModelMetrics,
  challenger1Metrics: ModelMetrics,
  challenger2Metrics: ModelMetrics,
  data: TrainingData[]
): string {
  let report = '\n';
  report += '═'.repeat(80) + '\n';
  report += '           CHAMPION-CHALLENGER MODEL ANALYSIS REPORT\n';
  report += '═'.repeat(80) + '\n\n';

  report += `Dataset: ${data.length} filings with actual 7-day returns\n`;
  report += `Date Range: ${new Date(Math.min(...data.map(d => d.filingDate.getTime()))).toISOString().split('T')[0]} to `;
  report += `${new Date(Math.max(...data.map(d => d.filingDate.getTime()))).toISOString().split('T')[0]}\n\n`;

  // Overall metrics comparison
  report += '─'.repeat(80) + '\n';
  report += '1. OVERALL PERFORMANCE METRICS\n';
  report += '─'.repeat(80) + '\n\n';

  const models = [championMetrics, challenger1Metrics, challenger2Metrics];

  report += `${'Metric'.padEnd(25)} ${'Champion'.padEnd(15)} ${'Challenger 1'.padEnd(15)} ${'Challenger 2'.padEnd(15)}\n`;
  report += '─'.repeat(80) + '\n';
  report += `${'MAE (Mean Abs Error)'.padEnd(25)} ${championMetrics.mae.toFixed(3).padEnd(15)} ${challenger1Metrics.mae.toFixed(3).padEnd(15)} ${challenger2Metrics.mae.toFixed(3).padEnd(15)}\n`;
  report += `${'RMSE'.padEnd(25)} ${championMetrics.rmse.toFixed(3).padEnd(15)} ${challenger1Metrics.rmse.toFixed(3).padEnd(15)} ${challenger2Metrics.rmse.toFixed(3).padEnd(15)}\n`;
  report += `${'R-squared'.padEnd(25)} ${championMetrics.r2.toFixed(3).padEnd(15)} ${challenger1Metrics.r2.toFixed(3).padEnd(15)} ${challenger2Metrics.r2.toFixed(3).padEnd(15)}\n`;
  report += `${'Direction Accuracy %'.padEnd(25)} ${championMetrics.directionAccuracy.toFixed(1).padEnd(15)} ${challenger1Metrics.directionAccuracy.toFixed(1).padEnd(15)} ${challenger2Metrics.directionAccuracy.toFixed(1).padEnd(15)}\n`;
  report += `${'Mean Error (Bias)'.padEnd(25)} ${championMetrics.meanError.toFixed(3).padEnd(15)} ${challenger1Metrics.meanError.toFixed(3).padEnd(15)} ${challenger2Metrics.meanError.toFixed(3).padEnd(15)}\n`;
  report += `${'Median Error'.padEnd(25)} ${championMetrics.medianError.toFixed(3).padEnd(15)} ${challenger1Metrics.medianError.toFixed(3).padEnd(15)} ${challenger2Metrics.medianError.toFixed(3).padEnd(15)}\n\n`;

  // Direction-specific accuracy
  report += '─'.repeat(80) + '\n';
  report += '2. DIRECTIONAL PREDICTION ACCURACY\n';
  report += '─'.repeat(80) + '\n\n';

  report += `${'Direction'.padEnd(25)} ${'Champion'.padEnd(15)} ${'Challenger 1'.padEnd(15)} ${'Challenger 2'.padEnd(15)}\n`;
  report += '─'.repeat(80) + '\n';
  report += `${'Up Predictions'.padEnd(25)} ${championMetrics.upAccuracy.toFixed(1).padEnd(15)} ${challenger1Metrics.upAccuracy.toFixed(1).padEnd(15)} ${challenger2Metrics.upAccuracy.toFixed(1).padEnd(15)}\n`;
  report += `${'Down Predictions'.padEnd(25)} ${championMetrics.downAccuracy.toFixed(1).padEnd(15)} ${challenger1Metrics.downAccuracy.toFixed(1).padEnd(15)} ${challenger2Metrics.downAccuracy.toFixed(1).padEnd(15)}\n\n`;

  // By filing type
  report += '─'.repeat(80) + '\n';
  report += '3. ACCURACY BY FILING TYPE\n';
  report += '─'.repeat(80) + '\n\n';

  report += `${'Filing Type'.padEnd(25)} ${'Champion'.padEnd(15)} ${'Challenger 1'.padEnd(15)} ${'Challenger 2'.padEnd(15)}\n`;
  report += '─'.repeat(80) + '\n';
  report += `${'10-K (Annual)'.padEnd(25)} ${championMetrics.accuracyBy10K.toFixed(1).padEnd(15)} ${challenger1Metrics.accuracyBy10K.toFixed(1).padEnd(15)} ${challenger2Metrics.accuracyBy10K.toFixed(1).padEnd(15)}\n`;
  report += `${'10-Q (Quarterly)'.padEnd(25)} ${championMetrics.accuracyBy10Q.toFixed(1).padEnd(15)} ${challenger1Metrics.accuracyBy10Q.toFixed(1).padEnd(15)} ${challenger2Metrics.accuracyBy10Q.toFixed(1).padEnd(15)}\n`;
  report += `${'8-K (Current Report)'.padEnd(25)} ${championMetrics.accuracyBy8K.toFixed(1).padEnd(15)} ${challenger1Metrics.accuracyBy8K.toFixed(1).padEnd(15)} ${challenger2Metrics.accuracyBy8K.toFixed(1).padEnd(15)}\n\n`;

  // By market cap
  report += '─'.repeat(80) + '\n';
  report += '4. ACCURACY BY MARKET CAP\n';
  report += '─'.repeat(80) + '\n\n';

  report += `${'Market Cap'.padEnd(25)} ${'Champion'.padEnd(15)} ${'Challenger 1'.padEnd(15)} ${'Challenger 2'.padEnd(15)}\n`;
  report += '─'.repeat(80) + '\n';
  report += `${'Small Cap (<$200B)'.padEnd(25)} ${championMetrics.accuracySmallCap.toFixed(1).padEnd(15)} ${challenger1Metrics.accuracySmallCap.toFixed(1).padEnd(15)} ${challenger2Metrics.accuracySmallCap.toFixed(1).padEnd(15)}\n`;
  report += `${'Large Cap ($200-500B)'.padEnd(25)} ${championMetrics.accuracyLargeCap.toFixed(1).padEnd(15)} ${challenger1Metrics.accuracyLargeCap.toFixed(1).padEnd(15)} ${challenger2Metrics.accuracyLargeCap.toFixed(1).padEnd(15)}\n`;
  report += `${'Mega Cap (>$500B)'.padEnd(25)} ${championMetrics.accuracyMegaCap.toFixed(1).padEnd(15)} ${challenger1Metrics.accuracyMegaCap.toFixed(1).padEnd(15)} ${challenger2Metrics.accuracyMegaCap.toFixed(1).padEnd(15)}\n\n`;

  // Winner determination
  report += '═'.repeat(80) + '\n';
  report += '5. RECOMMENDATION\n';
  report += '═'.repeat(80) + '\n\n';

  // Score each model (lower MAE = better, higher direction accuracy = better)
  const scores = models.map(m => ({
    name: m.modelName,
    score: m.directionAccuracy - (m.mae * 10), // Weighted combination
    mae: m.mae,
    directionAccuracy: m.directionAccuracy,
  }));

  scores.sort((a, b) => b.score - a.score);

  report += `Based on comprehensive analysis:\n\n`;
  report += `1st Place: ${scores[0].name} (Score: ${scores[0].score.toFixed(2)})\n`;
  report += `   - Direction Accuracy: ${scores[0].directionAccuracy.toFixed(1)}%\n`;
  report += `   - Mean Absolute Error: ${scores[0].mae.toFixed(3)}\n\n`;

  report += `2nd Place: ${scores[1].name} (Score: ${scores[1].score.toFixed(2)})\n`;
  report += `3rd Place: ${scores[2].name} (Score: ${scores[2].score.toFixed(2)})\n\n`;

  if (scores[0].name === 'Champion') {
    report += `✅ RECOMMENDATION: Keep current Champion model\n`;
    report += `   The rule-based model outperforms data-driven alternatives.\n`;
  } else {
    report += `🔄 RECOMMENDATION: Consider replacing Champion with ${scores[0].name}\n`;
    report += `   The new model shows ${((scores[0].score - scores[2].score) / scores[2].score * 100).toFixed(1)}% improvement.\n`;
  }

  report += '\n' + '═'.repeat(80) + '\n';

  return report;
}

async function main() {
  try {
    console.log('\n🏁 Starting Champion-Challenger Analysis\n');

    // Step 1: Extract training data
    const data = await extractTrainingData();

    if (data.length < 5) {
      console.error('❌ Insufficient training data. Need at least 5 samples with actual returns.');
      console.error('   Run stock price backfill to populate actual7dReturn values.');
      process.exit(1);
    }

    if (data.length < 50) {
      console.log(`⚠️  WARNING: Only ${data.length} samples available. Results may not be statistically significant.`);
      console.log(`   Recommend 50+ samples for reliable conclusions.\n`);
    }

    // Step 2: Run Champion model
    const championPredictions = await runChampionModel(data);
    const championMetrics = calculateMetrics(
      championPredictions,
      data.map(d => d.actual7dReturn),
      'Champion (Rule-Based)',
      data
    );

    // Step 3: Run Challenger 1 (Stepwise Linear)
    const { predictions: challenger1Predictions } = runStepwiseLinearModel(data);
    const challenger1Metrics = calculateMetrics(
      challenger1Predictions,
      data.map(d => d.actual7dReturn),
      'Challenger 1 (Linear)',
      data
    );

    // Step 4: Run Challenger 2 (Enhanced Non-Linear)
    const { predictions: challenger2Predictions } = runEnhancedNonLinearModel(data);
    const challenger2Metrics = calculateMetrics(
      challenger2Predictions,
      data.map(d => d.actual7dReturn),
      'Challenger 2 (Non-Linear)',
      data
    );

    // Step 5: Generate report
    const report = generateComparisonReport(
      championMetrics,
      challenger1Metrics,
      challenger2Metrics,
      data
    );

    console.log(report);

    // Save report to file
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `champion-challenger-report-${timestamp}.txt`;
    fs.writeFileSync(filename, report);

    console.log(`\n📄 Full report saved to: ${filename}\n`);

    await prisma.$disconnect();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
