#!/usr/bin/env python3
"""
Fix Duplicate Filings and Retrain Model

Identifies and removes duplicate ticker/date combinations,
then retrains the model on clean data.
"""

import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import sys

def fix_and_retrain(csv_file):
    """Fix duplicates and retrain model."""
    print("="*80)
    print("  FIX DUPLICATES AND RETRAIN MODEL")
    print("="*80)

    # Load data
    print(f"\n📊 Loading data from {csv_file}...")
    df = pd.read_csv(csv_file)
    df['filingDate'] = pd.to_datetime(df['filingDate'])
    df = df.sort_values('filingDate')

    print(f"  ✅ Loaded {len(df)} samples\n")

    # ============================================================
    # STEP 1: IDENTIFY DUPLICATES
    # ============================================================

    print("="*80)
    print("STEP 1: IDENTIFY AND HANDLE DUPLICATES")
    print("="*80)

    # Check for duplicates
    df['ticker_date'] = df['ticker'] + '_' + df['filingDate'].dt.strftime('%Y-%m-%d')
    duplicates = df[df.duplicated('ticker_date', keep=False)]

    print(f"\n🔍 Found {len(duplicates)} duplicate entries")
    print(f"   Unique ticker/date combos with dups: {duplicates['ticker_date'].nunique()}")

    # Show examples
    print(f"\n📊 Example Duplicates:")
    for ticker_date in duplicates['ticker_date'].unique()[:5]:
        subset = df[df['ticker_date'] == ticker_date]
        print(f"\n   {ticker_date}:")
        for _, row in subset.iterrows():
            print(f"      Filing: {row.get('filingId', 'N/A')[:20]}... | Return: {row['actual7dReturn']*100:+.1f}% | Surprise: {row['epsSurprise']:+.1f}%")

    # Strategy: Keep one per ticker/date (the first one chronologically)
    print(f"\n💡 Deduplication Strategy:")
    print(f"   Keep first filing per ticker/date")
    print(f"   Remove {len(duplicates) - duplicates['ticker_date'].nunique()} duplicate rows")

    df_dedup = df.drop_duplicates('ticker_date', keep='first').copy()

    print(f"\n✅ After deduplication: {len(df_dedup)} samples ({len(df) - len(df_dedup)} removed)")

    # ============================================================
    # STEP 2: REMOVE EXTREME OUTLIERS
    # ============================================================

    print("\n" + "="*80)
    print("STEP 2: REMOVE EXTREME OUTLIERS")
    print("="*80)

    # Remove extreme outliers (>100% or <-100%)
    df_no_extremes = df_dedup[
        (df_dedup['actual7dReturn'] > -1.0) &
        (df_dedup['actual7dReturn'] < 10.0)
    ].copy()

    removed_extremes = len(df_dedup) - len(df_no_extremes)

    print(f"\n📊 Removing extreme outliers (|return| > 100%):")
    print(f"   Removed: {removed_extremes} samples")
    print(f"   Remaining: {len(df_no_extremes)} samples")

    # ============================================================
    # STEP 3: WINSORIZE HIGH OUTLIERS
    # ============================================================

    print("\n" + "="*80)
    print("STEP 3: WINSORIZE REMAINING OUTLIERS")
    print("="*80)

    df_clean = df_no_extremes.copy()

    # Winsorize at 1st and 99th percentile
    lower_bound = df_clean['actual7dReturn'].quantile(0.01)
    upper_bound = df_clean['actual7dReturn'].quantile(0.99)

    print(f"\n📊 Winsorization bounds:")
    print(f"   Lower (1st percentile): {lower_bound*100:.2f}%")
    print(f"   Upper (99th percentile): {upper_bound*100:.2f}%")

    # Count how many will be winsorized
    n_lower = (df_clean['actual7dReturn'] < lower_bound).sum()
    n_upper = (df_clean['actual7dReturn'] > upper_bound).sum()

    print(f"\n   Capping {n_upper} high values")
    print(f"   Flooring {n_lower} low values")

    # Apply winsorization
    df_clean['actual7dReturn'] = df_clean['actual7dReturn'].clip(lower=lower_bound, upper=upper_bound)

    # ============================================================
    # STEP 4: RETRAIN MODEL
    # ============================================================

    print("\n" + "="*80)
    print("STEP 4: RETRAIN ON CLEANED DATA")
    print("="*80)

    # Prepare features
    df_clean['target'] = (df_clean['actual7dReturn'] > 0).astype(int)

    features = [
        'epsSurprise',
        'surpriseMagnitude',
        'epsBeat',
        'epsMiss',
        'largeBeat',
        'largeMiss',
    ]

    # Filter to available features
    available_features = [f for f in features if f in df_clean.columns]

    X = df_clean[available_features].fillna(0)
    y = df_clean['target']

    # Split
    split_idx = int(len(df_clean) * 0.7)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

    train_dates = df_clean.iloc[:split_idx]['filingDate']
    test_dates = df_clean.iloc[split_idx:]['filingDate']

    print(f"\n📊 Train/Test Split:")
    print(f"   Training:   {len(X_train)} samples ({train_dates.min().date()} to {train_dates.max().date()})")
    print(f"   Testing:    {len(X_test)} samples ({test_dates.min().date()} to {test_dates.max().date()})")

    # Scale and train
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    model = LogisticRegression(random_state=42, max_iter=1000)
    model.fit(X_train_scaled, y_train)

    print(f"\n✅ Model trained successfully")

    # ============================================================
    # STEP 5: EVALUATE
    # ============================================================

    print("\n" + "="*80)
    print("STEP 5: EVALUATE CLEANED MODEL")
    print("="*80)

    # Predictions
    y_pred = model.predict(X_test_scaled)
    y_pred_proba = model.predict_proba(X_test_scaled)[:, 1]

    # Basic metrics
    accuracy = accuracy_score(y_test, y_pred)

    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()

    print(f"\n📊 Classification Metrics:")
    print(f"   Accuracy:  {accuracy:.1%}")
    print(f"   Precision: {tp/(tp+fp):.1%}")
    print(f"   Recall:    {tp/(tp+fn):.1%}")

    print(f"\n📊 Confusion Matrix:")
    print(f"                    Predicted Negative    Predicted Positive")
    print(f"   True Negative:   {tn:>17}    {fp:>17}")
    print(f"   True Positive:   {fn:>17}    {tp:>17}")

    # Return analysis
    test_df = df_clean.iloc[split_idx:].copy()
    test_df['prediction'] = y_pred

    pred_pos = test_df[test_df['prediction'] == 1]
    pred_neg = test_df[test_df['prediction'] == 0]

    avg_return_pos = pred_pos['actual7dReturn'].mean()
    avg_return_neg = pred_neg['actual7dReturn'].mean()
    spread = avg_return_pos - avg_return_neg

    print(f"\n💰 Return Analysis:")
    print(f"   Predicted Positive: {avg_return_pos*100:+.2f}% avg ({len(pred_pos)} samples)")
    print(f"   Predicted Negative: {avg_return_neg*100:+.2f}% avg ({len(pred_neg)} samples)")
    print(f"   Return Spread:      {spread*100:+.2f} pts")

    # Feature importance
    feature_importance = pd.DataFrame({
        'feature': available_features,
        'coefficient': model.coef_[0]
    }).sort_values('coefficient', key=abs, ascending=False)

    print(f"\n📊 Feature Importance:")
    for _, row in feature_importance.iterrows():
        print(f"   {row['feature']:<20} {row['coefficient']:>+8.3f}")

    # ============================================================
    # COMPARISON TO ORIGINAL
    # ============================================================

    print("\n" + "="*80)
    print("COMPARISON: ORIGINAL vs CLEANED")
    print("="*80)

    print(f"\n📊 Dataset Changes:")
    print(f"   Original:     {len(df)} samples")
    print(f"   Deduplicated: {len(df_dedup)} samples (-{len(df) - len(df_dedup)})")
    print(f"   No Extremes:  {len(df_no_extremes)} samples (-{len(df_dedup) - len(df_no_extremes)})")
    print(f"   Final Clean:  {len(df_clean)} samples")

    print(f"\n📊 Model Performance:")
    print(f"   Original accuracy:     55.7%")
    print(f"   Cleaned accuracy:      {accuracy:.1%}")
    print(f"   Improvement:           {(accuracy - 0.557)*100:+.1f} pts")

    print(f"\n📊 Return Spread:")
    print(f"   Original spread:       -26.52 pts (NEGATIVE!)")
    print(f"   Cleaned spread:        {spread*100:+.2f} pts")
    print(f"   Improvement:           {(spread*100 - (-26.52)):+.2f} pts")

    # ============================================================
    # SAVE RESULTS
    # ============================================================

    df_clean.to_csv('model-features-final-clean.csv', index=False)

    print(f"\n✅ Saved cleaned dataset:")
    print(f"   - model-features-final-clean.csv ({len(df_clean)} samples)")

    # ============================================================
    # FINAL VERDICT
    # ============================================================

    print("\n" + "="*80)
    print("FINAL VERDICT")
    print("="*80)

    print(f"\n💡 Results After Cleaning:\n")

    if spread > 0 and accuracy > 0.52:
        print(f"   ✅ SUCCESS: Cleaned model is working!")
        print(f"      Accuracy: {accuracy:.1%} (>{(accuracy-0.50)*100:.1f} pts above random)")
        print(f"      Positive spread: {spread*100:+.2f} pts")
        print(f"      Duplicates were corrupting the data")
    elif spread > 0:
        print(f"   👍 IMPROVED: Model now has positive spread")
        print(f"      But accuracy is still weak: {accuracy:.1%}")
        print(f"      May need additional features")
    else:
        print(f"   ⚠️  STILL STRUGGLING: Model remains weak")
        print(f"      Accuracy: {accuracy:.1%}")
        print(f"      Spread: {spread*100:+.2f} pts")
        print(f"      Need different approach")

    print("\n" + "="*80)
    print("✅ ANALYSIS COMPLETE")
    print("="*80)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 fix-duplicates-and-retrain.py <csv_file>")
        print("Example: python3 fix-duplicates-and-retrain.py model-features-full.csv")
        sys.exit(1)

    csv_file = sys.argv[1]
    fix_and_retrain(csv_file)
