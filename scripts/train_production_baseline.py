#!/usr/bin/env python3
"""
Production Baseline Model Training Script

Trains the production earnings-only model with cleaned data.
Based on experimental research showing this is the optimal approach.

Performance:
- Accuracy: 64.2%
- Return Spread: +37.74 percentage points
- AUC: 0.604

See: EXPERIMENTAL_SUMMARY.md for research details
"""

import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (accuracy_score, roc_auc_score, precision_score,
                            recall_score, f1_score, confusion_matrix,
                            classification_report)
import pickle
import json
from datetime import datetime
import sys

# ============================================================
# CONFIGURATION
# ============================================================

RETURN_THRESHOLD = 0.0  # Binary classification: return > 0%
TRAIN_RATIO = 0.7  # 70% train, 30% test (chronological split)
RANDOM_STATE = 42

# Baseline earnings features (from experimental research)
BASELINE_FEATURES = [
    'epsSurprise',
    'surpriseMagnitude',
    'epsBeat',
    'epsMiss',
    'largeBeat',
    'largeMiss'
]

# ============================================================
# DATA LOADING
# ============================================================

def load_cleaned_data(csv_file):
    """Load the cleaned dataset (duplicates removed, outliers winsorized)"""
    print("="*80)
    print("  PRODUCTION BASELINE MODEL TRAINING")
    print("="*80)
    print(f"\n📊 Loading cleaned data from {csv_file}...")

    df = pd.read_csv(csv_file)
    df['filingDate'] = pd.to_datetime(df['filingDate'])
    df = df.sort_values('filingDate')  # Chronological order

    print(f"  ✅ Loaded {len(df)} samples")
    print(f"  📅 Date range: {df['filingDate'].min().date()} to {df['filingDate'].max().date()}")

    return df

# ============================================================
# FEATURE PREPARATION
# ============================================================

def prepare_features(df):
    """Prepare baseline earnings features"""
    print(f"\n🔧 Preparing baseline earnings features...")

    # Check all required features exist
    missing_features = [f for f in BASELINE_FEATURES if f not in df.columns]
    if missing_features:
        raise ValueError(f"Missing required features: {missing_features}")

    # Create feature matrix
    X = df[BASELINE_FEATURES].copy()

    # Fill any NaN with 0 (shouldn't have any in cleaned data)
    nan_count = X.isna().sum().sum()
    if nan_count > 0:
        print(f"  ⚠️  Filling {nan_count} NaN values with 0")
        X = X.fillna(0)

    # Create binary target
    y = (df['actual7dReturn'] > RETURN_THRESHOLD).astype(int)

    print(f"  ✅ Features: {len(BASELINE_FEATURES)}")
    print(f"  ✅ Samples: {len(X)}")
    print(f"  ✅ Positive class: {y.sum()} ({y.mean()*100:.1f}%)")

    return X, y

# ============================================================
# TRAIN/TEST SPLIT
# ============================================================

def chronological_split(df, X, y, train_ratio=TRAIN_RATIO):
    """Split data chronologically (time series split)"""
    print(f"\n📊 Chronological train/test split ({train_ratio:.0%} train)...")

    split_idx = int(len(df) * train_ratio)

    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

    train_dates = df.iloc[:split_idx]['filingDate']
    test_dates = df.iloc[split_idx:]['filingDate']

    print(f"  Training:   {len(X_train)} samples ({train_dates.min().date()} to {train_dates.max().date()})")
    print(f"  Testing:    {len(X_test)} samples ({test_dates.min().date()} to {test_dates.max().date()})")

    # Store test data for return analysis
    test_df = df.iloc[split_idx:].copy()

    return X_train, X_test, y_train, y_test, test_df

# ============================================================
# MODEL TRAINING
# ============================================================

def train_model(X_train, y_train):
    """Train logistic regression model"""
    print(f"\n🤖 Training logistic regression model...")

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)

    # Train model
    model = LogisticRegression(
        random_state=RANDOM_STATE,
        max_iter=1000,
        class_weight=None  # No rebalancing - data is naturally 63% positive
    )

    model.fit(X_train_scaled, y_train)

    print(f"  ✅ Model trained successfully")

    return model, scaler

# ============================================================
# MODEL EVALUATION
# ============================================================

