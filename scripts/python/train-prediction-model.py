#!/usr/bin/env python3
"""
Train prediction models for SEC filing returns
Compares multiple approaches: baseline, enhanced, and ML models
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit, cross_val_score
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, roc_auc_score
import warnings
warnings.filterwarnings('ignore')

import sys
import json
from datetime import datetime

# ============================================================
# CONFIGURATION
# ============================================================

RETURN_THRESHOLD = 0.0  # 0% - positive vs negative
RANDOM_STATE = 42

# Feature sets for different models
BASELINE_FEATURES = [
    'epsSurprise',
    'surpriseMagnitude',
    'epsBeat',
    'epsMiss',
    'largeBeat',
    'largeMiss',
]

ENHANCED_FEATURES = BASELINE_FEATURES + [
    'riskScore',
    'sentimentScore',
    'guidanceRaised',
    'guidanceLowered',
]

FULL_FEATURES = ENHANCED_FEATURES + [
    'profitMargin',
    'debtToAssets',
]

# ============================================================
# DATA LOADING
# ============================================================

def load_data(csv_file):
    """Load and prepare data."""
    print(f"\n📊 Loading data from {csv_file}...")

    df = pd.read_csv(csv_file)

    # Convert date to datetime
    df['filingDate'] = pd.to_datetime(df['filingDate'])

    # Sort by date (chronological)
    df = df.sort_values('filingDate').reset_index(drop=True)

    print(f"  ✅ Loaded {len(df)} samples")
    print(f"  📅 Date range: {df['filingDate'].min()} to {df['filingDate'].max()}")

    # Create binary target (positive vs negative return)
    df['target'] = (df['actual7dReturn'] > RETURN_THRESHOLD).astype(int)

    positive_pct = (df['target'].sum() / len(df)) * 100
    print(f"  🎯 Target distribution: {df['target'].sum()} positive ({positive_pct:.1f}%)")

    return df

# ============================================================
# TRAIN/TEST SPLIT
# ============================================================

def time_series_split(df, train_pct=0.7):
    """Split data chronologically."""
    split_idx = int(len(df) * train_pct)

    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()

    print(f"\n📊 Train/Test Split:")
    print(f"  Training:   {len(train_df)} samples ({df['filingDate'].iloc[0]} to {train_df['filingDate'].iloc[-1]})")
    print(f"  Testing:    {len(test_df)} samples ({test_df['filingDate'].iloc[0]} to {df['filingDate'].iloc[-1]})")

    return train_df, test_df

# ============================================================
# FEATURE PREPARATION
# ============================================================

def prepare_features(df, feature_list):
    """Prepare feature matrix and handle missing values."""

    # Filter to features that exist in dataframe
    available_features = [f for f in feature_list if f in df.columns]
    missing_features = [f for f in feature_list if f not in df.columns]

    if missing_features:
        print(f"  ⚠️  Missing features: {missing_features}")

    X = df[available_features].copy()
    y = df['target'].copy()

    # Handle missing values
    # For numeric features: fill with 0
    # For boolean features: fill with False (0)
    X = X.fillna(0)

    print(f"  ✅ Using {len(available_features)} features")

    return X, y, available_features

# ============================================================
# MODEL TRAINING
# ============================================================

def train_baseline_model(train_df):
    """Train baseline model: earnings surprise only."""
    print("\n" + "="*80)
    print("MODEL 1: BASELINE (Earnings Surprise Only)")
    print("="*80)

    X_train, y_train, features = prepare_features(train_df, BASELINE_FEATURES)

    # Simple logistic regression
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)

    model = LogisticRegression(random_state=RANDOM_STATE, max_iter=1000)
    model.fit(X_train_scaled, y_train)

    # Feature importance
    print("\n📊 Feature Importance:")
    for feat, coef in sorted(zip(features, model.coef_[0]), key=lambda x: abs(x[1]), reverse=True):
        print(f"  {feat:20s} {coef:+.4f}")

    return model, scaler, features

def train_enhanced_model(train_df):
    """Train enhanced model: surprise + AI features."""
    print("\n" + "="*80)
    print("MODEL 2: ENHANCED (Surprise + AI Analysis)")
    print("="*80)

    X_train, y_train, features = prepare_features(train_df, ENHANCED_FEATURES)

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)

    # Logistic regression with L2 regularization
    model = LogisticRegression(random_state=RANDOM_STATE, max_iter=1000, C=1.0)
    model.fit(X_train_scaled, y_train)

    # Feature importance
    print("\n📊 Feature Importance:")
    for feat, coef in sorted(zip(features, model.coef_[0]), key=lambda x: abs(x[1]), reverse=True):
        print(f"  {feat:20s} {coef:+.4f}")

    return model, scaler, features

def train_ml_model(train_df):
    """Train ML model: gradient boosting."""
    print("\n" + "="*80)
    print("MODEL 3: MACHINE LEARNING (Gradient Boosting)")
    print("="*80)

    X_train, y_train, features = prepare_features(train_df, FULL_FEATURES)

    # Gradient boosting (no scaling needed)
    model = GradientBoostingClassifier(
        n_estimators=100,
        learning_rate=0.1,
        max_depth=3,
        random_state=RANDOM_STATE
    )
    model.fit(X_train, y_train)

    # Feature importance
    print("\n📊 Feature Importance:")
    for feat, imp in sorted(zip(features, model.feature_importances_), key=lambda x: x[1], reverse=True):
        if imp > 0.01:  # Only show important features
            bar = '█' * int(imp * 50)
            print(f"  {feat:20s} {imp:.4f} {bar}")

    return model, None, features

# ============================================================
# EVALUATION
# ============================================================

def evaluate_model(model, scaler, features, test_df, model_name):
    """Evaluate model on test set."""
    print(f"\n{'='*80}")
    print(f"EVALUATION: {model_name}")
    print('='*80)

    X_test, y_test, _ = prepare_features(test_df, features)

    # Scale if needed
    if scaler:
        X_test = scaler.transform(X_test)

    # Predictions
    y_pred = model.predict(X_test)
    y_pred_proba = model.predict_proba(X_test)[:, 1]

    # Metrics
    accuracy = accuracy_score(y_test, y_pred)

    try:
        auc = roc_auc_score(y_test, y_pred_proba)
    except:
        auc = None

    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

    print(f"\n📊 Performance Metrics:")
    print(f"  Accuracy:     {accuracy:.4f} ({accuracy*100:.2f}%)")
    if auc:
        print(f"  AUC:          {auc:.4f}")
    print(f"  Precision:    {precision:.4f}")
    print(f"  Recall:       {recall:.4f}")
    print(f"  F1 Score:     {f1:.4f}")

    print(f"\n📊 Confusion Matrix:")
    print(f"  True Negatives:  {tn:4d}    False Positives: {fp:4d}")
    print(f"  False Negatives: {fn:4d}    True Positives:  {tp:4d}")

    # Returns by prediction
    test_df_copy = test_df.copy()
    test_df_copy['prediction'] = y_pred

    pos_pred_returns = test_df_copy[test_df_copy['prediction'] == 1]['actual7dReturn'].mean()
    neg_pred_returns = test_df_copy[test_df_copy['prediction'] == 0]['actual7dReturn'].mean()

    print(f"\n📈 Average Returns:")
    print(f"  Predicted Positive: {pos_pred_returns*100:+.2f}%")
    print(f"  Predicted Negative: {neg_pred_returns*100:+.2f}%")
    print(f"  Difference:         {(pos_pred_returns - neg_pred_returns)*100:+.2f}%")

    return {
        'model_name': model_name,
        'accuracy': accuracy,
        'auc': auc,
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'pos_pred_return': pos_pred_returns,
        'neg_pred_return': neg_pred_returns,
        'return_diff': pos_pred_returns - neg_pred_returns,
    }

# ============================================================
# MAIN
# ============================================================

def main(csv_file):
    """Main training pipeline."""
    print("="*80)
    print("  SEC FILING PREDICTION MODEL TRAINING")
    print("="*80)
    print(f"\n📊 Configuration:")
    print(f"   • Return threshold: {RETURN_THRESHOLD*100:.1f}%")
    print(f"   • Train/Test split: 70/30 (chronological)")
    print(f"   • Random state: {RANDOM_STATE}")

    # Load data
    df = load_data(csv_file)

    if len(df) < 50:
        print("\n⚠️  Warning: Small dataset (<50 samples)")
        print("   Results may not be reliable. Consider running full backfill.")

    # Train/test split
    train_df, test_df = time_series_split(df)

    # Train models
    results = []

    # Baseline
    baseline_model, baseline_scaler, baseline_features = train_baseline_model(train_df)
    baseline_results = evaluate_model(baseline_model, baseline_scaler, baseline_features, test_df, "Baseline")
    results.append(baseline_results)

    # Enhanced
    enhanced_model, enhanced_scaler, enhanced_features = train_enhanced_model(train_df)
    enhanced_results = evaluate_model(enhanced_model, enhanced_scaler, enhanced_features, test_df, "Enhanced")
    results.append(enhanced_results)

    # ML
    ml_model, ml_scaler, ml_features = train_ml_model(train_df)
    ml_results = evaluate_model(ml_model, ml_scaler, ml_features, test_df, "ML (GBM)")
    results.append(ml_results)

    # Comparison
    print("\n" + "="*80)
    print("MODEL COMPARISON")
    print("="*80)

    results_df = pd.DataFrame(results)
    print("\n📊 Summary:")
    print(results_df[['model_name', 'accuracy', 'auc', 'f1', 'return_diff']].to_string(index=False))

    best_model = results_df.loc[results_df['accuracy'].idxmax()]
    print(f"\n🏆 Best Model: {best_model['model_name']}")
    print(f"   Accuracy: {best_model['accuracy']*100:.2f}%")
    print(f"   Return Spread: {best_model['return_diff']*100:+.2f}%")

    # Save results
    results_file = 'model-training-results.json'
    with open(results_file, 'w') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'dataset_size': len(df),
            'train_size': len(train_df),
            'test_size': len(test_df),
            'results': results
        }, f, indent=2)

    print(f"\n✅ Results saved to: {results_file}")
    print("\n" + "="*80)
    print("✅ TRAINING COMPLETE")
    print("="*80)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 train-prediction-model.py <csv_file>")
        print("Example: python3 train-prediction-model.py model-features.csv")
        sys.exit(1)

    csv_file = sys.argv[1]
    main(csv_file)
