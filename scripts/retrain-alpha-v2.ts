/**
 * @module scripts/retrain-alpha-v2
 * @description Retrains the alpha prediction model using the full expanded dataset.
 * Implements Ridge regression (λ=100) with 5-fold TimeSeriesSplit cross-validation.
 *
 * Improvements over v1:
 *   - Uses all training-eligible filings (not just mega-caps)
 *   - Uses historically accurate 52W prices from CompanySnapshot at filing date
 *   - Adds filingTypeFactor (8-K vs 10-Q vs 10-K)
 *   - Adds toneChangeDelta (sentiment improvement vs prior same-type filing)
 *   - Falls back gracefully when historical snapshots are missing
 *
 * Output: Updates FEATURE_STATS, WEIGHTS, SCORE_PERCENTILES in lib/alpha-model.ts
 *
 * Usage: npx tsx scripts/retrain-alpha-v2.ts
 */

import { prisma } from '../lib/prisma';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SECTOR_NORMALIZATION, getCapTier } from '../lib/alpha-model';

// ── Math helpers (no external dependencies) ────────────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[], mu?: number): number {
  const m = mu ?? mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(Math.max(variance, 1e-10));
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Gaussian elimination with partial pivoting. Solves Ax = b. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[col][col]) < 1e-12) continue;
      const f = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) aug[row][j] -= f * aug[col][j];
    }
  }

  const x = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = aug[row][n];
    for (let col = row + 1; col < n; col++) x[row] -= aug[row][col] * x[col];
    x[row] /= aug[row][row];
  }
  return x;
}

/**
 * Ridge regression: β = (X'X + λI)^-1 X'y
 * X is expected to be already z-score standardized.
 */
function ridgeRegression(X: number[][], y: number[], lambda: number): number[] {
  const n = X.length;
  const p = X[0].length;

  const XtX = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) =>
      X.reduce((s, row) => s + row[i] * row[j], 0),
    ),
  );
  for (let i = 0; i < p; i++) XtX[i][i] += lambda;

  const Xty = Array.from({ length: p }, (_, i) =>
    X.reduce((s, row, k) => s + row[i] * y[k], 0),
  );

  return solveLinear(XtX, Xty);
}

/** Standardize features. Returns z-scores and stores means/stds. */
function standardize(X: number[][]): { Z: number[][]; means: number[]; stds: number[] } {
  const n = X.length;
  const p = X[0].length;
  const means = Array.from({ length: p }, (_, j) => mean(X.map(row => row[j])));
  const stds = Array.from({ length: p }, (_, j) => {
    const s = stdDev(X.map(row => row[j]), means[j]);
    return s < 1e-8 ? 1 : s;
  });
  const Z = X.map(row => row.map((v, j) => (v - means[j]) / stds[j]));
  return { Z, means, stds };
}

function r2Score(yTrue: number[], yPred: number[]): number {
  const yMean = mean(yTrue);
  const ssTot = yTrue.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const ssRes = yTrue.reduce((s, v, i) => s + (v - yPred[i]) ** 2, 0);
  return ssTot < 1e-10 ? 0 : 1 - ssRes / ssTot;
}

function directionAccuracy(yTrue: number[], yPred: number[]): number {
  let correct = 0;
  for (let i = 0; i < yTrue.length; i++) {
    if (Math.sign(yTrue[i]) === Math.sign(yPred[i])) correct++;
  }
  return correct / yTrue.length;
}

// ── Feature names ──────────────────────────────────────────────────────────

const FEATURE_NAMES = [
  'priceToLow', 'majorDowngrades', 'analystUpsidePotential', 'priceToHigh',
  'concernLevel', 'marketCap', 'sentimentScore', 'upgradesLast30d',
  'filingTypeFactor', 'toneChangeDelta', 'epsSurprise',
  'spxTrend30d', 'vixLevel',
];

const FILING_TYPE_MAP: Record<string, number> = { '10-K': 0, '10-Q': 1, '8-K': 2 };

const MAJOR_FIRMS = ['Goldman Sachs', 'Morgan Stanley', 'JP Morgan', 'Bank of America',
                     'Citi', 'Wells Fargo', 'Barclays', 'UBS'];