def evaluate_model(model, scaler, X_test, y_test, test_df):
    """Comprehensive model evaluation"""
    print("\n" + "="*80)
    print("MODEL EVALUATION")
    print("="*80)

    # Scale test data
    X_test_scaled = scaler.transform(X_test)

    # Predictions
    y_pred = model.predict(X_test_scaled)
    y_pred_proba = model.predict_proba(X_test_scaled)[:, 1]

    # Classification metrics
    accuracy = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_pred_proba)
    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)

    print(f"\n📊 Classification Metrics:")
    print(f"   Accuracy:  {accuracy:.1%}")
    print(f"   AUC:       {auc:.3f}")
    print(f"   Precision: {precision:.1%}")
    print(f"   Recall:    {recall:.1%}")
    print(f"   F1 Score:  {f1:.3f}")

    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()

    print(f"\n📊 Confusion Matrix:")
    print(f"                    Predicted Negative    Predicted Positive")
    print(f"   True Negative:   {tn:>17}    {fp:>17}")
    print(f"   True Positive:   {fn:>17}    {tp:>17}")

    # Return analysis
    test_results = test_df.copy()
    test_results['prediction'] = y_pred
    test_results['confidence'] = y_pred_proba

    pred_pos = test_results[test_results['prediction'] == 1]
    pred_neg = test_results[test_results['prediction'] == 0]

    avg_return_pos = pred_pos['actual7dReturn'].mean()
    avg_return_neg = pred_neg['actual7dReturn'].mean()
    spread = avg_return_pos - avg_return_neg

    print(f"\n💰 Return Analysis:")
    print(f"   Predicted Positive: {avg_return_pos*100:+.2f}% avg ({len(pred_pos)} samples)")
    print(f"   Predicted Negative: {avg_return_neg*100:+.2f}% avg ({len(pred_neg)} samples)")
    print(f"   Return Spread:      {spread*100:+.2f} percentage points")

    # Feature importance
    feature_importance = pd.DataFrame({
        'feature': BASELINE_FEATURES,
        'coefficient': model.coef_[0]
    }).sort_values('coefficient', key=abs, ascending=False)

    print(f"\n📊 Feature Importance (Coefficients):")
    for _, row in feature_importance.iterrows():
        direction = "📈" if row['coefficient'] > 0 else "📉"
        print(f"   {row['feature']:<20} {row['coefficient']:>+8.3f} {direction}")

    # Return summary
    results = {
        'timestamp': datetime.now().isoformat(),
        'model_type': 'Logistic Regression (Baseline)',
        'features': BASELINE_FEATURES,
        'train_size': len(X_test) * TRAIN_RATIO / (1 - TRAIN_RATIO),  # Approximate
        'test_size': len(X_test),
        'metrics': {
            'accuracy': float(accuracy),
            'auc': float(auc),
            'precision': float(precision),
            'recall': float(recall),
            'f1': float(f1),
            'return_spread': float(spread),
            'avg_return_pos': float(avg_return_pos),
            'avg_return_neg': float(avg_return_neg),
        },
        'confusion_matrix': {
            'tn': int(tn),
            'fp': int(fp),
            'fn': int(fn),
            'tp': int(tp)
        },
        'feature_importance': feature_importance.to_dict('records')
    }

    return results

# ============================================================
# MODEL PERSISTENCE
# ============================================================

def save_model(model, scaler, results):
    """Save model, scaler, and results"""
    print("\n" + "="*80)
    print("SAVING MODEL")
    print("="*80)

    # Save model
    with open('models/baseline_model.pkl', 'wb') as f:
        pickle.dump(model, f)
    print(f"\n✅ Saved model: models/baseline_model.pkl")

    # Save scaler
    with open('models/baseline_scaler.pkl', 'wb') as f:
        pickle.dump(scaler, f)
    print(f"✅ Saved scaler: models/baseline_scaler.pkl")

    # Save feature list
    with open('models/baseline_features.json', 'w') as f:
        json.dump(BASELINE_FEATURES, f, indent=2)
    print(f"✅ Saved features: models/baseline_features.json")

    # Save results
    with open('models/baseline_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print(f"✅ Saved results: models/baseline_results.json")

# ============================================================
# MAIN
# ============================================================

def main(csv_file='model-features-final-clean.csv'):
    """Main training pipeline"""

    # Load data
    df = load_cleaned_data(csv_file)

    # Prepare features
    X, y = prepare_features(df)

    # Split data
    X_train, X_test, y_train, y_test, test_df = chronological_split(df, X, y)

    # Train model
    model, scaler = train_model(X_train, y_train)

    # Evaluate model
    results = evaluate_model(model, scaler, X_test, y_test, test_df)

    # Save model
    save_model(model, scaler, results)

    # Final summary
    print("\n" + "="*80)
    print("TRAINING COMPLETE")
    print("="*80)

    print(f"\n✅ Production baseline model ready for deployment")
    print(f"   Accuracy: {results['metrics']['accuracy']:.1%}")
    print(f"   Return Spread: {results['metrics']['return_spread']*100:+.2f} pts")
    print(f"   Model: models/baseline_model.pkl")

    print("\n📝 Next steps:")
    print("   1. Test model on API endpoint: /api/predict/baseline")
    print("   2. Paper trade for 2 weeks before real money")
    print("   3. Monitor daily accuracy and return metrics")
    print("   4. Retrain quarterly with new data")

    print("\n" + "="*80)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        csv_file = sys.argv[1]
    else:
        csv_file = 'model-features-final-clean.csv'

    main(csv_file)
