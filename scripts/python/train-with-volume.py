#!/usr/bin/env python3
"""
Train Model with Volume Features

Tests if adding pre-filing volume features improves the baseline earnings model.

Models tested:
1. Baseline: Earnings surprise only (60.26% accuracy)
2. Baseline + Volume: Add volume features
3. Full: Baseline + Volume + AI features

Goal: See if volume improves prediction accuracy
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score, confusion_matrix
import sys
import json
from datetime import datetime

# ============================================================
# CONFIGURATION
# ============================================================

RETURN_THRESHOLD = 0.0  # 0% - positive vs negative
RANDOM_STATE = 42

# Feature sets
BASELINE_FEATURES = [
    'epsSurprise',
    'surpriseMagnitude',
    'epsBeat',
    'epsMiss',
    'largeBeat',
    'largeMiss',
]

VOLUME_FEATURES = [
    'abnormal_volume_ratio',
    'volume_percentile',
    'low_volume',
    'high_volume',
    'rising_volume',
    'suspicious_pattern',
]

AI_FEATURES = [
    'riskScore',
    'sentimentScore',
    'guidanceRaised',
    'guidanceLowered',
]

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def load_data(csv_file):
    """Load and prepare data."""
    print(f"\n📊 Loading data from {csv_file}...")

    df = pd.read_csv(csv_file)
    df['filingDate'] = pd.to_datetime(df['filingDate'])
    df = df.sort_values('filingDate').reset_index(drop=True)

    print(f"  ✅ Loaded {len(df)} samples")

    # Create binary target
    df['target'] = (df['actual7dReturn'] > RETURN_THRESHOLD).astype(int)

    return df

def prepare_features(df, feature_list):
    """Prepare feature matrix."""
    available_features = [f for f in feature_list if f in df.columns]
    missing_features = [f for f in feature_list if f not in df.columns]

    if missing_features:
        print(f"  ⚠️  Missing features: {', '.join(missing_features)}")

    X = df[available_features].copy()
    y = df['target'].copy()

    # Fill NaN with 0
    X = X.fillna(0)

    return X, y, available_features

def evaluate_model(model, X_test, y_test, test_df, model_name):
    """Evaluate model and return metrics."""
    y_pred = model.predict(X_test)
    y_pred_proba = model.predict_proba(X_test)[:, 1]

    # Basic metrics
    accuracy = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_pred_proba)

    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()

    # Return analysis
    test_df_copy = test_df.copy()
    test_df_copy['prediction'] = y_pred

    pos_pred = test_df_copy[test_df_copy['prediction'] == 1]
    neg_pred = test_df_copy[test_df_copy['prediction'] == 0]

    avg_return_pos = pos_pred['actual7dReturn'].mean() if len(pos_pred) > 0 else 0
    avg_return_neg = neg_pred['actual7dReturn'].mean() if len(neg_pred) > 0 else 0
    return_spread = avg_return_pos - avg_return_neg

    # Precision/Recall
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

    results = {
        'model_name': model_name,
        'accuracy': float(accuracy),
        'auc': float(auc),
        'precision': float(precision),
        'recall': float(recall),
        'f1': float(f1),
        'true_positives': int(tp),
        'false_positives': int(fp),
        'true_negatives': int(tn),
        'false_negatives': int(fn),
        'avg_return_positive': float(avg_return_pos),
        'avg_return_negative': float(avg_return_neg),
        'return_spread': float(return_spread),
    }

    return results, y_pred, y_pred_proba

def print_results(results, features_used):
    """Print model results in formatted table."""
    print(f"\n{'='*80}")
    print(f"{results['model_name'].upper()}")
    print(f"{'='*80}")

    print(f"\n📊 Features: {len(features_used)}")
    print(f"   {', '.join(features_used[:5])}{'...' if len(features_used) > 5 else ''}")

    print(f"\n📈 Classification Metrics:")
    print(f"   Accuracy:  {results['accuracy']:.1%}")
    print(f"   AUC:       {results['auc']:.3f}")
    print(f"   Precision: {results['precision']:.1%}")
    print(f"   Recall:    {results['recall']:.1%}")
    print(f"   F1 Score:  {results['f1']:.3f}")

    print(f"\n💰 Return Analysis:")
    print(f"   Predicted Positive: {results['avg_return_positive']*100:+.2f}% avg return")
    print(f"   Predicted Negative: {results['avg_return_negative']*100:+.2f}% avg return")
    print(f"   Return Spread:      {results['return_spread']*100:+.2f}%")

    print(f"\n📊 Confusion Matrix:")
    print(f"                    Predicted Negative    Predicted Positive")
    print(f"   True Negative:   {results['true_negatives']:>17}    {results['false_positives']:>17}")
    print(f"   True Positive:   {results['false_negatives']:>17}    {results['true_positives']:>17}")

# ============================================================
# MODEL TRAINING
# ============================================================

def train_model(train_df, test_df, feature_list, model_name):
    """Train and evaluate a model."""
    print(f"\n{'='*80}")
    print(f"TRAINING: {model_name}")
    print(f"{'='*80}")

    # Prepare features
    X_train, y_train, features = prepare_features(train_df, feature_list)
    X_test, y_test, _ = prepare_features(test_df, features)

    print(f"\n📊 Training with {len(features)} features:")
    for feat in features:
        print(f"   - {feat}")

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train logistic regression
    model = LogisticRegression(random_state=RANDOM_STATE, max_iter=1000)
    model.fit(X_train_scaled, y_train)

    print(f"\n✅ Model trained on {len(train_df)} samples")
    print(f"✅ Testing on {len(test_df)} samples")

    # Evaluate
    results, y_pred, y_pred_proba = evaluate_model(model, X_test_scaled, y_test, test_df, model_name)

    # Feature importance (coefficients)
    feature_importance = pd.DataFrame({
        'feature': features,
        'coefficient': model.coef_[0]
    }).sort_values('coefficient', key=abs, ascending=False)

    print(f"\n📊 Top 5 Feature Importance:")
    for _, row in feature_importance.head(5).iterrows():
        print(f"   {row['feature']:<30} {row['coefficient']:>+8.3f}")

    return results, feature_importance, model, scaler

# ============================================================
# MAIN ANALYSIS
# ============================================================

def main(csv_file):
    """Main training pipeline."""
    print("="*80)
    print("  MODEL TRAINING WITH VOLUME FEATURES")
    print("="*80)
    print("\n🎯 Goal: Test if volume features improve the baseline model")
    print("   - Baseline: Earnings surprise only (60.26% benchmark)")
    print("   - Volume-Enhanced: Baseline + volume features")
    print("   - Full: Baseline + volume + AI features")

    # Load data
    df = load_data(csv_file)

    # Check volume feature coverage
    volume_coverage = df['abnormal_volume_ratio'].notna().sum() / len(df) * 100
    print(f"\n📊 Volume feature coverage: {volume_coverage:.1f}%")

    # Split data chronologically
    split_idx = int(len(df) * 0.7)
    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()

    print(f"\n📊 Train/Test Split:")
    print(f"   Training:   {len(train_df)} samples ({train_df['filingDate'].min().date()} to {train_df['filingDate'].max().date()})")
    print(f"   Testing:    {len(test_df)} samples ({test_df['filingDate'].min().date()} to {test_df['filingDate'].max().date()})")

    # Store results
    all_results = []
    all_feature_importance = {}

    # ============================================================
    # MODEL 1: BASELINE (Earnings Only)
    # ============================================================

    results_baseline, fi_baseline, model_baseline, scaler_baseline = train_model(
        train_df, test_df,
        BASELINE_FEATURES,
        "Baseline (Earnings Only)"
    )
    print_results(results_baseline, BASELINE_FEATURES)
    all_results.append(results_baseline)
    all_feature_importance['baseline'] = fi_baseline.to_dict('records')

    # ============================================================
    # MODEL 2: BASELINE + VOLUME
    # ============================================================

    results_volume, fi_volume, model_volume, scaler_volume = train_model(
        train_df, test_df,
        BASELINE_FEATURES + VOLUME_FEATURES,
        "Volume-Enhanced (Baseline + Volume)"
    )
    print_results(results_volume, BASELINE_FEATURES + VOLUME_FEATURES)
    all_results.append(results_volume)
    all_feature_importance['volume_enhanced'] = fi_volume.to_dict('records')

    # ============================================================
    # MODEL 3: FULL (Baseline + Volume + AI)
    # ============================================================

    results_full, fi_full, model_full, scaler_full = train_model(
        train_df, test_df,
        BASELINE_FEATURES + VOLUME_FEATURES + AI_FEATURES,
        "Full Model (Baseline + Volume + AI)"
    )
    print_results(results_full, BASELINE_FEATURES + VOLUME_FEATURES + AI_FEATURES)
    all_results.append(results_full)
    all_feature_importance['full'] = fi_full.to_dict('records')

    # ============================================================
    # COMPARISON
    # ============================================================

    print("\n" + "="*80)
    print("MODEL COMPARISON")
    print("="*80)

    print(f"\n{'Model':<35} {'Accuracy':<12} {'AUC':<10} {'F1':<10} {'Return Spread':<15} {'Status':<10}")
    print("-"*80)

    for result in all_results:
        name = result['model_name']
        acc = result['accuracy']
        auc = result['auc']
        f1 = result['f1']
        spread = result['return_spread']

        # Status indicator
        if name == "Baseline (Earnings Only)":
            status = "📊 Benchmark"
        elif acc > results_baseline['accuracy']:
            improvement = (acc - results_baseline['accuracy']) * 100
            status = f"✅ +{improvement:.1f}pts"
        elif acc < results_baseline['accuracy']:
            decline = (results_baseline['accuracy'] - acc) * 100
            status = f"❌ -{decline:.1f}pts"
        else:
            status = "➡️  Same"

        print(f"{name:<35} {acc:<12.1%} {auc:<10.3f} {f1:<10.3f} {spread*100:<+14.2f}% {status:<10}")

    # Determine winner
    best_model = max(all_results, key=lambda x: x['accuracy'])
    print(f"\n🏆 Best Model: {best_model['model_name']}")
    print(f"   Accuracy: {best_model['accuracy']:.1%}")
    print(f"   Improvement: {(best_model['accuracy'] - results_baseline['accuracy'])*100:+.1f} percentage points")

    # ============================================================
    # VOLUME FEATURE ANALYSIS
    # ============================================================

    print("\n" + "="*80)
    print("VOLUME FEATURE IMPACT")
    print("="*80)

    print("\n📊 Volume Feature Importance in Volume-Enhanced Model:\n")

    volume_fi = [f for f in fi_volume.to_dict('records') if f['feature'] in VOLUME_FEATURES]
    volume_fi_sorted = sorted(volume_fi, key=lambda x: abs(x['coefficient']), reverse=True)

    for feat in volume_fi_sorted:
        coef = feat['coefficient']
        name = feat['feature']
        direction = "📈 Bullish" if coef > 0 else "📉 Bearish"
        print(f"   {name:<30} {coef:>+8.3f}   {direction}")

    # Did volume help?
    volume_improvement = (results_volume['accuracy'] - results_baseline['accuracy']) * 100

    print(f"\n💡 Volume Feature Impact:")
    if volume_improvement > 1:
        print(f"   ✅ POSITIVE: Volume features improved accuracy by +{volume_improvement:.1f} pts")
        print(f"      Volume features are valuable - keep them in the model!")
    elif volume_improvement > 0:
        print(f"   👍 SLIGHT POSITIVE: Volume features improved accuracy by +{volume_improvement:.1f} pts")
        print(f"      Small improvement, but worth keeping")
    elif volume_improvement > -1:
        print(f"   ⚠️  NEUTRAL: Volume features had minimal impact ({volume_improvement:+.1f} pts)")
        print(f"      Consider removing to simplify model")
    else:
        print(f"   ❌ NEGATIVE: Volume features hurt accuracy by {volume_improvement:.1f} pts")
        print(f"      Remove volume features from the model")

    # Save results
    output = {
        'timestamp': datetime.now().isoformat(),
        'dataset_size': len(df),
        'train_size': len(train_df),
        'test_size': len(test_df),
        'volume_coverage_pct': float(volume_coverage),
        'models': all_results,
        'feature_importance': all_feature_importance,
        'best_model': best_model['model_name'],
        'volume_improvement_pts': float(volume_improvement),
    }

    output_file = 'volume-model-results.json'
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✅ Results saved to: {output_file}")

    # ============================================================
    # RECOMMENDATIONS
    # ============================================================

    print("\n" + "="*80)
    print("RECOMMENDATIONS")
    print("="*80)

    print("\n💡 Based on this analysis:\n")

    if volume_improvement > 1:
        print("   1. ✅ ADD volume features to production model")
        print("   2. Focus on these key volume features:")
        for feat in volume_fi_sorted[:3]:
            print(f"      - {feat['feature']}")
        print("   3. Expected accuracy: {:.1%}".format(results_volume['accuracy']))
        print("   4. Monitor performance on new data")
    elif volume_improvement > 0:
        print("   1. 👍 Consider adding volume features (small improvement)")
        print("   2. Test on larger dataset when full backfill completes")
        print("   3. May provide edge in specific scenarios")
    else:
        print("   1. ❌ Do NOT add volume features (hurt performance)")
        print("   2. Stick with baseline earnings model")
        print("   3. May need better volume feature engineering")
        print("   4. Or volume signal is too weak for this dataset")

    print("\n" + "="*80)
    print("✅ TRAINING COMPLETE")
    print("="*80)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 train-with-volume.py <csv_file>")
        print("Example: python3 train-with-volume.py model-features-with-volume.csv")
        sys.exit(1)

    csv_file = sys.argv[1]
    main(csv_file)
