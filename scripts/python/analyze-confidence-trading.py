#!/usr/bin/env python3
"""
Confidence-Based Trading Analysis (EXPERIMENTAL)

Tests how accuracy improves when filtering out low-confidence predictions.
Does NOT modify the production model - purely analytical.

Shows trade-offs:
- Higher confidence threshold = Higher accuracy but fewer trades
- Lower confidence threshold = More trades but lower accuracy

Goal: Find optimal confidence threshold for live trading
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, classification_report
import sys
import json
from datetime import datetime

# ============================================================
# CONFIGURATION
# ============================================================

RETURN_THRESHOLD = 0.0  # 0% - positive vs negative
RANDOM_STATE = 42

# Confidence thresholds to test
CONFIDENCE_THRESHOLDS = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90]

# Features for baseline model
BASELINE_FEATURES = [
    'epsSurprise',
    'surpriseMagnitude',
    'epsBeat',
    'epsMiss',
    'largeBeat',
    'largeMiss',
]

# ============================================================
# MAIN ANALYSIS
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
    X = df[available_features].copy()
    y = df['target'].copy()
    X = X.fillna(0)

    return X, y, available_features

def analyze_confidence_thresholds(train_df, test_df):
    """Test different confidence thresholds."""
    print("\n" + "="*80)
    print("CONFIDENCE THRESHOLD ANALYSIS")
    print("="*80)
    print("\nTraining baseline model to get confidence scores...")

    # Train model
    X_train, y_train, features = prepare_features(train_df, BASELINE_FEATURES)
    X_test, y_test, _ = prepare_features(test_df, features)

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    model = LogisticRegression(random_state=RANDOM_STATE, max_iter=1000)
    model.fit(X_train_scaled, y_train)

    # Get predictions and confidence scores
    y_pred = model.predict(X_test_scaled)
    y_pred_proba = model.predict_proba(X_test_scaled)

    # Confidence is the maximum probability (how sure the model is)
    confidence = np.max(y_pred_proba, axis=1)

    # Add to test dataframe
    test_df_copy = test_df.copy()
    test_df_copy['prediction'] = y_pred
    test_df_copy['confidence'] = confidence
    test_df_copy['y_test'] = y_test.values

    print(f"✅ Model trained on {len(train_df)} samples")
    print(f"✅ Testing on {len(test_df)} samples\n")

    # Analyze each threshold
    results = []

    print("="*80)
    print("THRESHOLD ANALYSIS")
    print("="*80)
    print(f"\n{'Threshold':<12} {'Trades':<10} {'Coverage':<12} {'Accuracy':<12} {'Avg Return':<15} {'Status':<10}")
    print("-"*80)

    for threshold in CONFIDENCE_THRESHOLDS:
        # Filter to high-confidence predictions only
        high_conf = test_df_copy[test_df_copy['confidence'] >= threshold].copy()

        if len(high_conf) == 0:
            continue

        # Calculate metrics
        accuracy = accuracy_score(high_conf['y_test'], high_conf['prediction'])
        coverage = len(high_conf) / len(test_df_copy)
        avg_return = high_conf['actual7dReturn'].mean()

        # Calculate returns for positive predictions only
        pos_preds = high_conf[high_conf['prediction'] == 1]
        if len(pos_preds) > 0:
            avg_return_long = pos_preds['actual7dReturn'].mean()
        else:
            avg_return_long = 0

        # Status indicator
        if accuracy >= 0.70:
            status = "🎯 Great"
        elif accuracy >= 0.65:
            status = "✅ Good"
        elif accuracy >= 0.60:
            status = "👍 OK"
        else:
            status = "⚠️  Low"

        results.append({
            'threshold': threshold,
            'num_trades': len(high_conf),
            'coverage': coverage,
            'accuracy': accuracy,
            'avg_return': avg_return,
            'avg_return_long': avg_return_long,
            'status': status
        })

        print(f"{threshold:<12.0%} {len(high_conf):<10} {coverage:<12.1%} {accuracy:<12.1%} {avg_return*100:<14.2f}% {status:<10}")

    print("-"*80)

    # Find optimal threshold
    results_df = pd.DataFrame(results)

    # Optimal = best accuracy with at least 20% coverage
    viable = results_df[results_df['coverage'] >= 0.20]
    if len(viable) > 0:
        optimal = viable.loc[viable['accuracy'].idxmax()]
    else:
        optimal = results_df.loc[results_df['accuracy'].idxmax()]

    print(f"\n🎯 OPTIMAL THRESHOLD: {optimal['threshold']:.0%}")
    print(f"   Trades:    {optimal['num_trades']:.0f} ({optimal['coverage']:.1%} coverage)")
    print(f"   Accuracy:  {optimal['accuracy']:.1%}")
    print(f"   Avg Return: {optimal['avg_return']*100:+.2f}%")

    # Comparison to no filtering
    baseline_accuracy = accuracy_score(test_df_copy['y_test'], test_df_copy['prediction'])
    baseline_return = test_df_copy['actual7dReturn'].mean()

    print(f"\n📊 IMPROVEMENT vs No Filter:")
    print(f"   Accuracy:  {baseline_accuracy:.1%} → {optimal['accuracy']:.1%} (+{(optimal['accuracy']-baseline_accuracy)*100:.1f} pts)")
    print(f"   Avg Return: {baseline_return*100:+.2f}% → {optimal['avg_return']*100:+.2f}% ({(optimal['avg_return']-baseline_return)*100:+.2f} pts)")
    print(f"   Trade-off:  Giving up {(1-optimal['coverage'])*100:.0f}% of trades")

    return results_df, test_df_copy, optimal

def analyze_confidence_distribution(test_df_with_conf):
    """Show confidence distribution."""
    print("\n" + "="*80)
    print("CONFIDENCE DISTRIBUTION")
    print("="*80)

    conf = test_df_with_conf['confidence'].values

    print(f"\n📊 Confidence Statistics:")
    print(f"   Min:     {conf.min():.1%}")
    print(f"   25th %:  {np.percentile(conf, 25):.1%}")
    print(f"   Median:  {np.percentile(conf, 50):.1%}")
    print(f"   75th %:  {np.percentile(conf, 75):.1%}")
    print(f"   Max:     {conf.max():.1%}")
    print(f"   Mean:    {conf.mean():.1%}")

    # Histogram
    print(f"\n📊 Distribution:")
    bins = [(0.50, 0.60), (0.60, 0.70), (0.70, 0.80), (0.80, 0.90), (0.90, 1.00)]

    for low, high in bins:
        count = ((conf >= low) & (conf < high)).sum()
        pct = count / len(conf) * 100
        bar = '█' * int(pct / 2)
        print(f"   {low:.0%}-{high:.0%}: {count:3d} ({pct:5.1f}%) {bar}")

    # Accuracy by confidence bucket
    print(f"\n📊 Accuracy by Confidence Bucket:")
    for low, high in bins:
        mask = (test_df_with_conf['confidence'] >= low) & (test_df_with_conf['confidence'] < high)
        if mask.sum() > 0:
            subset = test_df_with_conf[mask]
            acc = accuracy_score(subset['y_test'], subset['prediction'])
            print(f"   {low:.0%}-{high:.0%}: {acc:5.1%} accuracy ({mask.sum()} samples)")

def analyze_by_surprise_magnitude(test_df_with_conf, optimal_threshold):
    """Analyze confidence and accuracy by surprise magnitude."""
    print("\n" + "="*80)
    print("CONFIDENCE vs SURPRISE MAGNITUDE")
    print("="*80)

    df = test_df_with_conf.copy()

    # Categorize by surprise magnitude
    df['surprise_category'] = pd.cut(
        df['surpriseMagnitude'],
        bins=[0, 2, 5, 10, 20, 100],
        labels=['0-2%', '2-5%', '5-10%', '10-20%', '>20%']
    )

    print(f"\n{'Category':<12} {'Count':<8} {'Avg Conf':<12} {'Accuracy':<12} {'High-Conf Acc':<15}")
    print("-"*80)

    for cat in ['0-2%', '2-5%', '5-10%', '10-20%', '>20%']:
        subset = df[df['surprise_category'] == cat]
        if len(subset) == 0:
            continue

        avg_conf = subset['confidence'].mean()
        accuracy = accuracy_score(subset['y_test'], subset['prediction'])

        # High confidence subset
        high_conf = subset[subset['confidence'] >= optimal_threshold]
        if len(high_conf) > 0:
            high_conf_acc = accuracy_score(high_conf['y_test'], high_conf['prediction'])
        else:
            high_conf_acc = 0

        print(f"{cat:<12} {len(subset):<8} {avg_conf:<12.1%} {accuracy:<12.1%} {high_conf_acc:<15.1%}")

def main(csv_file):
    """Main analysis pipeline."""
    print("="*80)
    print("  CONFIDENCE-BASED TRADING ANALYSIS (EXPERIMENTAL)")
    print("="*80)
    print(f"\n🔬 This is a non-destructive experiment")
    print(f"   - Tests different confidence thresholds")
    print(f"   - Does NOT modify production model")
    print(f"   - Shows accuracy vs coverage trade-offs")

    # Load data
    df = load_data(csv_file)

    # Split
    split_idx = int(len(df) * 0.7)
    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()

    print(f"\n📊 Train/Test Split:")
    print(f"   Training:   {len(train_df)} samples")
    print(f"   Testing:    {len(test_df)} samples")

    # Analyze confidence thresholds
    results_df, test_with_conf, optimal = analyze_confidence_thresholds(train_df, test_df)

    # Show confidence distribution
    analyze_confidence_distribution(test_with_conf)

    # Analyze by surprise magnitude
    analyze_by_surprise_magnitude(test_with_conf, optimal['threshold'])

    # Save results
    output_file = 'confidence-analysis-results.json'
    results = {
        'timestamp': datetime.now().isoformat(),
        'dataset_size': len(df),
        'test_size': len(test_df),
        'optimal_threshold': float(optimal['threshold']),
        'optimal_accuracy': float(optimal['accuracy']),
        'optimal_coverage': float(optimal['coverage']),
        'optimal_trades': int(optimal['num_trades']),
        'thresholds': results_df.to_dict('records')
    }

    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n✅ Results saved to: {output_file}")

    # Recommendations
    print("\n" + "="*80)
    print("RECOMMENDATIONS")
    print("="*80)

    print(f"\n💡 Based on this analysis:")
    print(f"   1. Use confidence threshold: {optimal['threshold']:.0%}")
    print(f"   2. Expected accuracy: {optimal['accuracy']:.1%} (vs {results_df.iloc[0]['accuracy']:.1%} baseline)")
    print(f"   3. Trade volume: {optimal['num_trades']} trades ({optimal['coverage']:.1%} of opportunities)")
    print(f"   4. Improvement: +{(optimal['accuracy']-results_df.iloc[0]['accuracy'])*100:.1f} percentage points")

    if optimal['threshold'] <= 0.60:
        print(f"\n   ✅ Low threshold = More trades, similar accuracy to baseline")
        print(f"      Good for: Active trading, diversification")
    elif optimal['threshold'] <= 0.75:
        print(f"\n   ⚖️  Medium threshold = Balanced approach")
        print(f"      Good for: Most strategies, good risk/reward")
    else:
        print(f"\n   🎯 High threshold = Fewer trades, much higher accuracy")
        print(f"      Good for: Conservative approach, high conviction trades")

    print("\n" + "="*80)
    print("✅ ANALYSIS COMPLETE")
    print("="*80)
    print(f"\n💡 Next steps:")
    print(f"   1. Review results in {output_file}")
    print(f"   2. Test optimal threshold on new data")
    print(f"   3. If satisfied, implement confidence filtering in production")
    print(f"   4. Monitor performance vs expectations")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 analyze-confidence-trading.py <csv_file>")
        print("Example: python3 analyze-confidence-trading.py model-features-initial.csv")
        sys.exit(1)

    csv_file = sys.argv[1]
    main(csv_file)
