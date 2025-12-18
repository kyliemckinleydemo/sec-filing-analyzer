#!/usr/bin/env python3
"""
EXPERIMENTAL: Multi-Factor Model

Combines promising signals discovered during research:
1. Earnings surprise (baseline ~5% edge)
2. Moderate short interest (5-10% sweet spot = +58% returns)
3. Pre-filing volume patterns (low volume = bullish)
4. Suspicious pattern detection

⚠️  EXPERIMENTAL - NOT FOR PRODUCTION USE
This is separate from the production model.
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score, confusion_matrix
import sys
import json
from datetime import datetime

# ============================================================
# CONFIGURATION
# ============================================================

RANDOM_STATE = 42
RETURN_THRESHOLD = 0.0

# Feature sets
BASELINE_FEATURES = [
    'epsSurprise',
    'surpriseMagnitude',
    'epsBeat',
    'epsMiss',
    'largeBeat',
    'largeMiss',
]

# New experimental features from our research
EXPERIMENTAL_FEATURES = [
    # Short interest features (5-10% is sweet spot)
    'moderate_short_interest',  # 5-10% SI (bullish signal)
    'high_short_interest',      # >15% SI (bearish signal)
    'short_squeeze_setup',      # High SI + beat

    # Volume features (counterintuitive - low is bullish)
    'low_volume',               # <0.8x baseline (bullish)
    'high_volume',              # >1.3x baseline (bearish)
    'suspicious_pattern',       # Volume + SI + trend anomaly

    # Combined signals
    'beat_with_moderate_si',    # Beat + 5-10% SI (very bullish)
    'beat_with_low_volume',     # Beat + low volume (bullish)
]

# ============================================================
# FEATURE ENGINEERING
# ============================================================

def add_experimental_features(df):
    """Add experimental features based on research findings."""
    print("\n🔧 Engineering experimental features...")

    # Ensure we have required base features
    if 'short_interest' in df.columns:
        # Short interest features
        df['moderate_short_interest'] = (
            (df['short_interest'] >= 0.05) &
            (df['short_interest'] <= 0.10)
        ).astype(int)

        df['high_short_interest'] = (
            df['short_interest'] > 0.15
        ).astype(int)

        df['short_squeeze_setup'] = (
            (df['short_interest'] > 0.15) &
            (df['epsBeat'] == True)
        ).astype(int)

        print(f"   ✅ Added short interest features")
        print(f"      Moderate SI (5-10%): {df['moderate_short_interest'].sum()} samples")
        print(f"      High SI (>15%): {df['high_short_interest'].sum()} samples")
        print(f"      Squeeze setups: {df['short_squeeze_setup'].sum()} samples")
    else:
        print(f"   ⚠️  No short interest data - skipping SI features")
        df['moderate_short_interest'] = 0
        df['high_short_interest'] = 0
        df['short_squeeze_setup'] = 0

    # Volume features
    if 'abnormal_volume_ratio' in df.columns:
        df['low_volume'] = (
            df['abnormal_volume_ratio'] < 0.8
        ).astype(int)

        df['high_volume'] = (
            df['abnormal_volume_ratio'] > 1.3
        ).astype(int)

        print(f"   ✅ Added volume features")
        print(f"      Low volume: {df['low_volume'].sum()} samples")
        print(f"      High volume: {df['high_volume'].sum()} samples")
    else:
        print(f"   ⚠️  No volume data - skipping volume features")
        df['low_volume'] = 0
        df['high_volume'] = 0

    # Suspicious pattern (from volume analysis)
    if 'suspicious_pattern' not in df.columns:
        if all(col in df.columns for col in ['abnormal_volume_ratio', 'volume_trend_30d_pct', 'acceleration_ratio']):
            df['suspicious_pattern'] = (
                (df['abnormal_volume_ratio'] > 1.5) &
                (df['volume_trend_30d_pct'] > 15) &
                (df['acceleration_ratio'] > 1.3)
            ).astype(int)
            print(f"   ✅ Added suspicious pattern: {df['suspicious_pattern'].sum()} samples")
        else:
            df['suspicious_pattern'] = 0
            print(f"   ⚠️  Insufficient data for suspicious pattern")

    # Combined signals
    df['beat_with_moderate_si'] = (
        (df['epsBeat'] == True) &
        (df['moderate_short_interest'] == 1)
    ).astype(int)

    df['beat_with_low_volume'] = (
        (df['epsBeat'] == True) &
        (df['low_volume'] == 1)
    ).astype(int)

    print(f"   ✅ Added combined signals")
    print(f"      Beat + Moderate SI: {df['beat_with_moderate_si'].sum()} samples")
    print(f"      Beat + Low Volume: {df['beat_with_low_volume'].sum()} samples")

    return df

# ============================================================
# MODEL TRAINING
# ============================================================

def train_model(X_train, y_train, X_test, y_test, features, model_type='logistic'):
    """Train a model with given features."""

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train model
    if model_type == 'logistic':
        model = LogisticRegression(random_state=RANDOM_STATE, max_iter=1000, class_weight='balanced')
    elif model_type == 'rf':
        model = RandomForestClassifier(n_estimators=100, random_state=RANDOM_STATE, max_depth=10, class_weight='balanced')
    elif model_type == 'gbm':
        model = GradientBoostingClassifier(n_estimators=100, random_state=RANDOM_STATE, max_depth=5)

    model.fit(X_train_scaled, y_train)

    # Predict
    y_pred = model.predict(X_test_scaled)
    y_pred_proba = model.predict_proba(X_test_scaled)[:, 1]

    # Metrics
    accuracy = accuracy_score(y_test, y_pred)

    try:
        auc = roc_auc_score(y_test, y_pred_proba)
    except:
        auc = 0.5

    cm = confusion_matrix(y_test, y_pred)
    if cm.size == 4:
        tn, fp, fn, tp = cm.ravel()
    else:
        tn, fp, fn, tp = 0, 0, 0, len(y_test)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

    # Feature importance
    if hasattr(model, 'coef_'):
        importance = model.coef_[0]
    elif hasattr(model, 'feature_importances_'):
        importance = model.feature_importances_
    else:
        importance = np.zeros(len(features))

    return {
        'model': model,
        'scaler': scaler,
        'accuracy': accuracy,
        'auc': auc,
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'confusion_matrix': {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)},
        'feature_importance': dict(zip(features, importance))
    }

def evaluate_returns(y_pred, y_test, returns_test):
    """Calculate return metrics."""
    pred_pos_mask = y_pred == 1
    pred_neg_mask = y_pred == 0

    if pred_pos_mask.sum() > 0:
        avg_return_pos = returns_test[pred_pos_mask].mean()
    else:
        avg_return_pos = 0

    if pred_neg_mask.sum() > 0:
        avg_return_neg = returns_test[pred_neg_mask].mean()
    else:
        avg_return_neg = 0

    spread = avg_return_pos - avg_return_neg

    return {
        'avg_return_pos': float(avg_return_pos),
        'avg_return_neg': float(avg_return_neg),
        'spread': float(spread),
        'n_pos_pred': int(pred_pos_mask.sum()),
        'n_neg_pred': int(pred_neg_mask.sum()),
    }

# ============================================================
# MAIN
# ============================================================

def main(earnings_csv, short_interest_csv=None, volume_csv=None):
    """Main training pipeline."""
    print("="*80)
    print("  EXPERIMENTAL: MULTI-FACTOR MODEL")
    print("="*80)
    print("\n⚠️  This is experimental research - NOT for production\n")

    # ============================================================
    # LOAD DATA
    # ============================================================

    print("="*80)
    print("DATA LOADING")
    print("="*80)

    # Load earnings data (cleaned)
    print(f"\n📊 Loading earnings data from {earnings_csv}...")
    df = pd.read_csv(earnings_csv)
    df['filingDate'] = pd.to_datetime(df['filingDate'])
    df = df.sort_values('filingDate')

    print(f"  ✅ Loaded {len(df)} samples")

    # Load short interest data if available
    if short_interest_csv and pd.io.common.file_exists(short_interest_csv):
        print(f"\n📊 Loading short interest data from {short_interest_csv}...")
        si_df = pd.read_csv(short_interest_csv)

        # Merge on ticker and filing date
        si_df['filingDate'] = pd.to_datetime(si_df['filingDate'])
        df = df.merge(
            si_df[['ticker', 'filingDate', 'short_interest']],
            on=['ticker', 'filingDate'],
            how='left'
        )
        print(f"  ✅ Merged short interest ({df['short_interest'].notna().sum()} matches)")

    # Load volume data if available
    if volume_csv and pd.io.common.file_exists(volume_csv):
        print(f"\n📊 Loading volume data from {volume_csv}...")
        vol_df = pd.read_csv(volume_csv)

        # Merge on filingId (only raw columns that exist)
        df = df.merge(
            vol_df[['filingId', 'abnormal_volume_ratio', 'volume_trend_30d_pct',
                    'acceleration_ratio']],
            on='filingId',
            how='left'
        )
        print(f"  ✅ Merged volume data ({df['abnormal_volume_ratio'].notna().sum()} matches)")

    # Add experimental features
    df = add_experimental_features(df)

    # Create target
    df['target'] = (df['actual7dReturn'] > RETURN_THRESHOLD).astype(int)

    print(f"\n📊 Final Dataset:")
    print(f"   Total samples: {len(df)}")
    print(f"   Positive returns: {df['target'].sum()} ({df['target'].mean()*100:.1f}%)")
    print(f"   Date range: {df['filingDate'].min().date()} to {df['filingDate'].max().date()}")

    # ============================================================
    # TRAIN/TEST SPLIT
    # ============================================================

    split_idx = int(len(df) * 0.7)
    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()

    print(f"\n📊 Train/Test Split:")
    print(f"   Training:   {len(train_df)} samples ({train_df['filingDate'].min().date()} to {train_df['filingDate'].max().date()})")
    print(f"   Testing:    {len(test_df)} samples ({test_df['filingDate'].min().date()} to {test_df['filingDate'].max().date()})")

    # ============================================================
    # TRAIN MODELS
    # ============================================================

    print("\n" + "="*80)
    print("MODEL TRAINING")
    print("="*80)

    results = []

    # Model 1: Baseline (Earnings Only)
    print("\n📊 Model 1: Baseline (Earnings Only)")
    print("-" * 80)

    baseline_features = [f for f in BASELINE_FEATURES if f in df.columns]
    X_train_baseline = train_df[baseline_features].fillna(0)
    X_test_baseline = test_df[baseline_features].fillna(0)

    baseline_result = train_model(
        X_train_baseline, train_df['target'],
        X_test_baseline, test_df['target'],
        baseline_features, 'logistic'
    )

    baseline_returns = evaluate_returns(
        baseline_result['model'].predict(baseline_result['scaler'].transform(X_test_baseline)),
        test_df['target'].values,
        test_df['actual7dReturn'].values
    )

    print(f"   Accuracy:  {baseline_result['accuracy']:.1%}")
    print(f"   AUC:       {baseline_result['auc']:.3f}")
    print(f"   Precision: {baseline_result['precision']:.1%}")
    print(f"   Recall:    {baseline_result['recall']:.1%}")
    print(f"   Return Spread: {baseline_returns['spread']*100:+.2f} pts")

    results.append({
        'name': 'Baseline (Earnings)',
        'features': baseline_features,
        'metrics': baseline_result,
        'returns': baseline_returns,
    })

    # Model 2: Multi-Factor (Earnings + Experimental)
    print("\n📊 Model 2: Multi-Factor (Earnings + Short Interest + Volume)")
    print("-" * 80)

    multi_features = baseline_features + [f for f in EXPERIMENTAL_FEATURES if f in df.columns]
    X_train_multi = train_df[multi_features].fillna(0)
    X_test_multi = test_df[multi_features].fillna(0)

    multi_result = train_model(
        X_train_multi, train_df['target'],
        X_test_multi, test_df['target'],
        multi_features, 'logistic'
    )

    multi_returns = evaluate_returns(
        multi_result['model'].predict(multi_result['scaler'].transform(X_test_multi)),
        test_df['target'].values,
        test_df['actual7dReturn'].values
    )

    print(f"   Accuracy:  {multi_result['accuracy']:.1%}")
    print(f"   AUC:       {multi_result['auc']:.3f}")
    print(f"   Precision: {multi_result['precision']:.1%}")
    print(f"   Recall:    {multi_result['recall']:.1%}")
    print(f"   Return Spread: {multi_returns['spread']*100:+.2f} pts")

    results.append({
        'name': 'Multi-Factor',
        'features': multi_features,
        'metrics': multi_result,
        'returns': multi_returns,
    })

    # Model 3: Random Forest Multi-Factor
    print("\n📊 Model 3: Random Forest Multi-Factor")
    print("-" * 80)

    rf_result = train_model(
        X_train_multi, train_df['target'],
        X_test_multi, test_df['target'],
        multi_features, 'rf'
    )

    rf_returns = evaluate_returns(
        rf_result['model'].predict(rf_result['scaler'].transform(X_test_multi)),
        test_df['target'].values,
        test_df['actual7dReturn'].values
    )

    print(f"   Accuracy:  {rf_result['accuracy']:.1%}")
    print(f"   AUC:       {rf_result['auc']:.3f}")
    print(f"   Precision: {rf_result['precision']:.1%}")
    print(f"   Recall:    {rf_result['recall']:.1%}")
    print(f"   Return Spread: {rf_returns['spread']*100:+.2f} pts")

    results.append({
        'name': 'Random Forest',
        'features': multi_features,
        'metrics': rf_result,
        'returns': rf_returns,
    })

    # ============================================================
    # COMPARISON
    # ============================================================

    print("\n" + "="*80)
    print("MODEL COMPARISON")
    print("="*80)

    print(f"\n{'Model':<25} {'Accuracy':<12} {'AUC':<10} {'Precision':<12} {'Spread':<15} {'Status'}")
    print("-" * 80)

    for result in results:
        name = result['name']
        metrics = result['metrics']
        returns = result['returns']

        if returns['spread'] > 0.05:
            status = "✅ Good"
        elif returns['spread'] > 0:
            status = "👍 OK"
        else:
            status = "❌ Weak"

        print(f"{name:<25} {metrics['accuracy']:<12.1%} {metrics['auc']:<10.3f} {metrics['precision']:<12.1%} {returns['spread']*100:<+14.2f}% {status}")

    # Find best model
    best_model = max(results, key=lambda x: x['returns']['spread'])

    print(f"\n🏆 Best Model: {best_model['name']}")
    print(f"   Return Spread: {best_model['returns']['spread']*100:+.2f}%")
    print(f"   Accuracy: {best_model['metrics']['accuracy']:.1%}")

    # Feature importance for best model
    print(f"\n📊 Top Features (by importance):")
    fi = sorted(best_model['metrics']['feature_importance'].items(), key=lambda x: abs(x[1]), reverse=True)
    for feat, importance in fi[:10]:
        direction = "📈" if importance > 0 else "📉"
        print(f"   {feat:<30} {importance:>+8.4f} {direction}")

    # ============================================================
    # SAVE RESULTS
    # ============================================================

    output = {
        'timestamp': datetime.now().isoformat(),
        'dataset_size': len(df),
        'train_size': len(train_df),
        'test_size': len(test_df),
        'models': [
            {
                'name': r['name'],
                'accuracy': r['metrics']['accuracy'],
                'auc': r['metrics']['auc'],
                'precision': r['metrics']['precision'],
                'recall': r['metrics']['recall'],
                'f1': r['metrics']['f1'],
                'return_spread': r['returns']['spread'],
                'avg_return_pos': r['returns']['avg_return_pos'],
                'avg_return_neg': r['returns']['avg_return_neg'],
                'feature_importance': r['metrics']['feature_importance'],
            }
            for r in results
        ],
        'best_model': best_model['name'],
    }

    with open('experimental-multi-factor-results.json', 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✅ Results saved to: experimental-multi-factor-results.json")

    # ============================================================
    # CONCLUSION
    # ============================================================

    print("\n" + "="*80)
    print("CONCLUSION")
    print("="*80)

    improvement = best_model['returns']['spread'] * 100
    baseline_spread = results[0]['returns']['spread'] * 100

    print(f"\n💡 Multi-Factor Model Performance:\n")

    if improvement > 5:
        print(f"   🎯 SUCCESS: Multi-factor model shows promise!")
        print(f"      Best spread: {improvement:+.2f}%")
        print(f"      Baseline spread: {baseline_spread:+.2f}%")
        print(f"      Improvement: {improvement - baseline_spread:+.2f} pts")
        print(f"\n   ✅ Consider further development and paper trading")
    elif improvement > 0:
        print(f"   👍 MODEST IMPROVEMENT")
        print(f"      Best spread: {improvement:+.2f}%")
        print(f"      Needs more work before production")
    else:
        print(f"   ❌ NO IMPROVEMENT")
        print(f"      Multi-factor didn't help")
        print(f"      May need different features or approach")

    print(f"\n⚠️  REMEMBER: This is experimental - NOT for production use")
    print(f"   - Test on additional out-of-sample data")
    print(f"   - Paper trade before real money")
    print(f"   - Monitor for model drift")

    print("\n" + "="*80)
    print("✅ EXPERIMENTAL ANALYSIS COMPLETE")
    print("="*80)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 train-multi-factor-model.py <earnings_csv> [short_interest_csv] [volume_csv]")
        print("\nExample:")
        print("  python3 train-multi-factor-model.py model-features-final-clean.csv short-interest-filings.csv prefiling-volume-data.csv")
        sys.exit(1)

    earnings_csv = sys.argv[1]
    short_interest_csv = sys.argv[2] if len(sys.argv) > 2 else None
    volume_csv = sys.argv[3] if len(sys.argv) > 3 else None

    main(earnings_csv, short_interest_csv, volume_csv)