// ── Training data extraction ──────────────────────────────────────────────

interface TrainingRow {
  features: number[];
  target: number;  // actual30dAlpha
  filingId: string;
  ticker: string;
  filingDate: Date;
  filingType: string;
  sector: string | null;
  capTier: 'mega' | 'large' | 'mid' | 'small';
}

async function extractTrainingData(): Promise<TrainingRow[]> {
  console.log('Querying training-eligible filings...');

  const filings = await prisma.filing.findMany({
    where: {
      actual30dAlpha: { not: null },
      sentimentScore: { not: null },
      filingType: { in: ['10-K', '10-Q', '8-K'] },
    },
    select: {
      id: true,
      filingDate: true,
      filingType: true,
      sentimentScore: true,
      concernLevel: true,
      actual30dAlpha: true,
      epsSurprise: true,
      company: {
        select: {
          ticker: true,
          currentPrice: true,
          fiftyTwoWeekHigh: true,
          fiftyTwoWeekLow: true,
          marketCap: true,
          analystTargetPrice: true,
          sector: true,
        },
      },
      snapshots: {
        where: { triggerType: 'filing' },
        select: {
          currentPrice: true,
          fiftyTwoWeekHigh: true,
          fiftyTwoWeekLow: true,
          analystTargetPrice: true,
        },
        orderBy: { snapshotDate: 'desc' },
        take: 1,
      },
    },
    orderBy: { filingDate: 'asc' },
  });

  console.log(`Found ${filings.length} candidate filings`);

  // Build prior-sentiment lookup (sentimentScore of previous same-type filing per company)
  console.log('Computing tone delta...');
  const priorSentiment = new Map<string, number>(); // key: `${companyId}:${filingType}`

  // We need companyId for prior sentiment lookup; re-query to get it
  const filingIds = filings.map(f => f.id);
  const withCompanyId = await prisma.filing.findMany({
    where: { id: { in: filingIds } },
    select: { id: true, companyId: true, filingType: true, filingDate: true, sentimentScore: true },
    orderBy: { filingDate: 'asc' },
  });

  // Build ordered timeline per company+type for prior-sentiment lookup
  const timeline = new Map<string, { date: Date; sentiment: number | null }[]>();
  for (const f of withCompanyId) {
    const key = `${f.companyId}:${f.filingType}`;
    if (!timeline.has(key)) timeline.set(key, []);
    timeline.get(key)!.push({ date: f.filingDate, sentiment: f.sentimentScore });
  }
  const idToCompanyId = new Map(withCompanyId.map(f => [f.id, f.companyId]));

  // Bulk-fetch analyst activity for all training companies
  console.log('Loading analyst activity...');
  const trainingCompanyIds = [...new Set(withCompanyId.map(f => f.companyId))];
  const analystActivityRaw = await prisma.analystActivity.findMany({
    where: { companyId: { in: trainingCompanyIds } },
    select: { companyId: true, activityDate: true, actionType: true, firm: true },
  });
  // Index by companyId for O(1) per-filing lookup
  const analystByCompany = new Map<string, { date: Date; actionType: string; firm: string }[]>();
  for (const act of analystActivityRaw) {
    if (!analystByCompany.has(act.companyId)) analystByCompany.set(act.companyId, []);
    analystByCompany.get(act.companyId)!.push({
      date: act.activityDate,
      actionType: act.actionType,
      firm: act.firm,
    });
  }
  console.log(`Loaded ${analystActivityRaw.length} analyst activity rows for ${trainingCompanyIds.length} companies`);

  // Load macro indicators for regime features
  console.log('Loading macro indicators...');
  const macroRows = await prisma.macroIndicators.findMany({
    select: { date: true, spxReturn30d: true, vixClose: true },
    orderBy: { date: 'asc' },
  });
  // Build sorted array for binary-search lookup by date
  const macroSorted = macroRows.filter(m => m.spxReturn30d != null || m.vixClose != null);
  function findClosestMacro(date: Date): { spxReturn30d: number | null; vixClose: number | null } | null {
    if (macroSorted.length === 0) return null;
    const ms = date.getTime();
    let best = macroSorted[0], bestDiff = Math.abs(macroSorted[0].date.getTime() - ms);
    for (const m of macroSorted) {
      const diff = Math.abs(m.date.getTime() - ms);
      if (diff < bestDiff) { bestDiff = diff; best = m; }
      if (m.date.getTime() > ms + 7 * 86400000) break; // stop if >7d ahead
    }
    return bestDiff < 7 * 86400000 ? best : null;
  }
  console.log(`Loaded ${macroSorted.length} macro indicator rows`);

  const rows: TrainingRow[] = [];

  for (const filing of filings) {
    const snap = filing.snapshots[0];
    const coy = filing.company;

    // Use historical snapshot if available (accurate price at filing date)
    // Fall back to current Company data
    const priceData = snap?.currentPrice
      ? {
          currentPrice: snap.currentPrice,
          fiftyTwoWeekHigh: snap.fiftyTwoWeekHigh ?? coy.fiftyTwoWeekHigh ?? 0,
          fiftyTwoWeekLow: snap.fiftyTwoWeekLow ?? coy.fiftyTwoWeekLow ?? 0,
          analystTargetPrice: snap.analystTargetPrice ?? coy.analystTargetPrice,
        }
      : {
          currentPrice: coy.currentPrice ?? 0,
          fiftyTwoWeekHigh: coy.fiftyTwoWeekHigh ?? 0,
          fiftyTwoWeekLow: coy.fiftyTwoWeekLow ?? 0,
          analystTargetPrice: coy.analystTargetPrice,
        };

    if (priceData.currentPrice <= 0) continue; // Skip if no price data

    // Training means (v1) used as fallback for missing features
    const V1_MEANS = {
      priceToLow: 1.3978, majorDowngrades: 0.1029,
      analystUpsidePotential: 13.518, priceToHigh: 0.8588,
      concernLevel: 5.345, marketCap: 682_892_847_207,
      sentimentScore: 0.0236, upgradesLast30d: 0.1941,
    };

    const priceToLow = priceData.fiftyTwoWeekLow > 0
      ? priceData.currentPrice / priceData.fiftyTwoWeekLow
      : V1_MEANS.priceToLow;

    const priceToHigh = priceData.fiftyTwoWeekHigh > 0
      ? priceData.currentPrice / priceData.fiftyTwoWeekHigh
      : V1_MEANS.priceToHigh;

    const analystUpsidePotential = priceData.analystTargetPrice && priceData.currentPrice > 0
      ? ((priceData.analystTargetPrice / priceData.currentPrice) - 1) * 100
      : V1_MEANS.analystUpsidePotential;

    const sentimentScore = filing.sentimentScore ?? V1_MEANS.sentimentScore;
    const concernLevel = filing.concernLevel ?? V1_MEANS.concernLevel;
    const marketCap = coy.marketCap ?? V1_MEANS.marketCap;
    const filingTypeFactor = FILING_TYPE_MAP[filing.filingType] ?? 1;

    // Tone delta: compare to prior same-type filing's sentiment
    const companyId = idToCompanyId.get(filing.id) ?? '';
    const tlKey = `${companyId}:${filing.filingType}`;
    const tl = timeline.get(tlKey) ?? [];
    const myIdx = tl.findIndex(e => e.date.getTime() === filing.filingDate.getTime());
    const priorEntry = myIdx > 0 ? tl[myIdx - 1] : null;
    const toneChangeDelta = priorEntry?.sentiment != null
      ? sentimentScore - priorEntry.sentiment
      : 0;

    // Analyst activity in 30d prior to filing date
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const filingMs = filing.filingDate.getTime();
    const companyActs = analystByCompany.get(companyId) ?? [];
    const priorActs = companyActs.filter(a => {
      const ms = a.date.getTime();
      return ms >= filingMs - thirtyDaysMs && ms < filingMs;
    });
    const upgradesLast30d = priorActs.filter(a => a.actionType === 'upgrade').length;
    const majorDowngrades = priorActs.filter(a =>
      a.actionType === 'downgrade' && MAJOR_FIRMS.some(firm => a.firm.includes(firm)),
    ).length;

    // Winsorize EPS surprise to [-50, 50]; use 0 when missing (neutral)
    const epsSurprise = filing.epsSurprise != null
      ? Math.max(-50, Math.min(50, filing.epsSurprise))
      : 0;

    // Macro regime features at filing date
    const macro = findClosestMacro(filing.filingDate);
    const spxTrend30d = macro?.spxReturn30d ?? 0;
    const vixLevel = macro?.vixClose ?? 20; // fallback to neutral 20

    const features = [
      priceToLow, majorDowngrades, analystUpsidePotential,
      priceToHigh, concernLevel, marketCap, sentimentScore, upgradesLast30d,
      filingTypeFactor, toneChangeDelta, epsSurprise,
      spxTrend30d, vixLevel,
    ];

    rows.push({
      features,
      target: filing.actual30dAlpha!,
      filingId: filing.id,
      ticker: coy.ticker,
      filingDate: filing.filingDate,
      filingType: filing.filingType,
      sector: coy.sector ?? null,
      capTier: getCapTier(marketCap),
    });
  }

  return rows;
}

