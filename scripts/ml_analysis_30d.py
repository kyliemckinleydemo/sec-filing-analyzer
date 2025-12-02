#!/usr/bin/env python3
"""
ML Analysis with 30-Day Returns

Compares 7-day vs 30-day returns to find optimal prediction horizon
Also tests alpha (market-relative) predictions
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from sklearn.linear_model import Ridge, Lasso, ElasticNet
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score
import warnings
warnings.filterwarnings('ignore')

def load_data():
    """Load the dataset"""
    print("📊 Loading data...")
    df = pd.read_csv('data/ml_dataset.csv')
    print(f"   Loaded {len(df)} samples")
    return df

def direction_accuracy(y_true, y_pred):
    """Calculate direction accuracy"""
    correct = np.sum(np.sign(y_true) == np.sign(y_pred))
    return correct / len(y_true) * 100

def prepare_features(df, target_col):
    """Prepare features for given target"""
    # Drop rows where target is null
    df_clean = df[df[target_col].notna()].copy()

    if len(df_clean) == 0:
        return None, None, None, 0

    y = df_clean[target_col].values

    # Exclude columns
    exclude_cols = ['filingId', 'ticker', 'companyName', 'filingDate',
                   'actual7dReturn', 'actual30dReturn', 'actual7dAlpha', 'actual30dAlpha',
                   'marketCapCategory']

    feature_cols = [col for col in df_clean.columns if col not in exclude_cols]
    X = df_clean[feature_cols].copy()

    # Handle categorical
    X['is_10K'] = (df_clean['filingType'] == '10-K').astype(int)
    X['is_10Q'] = (df_clean['filingType'] == '10-Q').astype(int)
    X = X.drop('filingType', axis=1)

    # Drop high-missing features
    missing_pct = X.isnull().sum() / len(X)
    cols_to_drop = missing_pct[missing_pct > 0.5].index.tolist()
    if cols_to_drop:
        X = X.drop(columns=cols_to_drop)

    # Fill NaN
    for col in X.columns:
        if X[col].isna().sum() > 0:
            X[col].fillna(X[col].median(), inplace=True)

    return X, y, list(X.columns), len(df_clean)

def evaluate_model_quick(model, X, y, model_name):
    """Quick evaluation with time-series CV"""
    tscv = TimeSeriesSplit(n_splits=5)

    direction_accs = []
    maes = []

    for train_idx, test_idx in tscv.split(X):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]

        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)

        model.fit(X_train_scaled, y_train)
        y_pred = model.predict(X_test_scaled)

        direction_accs.append(direction_accuracy(y_test, y_pred))
        maes.append(mean_absolute_error(y_test, y_pred))

    return {
        'model': model_name,
        'direction_accuracy': np.mean(direction_accs),
        'direction_std': np.std(direction_accs),
        'mae': np.mean(maes)
    }

def compare_targets(df):
    """Compare different target variables"""
    print("\n" + "=" * 80)
    print("   COMPARING PREDICTION TARGETS")
    print("=" * 80)

    targets = {
        'actual7dReturn': '7-Day Absolute Return',
        'actual30dReturn': '30-Day Absolute Return',
        'actual7dAlpha': '7-Day Alpha (vs SPX)',
        'actual30dAlpha': '30-Day Alpha (vs SPX)'
    }

    results = []

    for target_col, target_name in targets.items():
        print(f"\n📊 {target_name}:")

        X, y, features, n_samples = prepare_features(df, target_col)

        if X is None:
            print(f"   ⚠️  No data available")
            continue

        print(f"   Samples: {n_samples}")
        print(f"   Features: {X.shape[1]}")
        print(f"   Mean target: {np.mean(y):.2f}%, Std: {np.std(y):.2f}%")

        # Test ElasticNet (our best model)
        model = ElasticNet(alpha=0.1, l1_ratio=0.5, max_iter=5000)
        result = evaluate_model_quick(model, X, y, target_name)
        result['target'] = target_col
        result['n_samples'] = n_samples
        results.append(result)

        print(f"   ✅ ElasticNet: {result['direction_accuracy']:.1f}% (±{result['direction_std']:.1f}), MAE={result['mae']:.3f}")

    return results

def main():
    print("=" * 80)
    print("   ML ANALYSIS: 7-DAY VS 30-DAY RETURNS")
    print("=" * 80)

    df = load_data()

    # Compare all targets
    results = compare_targets(df)

    # Summary table
    print("\n" + "=" * 80)
    print("   SUMMARY: WHICH TARGET PERFORMS BEST?")
    print("=" * 80)

    print(f"\n{'Target':<30} {'Samples':<10} {'Direction %':<15} {'MAE':<10}")
    print("-" * 80)

    for r in sorted(results, key=lambda x: x['direction_accuracy'], reverse=True):
        print(f"{r['model']:<30} {r['n_samples']:<10} {r['direction_accuracy']:>6.1f}% ±{r['direction_std']:.1f}  {r['mae']:>8.3f}")

    # Find best
    best = max(results, key=lambda x: x['direction_accuracy'])
    print(f"\n🏆 BEST TARGET: {best['model']}")
    print(f"   Direction Accuracy: {best['direction_accuracy']:.1f}% (±{best['direction_std']:.1f}%)")
    print(f"   MAE: {best['mae']:.3f}")
    print(f"   Samples: {best['n_samples']}")

    improvement = best['direction_accuracy'] - 63.8  # vs our 7-day baseline
    print(f"\n   📈 Improvement vs 7-day baseline: {improvement:+.1f} percentage points")

    if best['direction_accuracy'] >= 65.0:
        print("\n   ✅ TARGET ACHIEVED: 65%+ accuracy!")
    else:
        needed = 65.0 - best['direction_accuracy']
        print(f"\n   📋 Need {needed:.1f} more points to reach 65%")

    print("\n" + "=" * 80)

if __name__ == '__main__':
    main()
