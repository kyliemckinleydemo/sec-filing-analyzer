/**
 * Champion vs Challenger Model Comparison
 *
 * Compares two model versions:
 * - LEGACY MODEL: Uses riskScore + sentimentScore features
 * - CHAMPION MODEL: Uses concernLevel feature (synthesizes risk + sentiment + financials)
 *
 * This script runs both Python models and compares their accuracy on the same test set.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

interface ModelResults {
  modelName: string;
  directionAccuracy: number;
  directionStd: number;
  mae: number;
  r2: number;
  usesFeature: string;
}

async function trainLegacyModel(): Promise<ModelResults> {
  console.log('🏋️  Training LEGACY model (riskScore + sentimentScore)...\n');
  console.log('═'.repeat(80));

  // Create a modified training script that uses legacy features
  const legacyScript = `#!/usr/bin/env python3
"""Train legacy model with riskScore + sentimentScore"""
import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score
import pickle
import os

def direction_accuracy(y_true, y_pred):
    correct = np.sum(np.sign(y_true) == np.sign(y_pred))
    return correct / len(y_true) * 100

# Load data
df = pd.read_csv('data/ml_dataset_with_concern.csv')

# Target
y = df['actual7dReturn'].values

# Features (EXCLUDE concernLevel, USE riskScore+sentimentScore)
exclude_cols = ['filingId', 'ticker', 'companyName', 'filingDate',
                'actual7dReturn', 'actual30dReturn', 'actual7dAlpha', 'actual30dAlpha',
                'marketCapCategory', 'concernLevel']  # EXCLUDE concernLevel

feature_cols = [col for col in df.columns if col not in exclude_cols]
X = df[feature_cols].copy()

# Handle categorical
X['is_10K'] = (df['filingType'] == '10-K').astype(int)
X['is_10Q'] = (df['filingType'] == '10-Q').astype(int)
X = X.drop('filingType', axis=1)

# Drop high-missing features
missing_pct = X.isnull().sum() / len(X)
X = X.drop(columns=missing_pct[missing_pct > 0.5].index.tolist())

# Fill NaN
for col in X.columns:
    if X[col].isna().sum() > 0:
        X[col].fillna(X[col].median(), inplace=True)

# Cross-validation
tscv = TimeSeriesSplit(n_splits=5)
direction_accs = []
maes = []
r2s = []

for train_idx, test_idx in tscv.split(X):
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    model = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42)
    model.fit(X_train_scaled, y_train)
    y_pred = model.predict(X_test_scaled)

    direction_accs.append(direction_accuracy(y_test, y_pred))
    maes.append(mean_absolute_error(y_test, y_pred))
    r2s.append(r2_score(y_test, y_pred))

# Results
avg_dir = np.mean(direction_accs)
std_dir = np.std(direction_accs)
avg_mae = np.mean(maes)
avg_r2 = np.mean(r2s)

# Save results
os.makedirs('models', exist_ok=True)
with open('models/legacy_results.txt', 'w') as f:
    f.write(f"{avg_dir}\\n")
    f.write(f"{std_dir}\\n")
    f.write(f"{avg_mae}\\n")
    f.write(f"{avg_r2}\\n")

print(f"LEGACY MODEL (riskScore + sentimentScore)")
print(f"Direction Accuracy: {avg_dir:.1f}% (±{std_dir:.1f})")
print(f"MAE: {avg_mae:.3f}")
print(f"R²: {avg_r2:.3f}")
`;

  await fs.writeFile('scripts/train_legacy_model.py', legacyScript);

  try {
    const { stdout, stderr } = await execAsync('python3 scripts/train_legacy_model.py', {
      maxBuffer: 10 * 1024 * 1024,
    });

    console.log(stdout);
    if (stderr) console.error(stderr);

    // Read results
    const resultsFile = await fs.readFile('models/legacy_results.txt', 'utf-8');
    const [dirAccStr, stdStr, maeStr, r2Str] = resultsFile.trim().split('\n');

    return {
      modelName: 'LEGACY MODEL',
      directionAccuracy: parseFloat(dirAccStr),
      directionStd: parseFloat(stdStr),
      mae: parseFloat(maeStr),
      r2: parseFloat(r2Str),
      usesFeature: 'riskScore + sentimentScore',
    };
  } catch (error: any) {
    console.error('❌ Error training legacy model:', error.message);
    throw error;
  }
}

async function trainChampionModel(): Promise<ModelResults> {
  console.log('\n🏋️  Training CHAMPION model (concernLevel)...\n');
  console.log('═'.repeat(80));

  // Create champion training script
  const championScript = `#!/usr/bin/env python3
"""Train champion model with concernLevel"""
import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score
import pickle
import os

def direction_accuracy(y_true, y_pred):
    correct = np.sum(np.sign(y_true) == np.sign(y_pred))
    return correct / len(y_true) * 100

# Load data
df = pd.read_csv('data/ml_dataset_with_concern.csv')

# Target
y = df['actual7dReturn'].values

# Features (EXCLUDE riskScore+sentimentScore, USE concernLevel)
exclude_cols = ['filingId', 'ticker', 'companyName', 'filingDate',
                'actual7dReturn', 'actual30dReturn', 'actual7dAlpha', 'actual30dAlpha',
                'marketCapCategory', 'riskScore', 'sentimentScore']  # EXCLUDE legacy

feature_cols = [col for col in df.columns if col not in exclude_cols]
X = df[feature_cols].copy()

# Handle categorical
X['is_10K'] = (df['filingType'] == '10-K').astype(int)
X['is_10Q'] = (df['filingType'] == '10-Q').astype(int)
X = X.drop('filingType', axis=1)

# Drop high-missing features
missing_pct = X.isnull().sum() / len(X)
X = X.drop(columns=missing_pct[missing_pct > 0.5].index.tolist())

# Fill NaN
for col in X.columns:
    if X[col].isna().sum() > 0:
        X[col].fillna(X[col].median(), inplace=True)

# Cross-validation
tscv = TimeSeriesSplit(n_splits=5)
direction_accs = []
maes = []
r2s = []

for train_idx, test_idx in tscv.split(X):
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    model = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42)
    model.fit(X_train_scaled, y_train)
    y_pred = model.predict(X_test_scaled)

    direction_accs.append(direction_accuracy(y_test, y_pred))
    maes.append(mean_absolute_error(y_test, y_pred))
    r2s.append(r2_score(y_test, y_pred))

# Results
avg_dir = np.mean(direction_accs)
std_dir = np.std(direction_accs)
avg_mae = np.mean(maes)
avg_r2 = np.mean(r2s)

# Save results
os.makedirs('models', exist_ok=True)
with open('models/champion_results.txt', 'w') as f:
    f.write(f"{avg_dir}\\n")
    f.write(f"{std_dir}\\n")
    f.write(f"{avg_mae}\\n")
    f.write(f"{avg_r2}\\n")

print(f"CHAMPION MODEL (concernLevel)")
print(f"Direction Accuracy: {avg_dir:.1f}% (±{std_dir:.1f})")
print(f"MAE: {avg_mae:.3f}")
print(f"R²: {avg_r2:.3f}")
`;

  await fs.writeFile('scripts/train_champion_model_simple.py', championScript);

  try {
    const { stdout, stderr } = await execAsync('python3 scripts/train_champion_model_simple.py', {
      maxBuffer: 10 * 1024 * 1024,
    });

    console.log(stdout);
    if (stderr) console.error(stderr);

    // Read results
    const resultsFile = await fs.readFile('models/champion_results.txt', 'utf-8');
    const [dirAccStr, stdStr, maeStr, r2Str] = resultsFile.trim().split('\n');

    return {
      modelName: 'CHAMPION MODEL',
      directionAccuracy: parseFloat(dirAccStr),
      directionStd: parseFloat(stdStr),
      mae: parseFloat(maeStr),
      r2: parseFloat(r2Str),
      usesFeature: 'concernLevel',
    };
  } catch (error: any) {
    console.error('❌ Error training champion model:', error.message);
    throw error;
  }
}

function printComparisonReport(legacy: ModelResults, champion: ModelResults) {
  console.log('\n\n');
  console.log('═'.repeat(80));
  console.log('   CHAMPION VS CHALLENGER COMPARISON REPORT');
  console.log('═'.repeat(80));
  console.log('');

  // Summary table
  console.log('📊 RESULTS SUMMARY\n');
  console.log('─'.repeat(80));
  console.log('Model                     Feature                        Direction %     MAE       ');
  console.log('─'.repeat(80));
  console.log(
    `${legacy.modelName.padEnd(25)} ${legacy.usesFeature.padEnd(30)} ${legacy.directionAccuracy.toFixed(1)}% ±${legacy.directionStd.toFixed(1)}  ${legacy.mae.toFixed(3)}`
  );
  console.log(
    `${champion.modelName.padEnd(25)} ${champion.usesFeature.padEnd(30)} ${champion.directionAccuracy.toFixed(1)}% ±${champion.directionStd.toFixed(1)}  ${champion.mae.toFixed(3)}`
  );
  console.log('─'.repeat(80));
  console.log('');

  // Accuracy comparison
  const accuracyDiff = champion.directionAccuracy - legacy.directionAccuracy;
  const maeDiff = champion.mae - legacy.mae;

  console.log('📈 ACCURACY COMPARISON\n');

  if (accuracyDiff > 0) {
    console.log(`✅ CHAMPION WINS by ${accuracyDiff.toFixed(1)} percentage points!`);
    console.log(`   Champion: ${champion.directionAccuracy.toFixed(1)}% accuracy`);
    console.log(`   Legacy:   ${legacy.directionAccuracy.toFixed(1)}% accuracy`);
  } else if (accuracyDiff < 0) {
    console.log(`❌ LEGACY WINS by ${Math.abs(accuracyDiff).toFixed(1)} percentage points`);
    console.log(`   Legacy:   ${legacy.directionAccuracy.toFixed(1)}% accuracy`);
    console.log(`   Champion: ${champion.directionAccuracy.toFixed(1)}% accuracy`);
  } else {
    console.log(`🤝 TIE: Both models achieve ${champion.directionAccuracy.toFixed(1)}% accuracy`);
  }

  console.log('');

  // MAE comparison
  console.log('📉 ERROR COMPARISON (lower is better)\n');

  if (maeDiff < 0) {
    console.log(`✅ CHAMPION WINS with ${Math.abs(maeDiff).toFixed(3)} lower MAE!`);
    console.log(`   Champion MAE: ${champion.mae.toFixed(3)}`);
    console.log(`   Legacy MAE:   ${legacy.mae.toFixed(3)}`);
  } else if (maeDiff > 0) {
    console.log(`❌ LEGACY WINS with ${Math.abs(maeDiff).toFixed(3)} lower MAE`);
    console.log(`   Legacy MAE:   ${legacy.mae.toFixed(3)}`);
    console.log(`   Champion MAE: ${champion.mae.toFixed(3)}`);
  } else {
    console.log(`🤝 TIE: Both models have ${champion.mae.toFixed(3)} MAE`);
  }

  console.log('');

  // Overall verdict
  console.log('═'.repeat(80));
  console.log('   VERDICT');
  console.log('═'.repeat(80));
  console.log('');

  const championWins = (accuracyDiff > 0 ? 1 : 0) + (maeDiff < 0 ? 1 : 0);
  const legacyWins = (accuracyDiff < 0 ? 1 : 0) + (maeDiff > 0 ? 1 : 0);

  if (championWins > legacyWins) {
    console.log('🏆 CHAMPION MODEL (concernLevel) is the WINNER!');
    console.log('');
    console.log('   The concernLevel feature (synthesizing risk + sentiment + financials)');
    console.log('   provides better predictions than the legacy riskScore + sentimentScore.');
    console.log('');
    console.log('   ✅ RECOMMENDATION: Deploy champion model with concernLevel to production');
  } else if (legacyWins > championWins) {
    console.log('🏆 LEGACY MODEL (riskScore + sentimentScore) is the WINNER');
    console.log('');
    console.log('   The legacy features provide better predictions than concernLevel.');
    console.log('');
    console.log('   ⚠️  RECOMMENDATION: Keep legacy features, investigate concernLevel calibration');
  } else {
    console.log('🤝 TIE: Both models perform equally well');
    console.log('');
    console.log('   Choose champion (concernLevel) for:');
    console.log('   - Simpler feature engineering');
    console.log('   - Better interpretability (single 0-10 scale)');
    console.log('   - Easier to explain to users');
  }

  console.log('');
  console.log('═'.repeat(80));
  console.log('');

  // Save report
  const report = `
CHAMPION VS CHALLENGER COMPARISON REPORT
Generated: ${new Date().toISOString()}

LEGACY MODEL (riskScore + sentimentScore):
  Direction Accuracy: ${legacy.directionAccuracy.toFixed(1)}% (±${legacy.directionStd.toFixed(1)}%)
  MAE: ${legacy.mae.toFixed(3)}
  R²: ${legacy.r2.toFixed(3)}

CHAMPION MODEL (concernLevel):
  Direction Accuracy: ${champion.directionAccuracy.toFixed(1)}% (±${champion.directionStd.toFixed(1)}%)
  MAE: ${champion.mae.toFixed(3)}
  R²: ${champion.r2.toFixed(3)}

DIFFERENCE:
  Direction Accuracy: ${accuracyDiff > 0 ? '+' : ''}${accuracyDiff.toFixed(1)} percentage points
  MAE: ${maeDiff > 0 ? '+' : ''}${maeDiff.toFixed(3)}

VERDICT:
${championWins > legacyWins ? 'CHAMPION WINS' : legacyWins > championWins ? 'LEGACY WINS' : 'TIE'}

${
  championWins > legacyWins
    ? 'RECOMMENDATION: Deploy champion model with concernLevel to production'
    : legacyWins > championWins
    ? 'RECOMMENDATION: Keep legacy features, investigate concernLevel calibration'
    : 'RECOMMENDATION: Use champion for simplicity and interpretability'
}
`;

  fs.writeFile('champion-challenger-final-report.txt', report).catch(console.error);
}

async function main() {
  console.log('🚀 CHAMPION VS CHALLENGER MODEL COMPARISON\n');
  console.log('═'.repeat(80));
  console.log('');
  console.log('Testing:');
  console.log('  LEGACY MODEL:   riskScore + sentimentScore (original features)');
  console.log('  CHAMPION MODEL: concernLevel (synthesized multi-factor assessment)');
  console.log('');
  console.log('═'.repeat(80));
  console.log('');

  try {
    // Check if dataset exists
    try {
      await fs.access('data/ml_dataset_with_concern.csv');
    } catch {
      console.error('❌ ERROR: data/ml_dataset_with_concern.csv not found!');
      console.error('   Run: npx tsx scripts/export-ml-dataset-with-concern.ts');
      process.exit(1);
    }

    // Train both models
    const legacy = await trainLegacyModel();
    const champion = await trainChampionModel();

    // Print comparison
    printComparisonReport(legacy, champion);

    console.log('📝 Full report saved to: champion-challenger-final-report.txt\n');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