// ── Walk-forward cross-validation ─────────────────────────────────────────

function walkForwardCV(rows: TrainingRow[], lambda: number, folds: number = 5, gapDays: number = 0): {
  r2Scores: number[];
  dirAccScores: number[];
} {
  const n = rows.length;
  const foldSize = Math.floor(n / (folds + 1)); // min training set = 1 fold
  const gapMs = gapDays * 24 * 60 * 60 * 1000;
  const r2Scores: number[] = [];
  const dirAccScores: number[] = [];

  for (let fold = 0; fold < folds; fold++) {
    const trainEnd = (fold + 1) * foldSize;

    // With gapDays: skip any test rows within gapDays of the last training date
    let testStart = trainEnd;
    if (gapDays > 0 && trainEnd > 0) {
      const cutoffMs = rows[trainEnd - 1].filingDate.getTime() + gapMs;
      while (testStart < n && rows[testStart].filingDate.getTime() < cutoffMs) testStart++;
    }
    const testEnd = Math.min(testStart + foldSize, n);
    if (testEnd <= testStart) break;

    const trainRows = rows.slice(0, trainEnd);
    const testRows = rows.slice(testStart, testEnd);

    const Xtrain = trainRows.map(r => r.features);
    const ytrain = trainRows.map(r => r.target);
    const { Z: Ztrain, means, stds } = standardize(Xtrain);

    const weights = ridgeRegression(Ztrain, ytrain, lambda);

    // Score test set using training normalization
    const Xtest = testRows.map(r => r.features);
    const ytest = testRows.map(r => r.target);
    const Ztest = Xtest.map(row => row.map((v, j) => (v - means[j]) / stds[j]));
    const yPred = Ztest.map(row => row.reduce((s, z, j) => s + z * weights[j], 0));

    r2Scores.push(r2Score(ytest, yPred));
    dirAccScores.push(directionAccuracy(ytest, yPred));
  }

  return { r2Scores, dirAccScores };
}

// ── Update alpha-model.ts ─────────────────────────────────────────────────

interface SectorModelData {
  featureMeans: number[];
  featureStds: number[];
  weights: number[];
  scorePercentiles: Record<string, number>;
  sampleCount: number;
}

function serializeModels(
  models: Record<string, SectorModelData>,
  featureNames: string[],
  constName: string,
  commentLabel: string,
): string {
  if (Object.keys(models).length === 0) {
    return `const ${constName}: Record<string, SectorModel> = {\n  // Auto-generated — do not edit manually\n};`;
  }

  const entries = Object.entries(models).map(([sector, model]) => {
    const statsLines = featureNames.map((name, i) => {
      const m = model.featureMeans[i];
      const s = model.featureStds[i] < 5e-5 ? 1 : model.featureStds[i]; // guard near-zero stds
      const mStr = Math.abs(m) > 1e9 ? m.toExponential(4) : m.toFixed(4);
      const sStr = Math.abs(s) > 1e9 ? s.toExponential(4) : s.toFixed(4);
      return `      ${name.padEnd(24)}: { mean: ${mStr.padStart(14)}, std: ${sStr.padStart(14)} },`;
    }).join('\n');

    const weightsLines = featureNames.map((name, i) => {
      const sign = model.weights[i] >= 0 ? '+' : '';
      return `      ${name.padEnd(24)}: ${sign}${model.weights[i].toFixed(4)},`;
    }).join('\n');

    const pLines = Object.entries(model.scorePercentiles).map(([k, v]) => {
      const sign = v >= 0 ? '+' : '';
      return `      ${k}: ${sign}${v.toFixed(4)},`;
    }).join('\n');

    return `  '${sector}': {\n    featureStats: {\n${statsLines}\n    },\n    weights: {\n${weightsLines}\n    },\n    scorePercentiles: {\n${pLines}\n    },\n    sampleCount: ${model.sampleCount},\n  },`;
  });

  const count = Object.keys(models).length;
  return `const ${constName}: Record<string, SectorModel> = {\n  // Auto-generated by retrain-alpha-v2.ts (${count} ${commentLabel})\n${entries.join('\n')}\n};`;
}

function updateAlphaModelFile(
  featureNames: string[],
  featureMeans: number[],
  featureStds: number[],
  weights: number[],
  scorePercentiles: Record<string, number>,
  sampleCount: number,
  sectorModels: Record<string, SectorModelData> = {},
  capTierModels: Record<string, SectorModelData> = {},
  combinedModels: Record<string, SectorModelData> = {},
): void {
  const modelPath = join(process.cwd(), 'lib', 'alpha-model.ts');
  let src = readFileSync(modelPath, 'utf-8');

  // Build new FEATURE_STATS block
  const statsLines = featureNames.map((name, i) => {
    const m = featureMeans[i];
    const s = featureStds[i] < 5e-5 ? 1 : featureStds[i]; // guard near-zero stds (stdDev of all-zeros = 1e-5, serializes as "0.0000")
    const mStr = Math.abs(m) > 1e9
      ? m.toExponential(4)
      : m.toFixed(4);
    const sStr = Math.abs(s) > 1e9
      ? s.toExponential(4)
      : s.toFixed(4);
    return `  ${name.padEnd(24)}: { mean: ${mStr.padStart(14)}, std: ${sStr.padStart(14)} },`;
  });
  const newStatsBlock = `const FEATURE_STATS = {\n${statsLines.join('\n')}\n} as const;`;

  // Build new WEIGHTS block
  const weightsLines = featureNames.map((name, i) => {
    const sign = weights[i] >= 0 ? '+' : '';
    return `  ${name.padEnd(24)}: ${sign}${weights[i].toFixed(4)},`;
  });
  const newWeightsBlock = `const WEIGHTS = {\n${weightsLines.join('\n')}\n} as const;`;

  // Build new SCORE_PERCENTILES block
  const pLines = Object.entries(scorePercentiles).map(([k, v]) => {
    const sign = v >= 0 ? '+' : '';
    return `  ${k}: ${sign}${v.toFixed(4)},`;
  });
  const newPercentilesBlock = `const SCORE_PERCENTILES = {\n${pLines.join('\n')}\n} as const;`;

  // Replace blocks using regex (match the entire const block)
  src = src.replace(
    /const FEATURE_STATS = \{[\s\S]*?\} as const;/,
    `${newStatsBlock}\n\n// v2 model trained on ${sampleCount} samples with historically accurate price features`,
  );
  src = src.replace(/const WEIGHTS = \{[\s\S]*?\} as const;/, newWeightsBlock);
  src = src.replace(/const SCORE_PERCENTILES = \{[\s\S]*?\} as const;/, newPercentilesBlock);

  // Replace all three MoE model blocks
  src = src.replace(
    /const SECTOR_MODELS: Record<string, SectorModel> = \{[\s\S]*?\n\};/,
    serializeModels(sectorModels, featureNames, 'SECTOR_MODELS', 'sector experts'),
  );
  src = src.replace(
    /const CAP_TIER_MODELS: Record<string, SectorModel> = \{[\s\S]*?\n\};/,
    serializeModels(capTierModels, featureNames, 'CAP_TIER_MODELS', 'cap-tier experts'),
  );
  src = src.replace(
    /const COMBINED_MODELS: Record<string, SectorModel> = \{[\s\S]*?\n\};/,
    serializeModels(combinedModels, featureNames, 'COMBINED_MODELS', 'sector×cap-tier experts'),
  );

  writeFileSync(modelPath, src, 'utf-8');
  console.log(`\n✅ Updated lib/alpha-model.ts`);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== RETRAIN ALPHA MODEL v2 ===\n');

  const rows = await extractTrainingData();
  console.log(`\nTraining samples: ${rows.length}`);

  if (rows.length < 50) {
    console.error('ERROR: Too few training samples. Run backfill scripts first.');
    process.exit(1);
  }

  // Sort by date for walk-forward CV
  rows.sort((a, b) => a.filingDate.getTime() - b.filingDate.getTime());

  const byType = rows.reduce((acc, r) => {
    acc[r.filingType] = (acc[r.filingType] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('By filing type:', JSON.stringify(byType));

  // Walk-forward CV (standard)
  console.log('\nRunning 5-fold walk-forward CV (standard)...');
  const { r2Scores, dirAccScores } = walkForwardCV(rows, 100, 5, 0);
  const cvR2 = mean(r2Scores);
  const cvR2Std = stdDev(r2Scores, cvR2);
  const cvDirAcc = mean(dirAccScores);
  console.log(`CV R²:               ${cvR2.toFixed(3)} ± ${cvR2Std.toFixed(3)}`);
  console.log(`CV direction acc:    ${(cvDirAcc * 100).toFixed(1)}%`);

  // Walk-forward CV (strict: 90-day gap between train and test)
  console.log('\nRunning 5-fold walk-forward CV (strict 90-day gap)...');
  const { r2Scores: r2Strict, dirAccScores: dirStrict } = walkForwardCV(rows, 100, 5, 90);
  const strictR2 = mean(r2Strict);
  const strictDirAcc = mean(dirStrict);
  console.log(`Strict CV R²:        ${strictR2.toFixed(3)} ± ${stdDev(r2Strict, strictR2).toFixed(3)}`);
  console.log(`Strict CV dir acc:   ${(strictDirAcc * 100).toFixed(1)}%`);
  console.log(`\nv1 baseline: R²=0.043 ± 0.056, dir_acc=56.3%`);

  // Final model: train on all data
  console.log('\nTraining final model on full dataset...');
  const X = rows.map(r => r.features);
  const y = rows.map(r => r.target);
  const { Z, means, stds } = standardize(X);
  const weights = ridgeRegression(Z, y, 100);

  // Score all training samples for percentile calibration
  const trainScores = Z.map(row => row.reduce((s, z, j) => s + z * weights[j], 0));
  const sortedScores = [...trainScores].sort((a, b) => a - b);

  const scorePercentiles = {
    p10: percentile(sortedScores, 10),
    p25: percentile(sortedScores, 25),
    p50: percentile(sortedScores, 50),
    p75: percentile(sortedScores, 75),
    p90: percentile(sortedScores, 90),
    mean: mean(trainScores),
    std: stdDev(trainScores),
  };

  // Print results
  console.log('\nNew feature weights (v2):');
  FEATURE_NAMES.forEach((name, i) => {
    const sign = weights[i] >= 0 ? '+' : '';
    const importance = Math.abs(weights[i]).toFixed(4);
    console.log(`  ${name.padEnd(26)} ${sign}${weights[i].toFixed(4)}  (|w|=${importance})`);
  });

  console.log('\nNew score percentiles:');
  Object.entries(scorePercentiles).forEach(([k, v]) => {
    const sign = v >= 0 ? '+' : '';
    console.log(`  ${k}: ${sign}${v.toFixed(4)}`);
  });

  // In-sample metrics
  const trainPred = Z.map(row => row.reduce((s, z, j) => s + z * weights[j], 0));
  const trainR2 = r2Score(y, trainPred);
  const trainDirAcc = directionAccuracy(y, trainPred);
  console.log(`\nIn-sample R²:        ${trainR2.toFixed(3)}`);
  console.log(`In-sample dir_acc:   ${(trainDirAcc * 100).toFixed(1)}%`);

  // High-confidence signal quality
  const highConfIndices = trainScores
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s > scorePercentiles.p90 || s < scorePercentiles.p10);

  if (highConfIndices.length > 10) {
    const hcLongs = highConfIndices.filter(({ s }) => s > scorePercentiles.p90);
    const hcShorts = highConfIndices.filter(({ s }) => s < scorePercentiles.p10);
    const longAlpha = mean(hcLongs.map(({ i }) => y[i]));
    const shortAlpha = mean(hcShorts.map(({ i }) => y[i]));
    console.log(`High-conf LONG (n=${hcLongs.length}): avg alpha = ${longAlpha.toFixed(2)}pp`);
    console.log(`High-conf SHORT (n=${hcShorts.length}): avg alpha = ${shortAlpha.toFixed(2)}pp`);
    console.log(`Long-Short spread: ${(longAlpha - shortAlpha).toFixed(2)}pp`);
  }

  // ── Train sector-specific MoE experts ──────────────────────────────────
  console.log('\n=== SECTOR MoE TRAINING ===');
  const MIN_SECTOR_SAMPLES = 50;
  const sectorModels: Record<string, SectorModelData> = {};

  // Group rows by canonical sector
  const sectorGroups = new Map<string, TrainingRow[]>();
  for (const row of rows) {
    if (!row.sector) continue;
    const canonical = SECTOR_NORMALIZATION[row.sector] ?? row.sector;
    if (!sectorGroups.has(canonical)) sectorGroups.set(canonical, []);
    sectorGroups.get(canonical)!.push(row);
  }

  const nullSectorCount = rows.filter(r => !r.sector).length;
  if (nullSectorCount > 0) {
    console.log(`  (${nullSectorCount} rows with null sector skipped from sector training)`);
  }

  for (const [sector, sRows] of [...sectorGroups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (sRows.length < MIN_SECTOR_SAMPLES) {
      console.log(`  ${sector}: ${sRows.length} samples — skipping (min ${MIN_SECTOR_SAMPLES})`);
      continue;
    }

    // Sort sector rows by date for consistent training
    sRows.sort((a, b) => a.filingDate.getTime() - b.filingDate.getTime());

    const sX = sRows.map(r => r.features);
    const sY = sRows.map(r => r.target);
    const { Z: sZ, means: sMeans, stds: sStds } = standardize(sX);
    const sWeights = ridgeRegression(sZ, sY, 100);

    const sScores = sZ.map(row => row.reduce((s, z, j) => s + z * sWeights[j], 0));
    const sortedSScores = [...sScores].sort((a, b) => a - b);
    const sPcts = {
      p10: percentile(sortedSScores, 10),
      p25: percentile(sortedSScores, 25),
      p50: percentile(sortedSScores, 50),
      p75: percentile(sortedSScores, 75),
      p90: percentile(sortedSScores, 90),
      mean: mean(sScores),
      std: stdDev(sScores),
    };

    // In-sample dir acc for sector
    const sPred = sZ.map(row => row.reduce((s, z, j) => s + z * sWeights[j], 0));
    const sDirAcc = directionAccuracy(sY, sPred);

    sectorModels[sector] = {
      featureMeans: sMeans, featureStds: sStds, weights: sWeights,
      scorePercentiles: sPcts, sampleCount: sRows.length,
    };
    console.log(`  ${sector.padEnd(28)} n=${sRows.length}  in-sample dir_acc=${(sDirAcc * 100).toFixed(1)}%`);
  }
  console.log(`\nSector experts trained: ${Object.keys(sectorModels).length}`);

  // ── Train cap-tier MoE experts ──────────────────────────────────────────
  console.log('\n=== CAP-TIER MoE TRAINING ===');
  const MIN_CAP_TIER_SAMPLES = 50;
  const capTierModels: Record<string, SectorModelData> = {};

  const capTierGroups = new Map<string, TrainingRow[]>();
  for (const row of rows) {
    if (!capTierGroups.has(row.capTier)) capTierGroups.set(row.capTier, []);
    capTierGroups.get(row.capTier)!.push(row);
  }

  for (const [tier, tRows] of [...capTierGroups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (tRows.length < MIN_CAP_TIER_SAMPLES) {
      console.log(`  ${tier}: ${tRows.length} samples — skipping (min ${MIN_CAP_TIER_SAMPLES})`);
      continue;
    }
    tRows.sort((a, b) => a.filingDate.getTime() - b.filingDate.getTime());
    const tX = tRows.map(r => r.features);
    const tY = tRows.map(r => r.target);
    const { Z: tZ, means: tMeans, stds: tStds } = standardize(tX);
    const tWeights = ridgeRegression(tZ, tY, 100);
    const tScores = tZ.map(row => row.reduce((s, z, j) => s + z * tWeights[j], 0));
    const sortedTScores = [...tScores].sort((a, b) => a - b);
    const tPcts = {
      p10: percentile(sortedTScores, 10),
      p25: percentile(sortedTScores, 25),
      p50: percentile(sortedTScores, 50),
      p75: percentile(sortedTScores, 75),
      p90: percentile(sortedTScores, 90),
      mean: mean(tScores),
      std: stdDev(tScores),
    };
    const tDirAcc = directionAccuracy(tY, tScores);
    capTierModels[tier] = {
      featureMeans: tMeans, featureStds: tStds, weights: tWeights,
      scorePercentiles: tPcts, sampleCount: tRows.length,
    };
    console.log(`  ${tier.padEnd(8)} n=${tRows.length}  in-sample dir_acc=${(tDirAcc * 100).toFixed(1)}%`);
  }
  console.log(`Cap-tier experts trained: ${Object.keys(capTierModels).length}`);

  // ── Train combined sector×cap-tier MoE experts ─────────────────────────
  console.log('\n=== COMBINED SECTOR×CAP-TIER MoE TRAINING ===');
  const MIN_COMBINED_SAMPLES = 30;
  const combinedModels: Record<string, SectorModelData> = {};

  const combinedGroups = new Map<string, TrainingRow[]>();
  for (const row of rows) {
    if (!row.sector) continue;
    const canonical = SECTOR_NORMALIZATION[row.sector] ?? row.sector;
    const key = `${canonical}:${row.capTier}`;
    if (!combinedGroups.has(key)) combinedGroups.set(key, []);
    combinedGroups.get(key)!.push(row);
  }

  for (const [key, cRows] of [...combinedGroups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (cRows.length < MIN_COMBINED_SAMPLES) continue;
    cRows.sort((a, b) => a.filingDate.getTime() - b.filingDate.getTime());
    const cX = cRows.map(r => r.features);
    const cY = cRows.map(r => r.target);
    const { Z: cZ, means: cMeans, stds: cStds } = standardize(cX);
    const cWeights = ridgeRegression(cZ, cY, 100);
    const cScores = cZ.map(row => row.reduce((s, z, j) => s + z * cWeights[j], 0));
    const sortedCScores = [...cScores].sort((a, b) => a - b);
    const cPcts = {
      p10: percentile(sortedCScores, 10),
      p25: percentile(sortedCScores, 25),
      p50: percentile(sortedCScores, 50),
      p75: percentile(sortedCScores, 75),
      p90: percentile(sortedCScores, 90),
      mean: mean(cScores),
      std: stdDev(cScores),
    };
    const cDirAcc = directionAccuracy(cY, cScores);
    combinedModels[key] = {
      featureMeans: cMeans, featureStds: cStds, weights: cWeights,
      scorePercentiles: cPcts, sampleCount: cRows.length,
    };
    console.log(`  ${key.padEnd(36)} n=${cRows.length}  dir_acc=${(cDirAcc * 100).toFixed(1)}%`);
  }
  console.log(`Combined experts trained: ${Object.keys(combinedModels).length}`);

  // Update alpha-model.ts
  console.log('\nUpdating lib/alpha-model.ts...');
  updateAlphaModelFile(FEATURE_NAMES, means, stds, weights, scorePercentiles, rows.length, sectorModels, capTierModels, combinedModels);

  console.log('\n=== DONE ===');
  console.log(`Model v2 trained on ${rows.length} samples (v1 used 340)`);
  console.log('Next: npx tsx scripts/backtest-alpha-v2.ts');

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
