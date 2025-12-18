#!/usr/bin/env python3
"""
Data Quality Analysis

Investigates why the model has negative return spread and extreme outliers.
Identifies data errors and suggests cleaning strategies.
"""

import pandas as pd
import numpy as np
import sys
from datetime import datetime
import json

# ============================================================
# CONFIGURATION
# ============================================================

# Thresholds for outlier detection
EXTREME_RETURN_THRESHOLD = 10.0  # >1000% or <-1000%
HIGH_RETURN_THRESHOLD = 1.0      # >100% or <-100%
REASONABLE_RETURN_RANGE = 0.50   # ±50%

# ============================================================
# ANALYSIS FUNCTIONS
# ============================================================

def analyze_data_quality(csv_file):
    """Comprehensive data quality analysis."""
    print("="*80)
    print("  DATA QUALITY ANALYSIS")
    print("="*80)
    print("\n🔍 Investigating negative return spread and extreme outliers\n")

    # Load data
    print(f"📊 Loading data from {csv_file}...")
    df = pd.read_csv(csv_file)
    df['filingDate'] = pd.to_datetime(df['filingDate'])
    df = df.sort_values('filingDate')

    print(f"  ✅ Loaded {len(df)} samples\n")

    # ============================================================
    # BASIC STATISTICS
    # ============================================================

    print("="*80)
    print("RETURN DISTRIBUTION ANALYSIS")
    print("="*80)

    returns = df['actual7dReturn']

    print(f"\n📊 Basic Statistics:")
    print(f"   Count:      {returns.count()}")
    print(f"   Mean:       {returns.mean()*100:+.2f}%")
    print(f"   Median:     {returns.median()*100:+.2f}%")
    print(f"   Std Dev:    {returns.std()*100:.2f}%")
    print(f"   Min:        {returns.min()*100:+.2f}%")
    print(f"   Max:        {returns.max()*100:+.2f}%")

    print(f"\n📊 Percentiles:")
    for p in [1, 5, 10, 25, 50, 75, 90, 95, 99]:
        val = returns.quantile(p/100)
        print(f"   {p:2d}th: {val*100:>+8.2f}%")

    # ============================================================
    # OUTLIER DETECTION
    # ============================================================

    print("\n" + "="*80)
    print("OUTLIER DETECTION")
    print("="*80)

    # Extreme outliers (>1000% or <-100%)
    extreme_positive = df[df['actual7dReturn'] > EXTREME_RETURN_THRESHOLD]
    extreme_negative = df[df['actual7dReturn'] < -1.0]

    print(f"\n🚨 EXTREME OUTLIERS:")
    print(f"   Positive (>1000%):  {len(extreme_positive)} samples")
    print(f"   Negative (<-100%):  {len(extreme_negative)} samples")
    print(f"   Total extreme:      {len(extreme_positive) + len(extreme_negative)} ({(len(extreme_positive) + len(extreme_negative))/len(df)*100:.1f}%)")

    if len(extreme_positive) > 0:
        print(f"\n📊 Top 10 Extreme Positive Returns:")
        extreme_pos_sorted = extreme_positive.nlargest(10, 'actual7dReturn')
        print(f"\n{'Ticker':<8} {'Date':<12} {'Surprise':<12} {'Return':<15} {'Predicted':<12}")
        print("-"*80)
        for _, row in extreme_pos_sorted.iterrows():
            pred = "Positive" if row.get('epsSurprise', 0) > 0 else "Negative"
            print(f"{row['ticker']:<8} {str(row['filingDate'].date()):<12} {row.get('epsSurprise', 0):>+10.1f}% {row['actual7dReturn']*100:>+13.1f}% {pred:<12}")

    if len(extreme_negative) > 0:
        print(f"\n📊 Top 10 Extreme Negative Returns:")
        extreme_neg_sorted = extreme_negative.nsmallest(10, 'actual7dReturn')
        print(f"\n{'Ticker':<8} {'Date':<12} {'Surprise':<12} {'Return':<15} {'Predicted':<12}")
        print("-"*80)
        for _, row in extreme_neg_sorted.iterrows():
            pred = "Positive" if row.get('epsSurprise', 0) > 0 else "Negative"
            print(f"{row['ticker']:<8} {str(row['filingDate'].date()):<12} {row.get('epsSurprise', 0):>+10.1f}% {row['actual7dReturn']*100:>+13.1f}% {pred:<12}")

    # High outliers (>100% or <-50%)
    high_positive = df[(df['actual7dReturn'] > HIGH_RETURN_THRESHOLD) & (df['actual7dReturn'] <= EXTREME_RETURN_THRESHOLD)]
    high_negative = df[(df['actual7dReturn'] < -0.5) & (df['actual7dReturn'] >= -1.0)]

    print(f"\n⚠️  HIGH OUTLIERS:")
    print(f"   Positive (100-1000%): {len(high_positive)} samples")
    print(f"   Negative (-50 to -100%): {len(high_negative)} samples")

    # Reasonable returns
    reasonable = df[
        (df['actual7dReturn'] >= -REASONABLE_RETURN_RANGE) &
        (df['actual7dReturn'] <= REASONABLE_RETURN_RANGE)
    ]

    print(f"\n✅ REASONABLE RETURNS (±50%):")
    print(f"   Count: {len(reasonable)} samples ({len(reasonable)/len(df)*100:.1f}%)")

    # ============================================================
    # MODEL PREDICTION ANALYSIS
    # ============================================================

    print("\n" + "="*80)
    print("PREDICTION vs ACTUAL ANALYSIS")
    print("="*80)

    # Create simple prediction based on earnings surprise
    df['beat'] = df['epsSurprise'] > 2
    df['miss'] = df['epsSurprise'] < -2
    df['predicted_positive'] = df['beat']
    df['actual_positive'] = df['actual7dReturn'] > 0

    # Returns by prediction
    pred_pos = df[df['predicted_positive']]
    pred_neg = df[~df['predicted_positive']]

    print(f"\n📊 Returns by Prediction (FULL DATASET):")
    print(f"   Predicted Positive: {pred_pos['actual7dReturn'].mean()*100:>+8.2f}% avg ({len(pred_pos)} samples)")
    print(f"   Predicted Negative: {pred_neg['actual7dReturn'].mean()*100:>+8.2f}% avg ({len(pred_neg)} samples)")
    print(f"   Spread:             {(pred_pos['actual7dReturn'].mean() - pred_neg['actual7dReturn'].mean())*100:>+8.2f} pts")

    # Now with outliers removed
    df_clean = df[
        (df['actual7dReturn'] >= -REASONABLE_RETURN_RANGE) &
        (df['actual7dReturn'] <= REASONABLE_RETURN_RANGE)
    ].copy()

    pred_pos_clean = df_clean[df_clean['predicted_positive']]
    pred_neg_clean = df_clean[~df_clean['predicted_positive']]

    print(f"\n📊 Returns by Prediction (CLEANED - outliers removed):")
    print(f"   Predicted Positive: {pred_pos_clean['actual7dReturn'].mean()*100:>+8.2f}% avg ({len(pred_pos_clean)} samples)")
    print(f"   Predicted Negative: {pred_neg_clean['actual7dReturn'].mean()*100:>+8.2f}% avg ({len(pred_neg_clean)} samples)")
    print(f"   Spread:             {(pred_pos_clean['actual7dReturn'].mean() - pred_neg_clean['actual7dReturn'].mean())*100:>+8.2f} pts")

    improvement = (pred_pos_clean['actual7dReturn'].mean() - pred_neg_clean['actual7dReturn'].mean()) - \
                  (pred_pos['actual7dReturn'].mean() - pred_neg['actual7dReturn'].mean())

    print(f"\n💡 Impact of Removing Outliers:")
    print(f"   Spread improvement: {improvement*100:+.2f} pts")

    if improvement > 0:
        print(f"   ✅ Removing outliers IMPROVES the model")
    else:
        print(f"   ❌ Outliers were actually helping (strange!)")

    # ============================================================
    # OUTLIER PATTERN ANALYSIS
    # ============================================================

    print("\n" + "="*80)
    print("OUTLIER PATTERN ANALYSIS")
    print("="*80)

    all_outliers = df[
        (df['actual7dReturn'] > HIGH_RETURN_THRESHOLD) |
        (df['actual7dReturn'] < -0.5)
    ].copy()

    print(f"\n📊 Outlier Characteristics ({len(all_outliers)} samples):\n")

    # By ticker
    outlier_tickers = all_outliers['ticker'].value_counts()
    print(f"📊 Tickers with Most Outliers:")
    for ticker, count in outlier_tickers.head(10).items():
        pct = count / len(all_outliers) * 100
        ticker_total = len(df[df['ticker'] == ticker])
        outlier_rate = count / ticker_total * 100
        print(f"   {ticker:<8} {count:>3} outliers ({pct:>5.1f}% of all outliers, {outlier_rate:>5.1f}% of {ticker} filings)")

    # By earnings surprise direction
    outlier_beats = all_outliers[all_outliers['beat']]
    outlier_misses = all_outliers[all_outliers['miss']]
    outlier_inline = all_outliers[~all_outliers['beat'] & ~all_outliers['miss']]

    print(f"\n📊 Outliers by Earnings Result:")
    print(f"   Beats:   {len(outlier_beats):>4} ({len(outlier_beats)/len(all_outliers)*100:>5.1f}%)")
    print(f"   Misses:  {len(outlier_misses):>4} ({len(outlier_misses)/len(all_outliers)*100:>5.1f}%)")
    print(f"   Inline:  {len(outlier_inline):>4} ({len(outlier_inline)/len(all_outliers)*100:>5.1f}%)")

    # By date (are outliers concentrated in certain periods?)
    all_outliers['year_month'] = all_outliers['filingDate'].dt.to_period('M')
    outliers_by_month = all_outliers.groupby('year_month').size()

    print(f"\n📊 Outliers by Month (top 10):")
    for month, count in outliers_by_month.nlargest(10).items():
        total_month = len(df[df['filingDate'].dt.to_period('M') == month])
        pct = count / total_month * 100
        print(f"   {str(month):<10} {count:>3} outliers ({pct:>5.1f}% of month's filings)")

    # ============================================================
    # DATA ERROR DETECTION
    # ============================================================

    print("\n" + "="*80)
    print("POTENTIAL DATA ERRORS")
    print("="*80)

    errors_found = []

    # Error 1: Returns that look like data entry errors (exactly 0, -1, etc.)
    exact_zeros = df[df['actual7dReturn'] == 0]
    exact_neg_one = df[df['actual7dReturn'] == -1.0]

    print(f"\n🔍 Suspicious Values:")
    print(f"   Exactly 0%:      {len(exact_zeros)} samples")
    print(f"   Exactly -100%:   {len(exact_neg_one)} samples")

    if len(exact_zeros) > 50:
        errors_found.append(f"{len(exact_zeros)} returns are exactly 0% (suspicious)")
    if len(exact_neg_one) > 10:
        errors_found.append(f"{len(exact_neg_one)} returns are exactly -100% (delisting?)")

    # Error 2: Same ticker with wildly different returns on same day
    duplicates = df[df.duplicated(['ticker', 'filingDate'], keep=False)]
    if len(duplicates) > 0:
        print(f"\n   Duplicate ticker/date: {len(duplicates)} samples")
        errors_found.append(f"{len(duplicates)} duplicate ticker/date combinations")

        # Show examples
        dup_groups = duplicates.groupby(['ticker', 'filingDate'])
        print(f"\n   Examples:")
        for (ticker, date), group in list(dup_groups)[:5]:
            returns = group['actual7dReturn'].values
            print(f"      {ticker} on {date.date()}: returns = {[f'{r*100:.1f}%' for r in returns]}")

    # Error 3: Missing data
    missing_returns = df['actual7dReturn'].isna().sum()
    missing_surprise = df['epsSurprise'].isna().sum()

    print(f"\n🔍 Missing Data:")
    print(f"   Missing returns:   {missing_returns} samples")
    print(f"   Missing surprise:  {missing_surprise} samples")

    # ============================================================
    # RECOMMENDATIONS
    # ============================================================

    print("\n" + "="*80)
    print("DATA CLEANING RECOMMENDATIONS")
    print("="*80)

    print(f"\n💡 Recommended Cleaning Strategy:\n")

    # Strategy 1: Remove extreme outliers
    n_extreme = len(extreme_positive) + len(extreme_negative)
    print(f"   1. REMOVE extreme outliers (±100%+): {n_extreme} samples")
    print(f"      - These are likely data errors or special events")
    print(f"      - Removes {n_extreme/len(df)*100:.1f}% of data")

    # Strategy 2: Winsorize high outliers
    n_high = len(high_positive) + len(high_negative)
    print(f"\n   2. WINSORIZE high outliers (50-100%): {n_high} samples")
    print(f"      - Cap at 50% / floor at -50%")
    print(f"      - Keeps data but reduces impact")

    # Strategy 3: Keep reasonable returns
    print(f"\n   3. KEEP reasonable returns (±50%): {len(reasonable)} samples")
    print(f"      - {len(reasonable)/len(df)*100:.1f}% of original data")
    print(f"      - More representative of typical moves")

    # Expected impact
    print(f"\n📊 Expected Impact of Cleaning:")

    original_spread = (pred_pos['actual7dReturn'].mean() - pred_neg['actual7dReturn'].mean()) * 100
    cleaned_spread = (pred_pos_clean['actual7dReturn'].mean() - pred_neg_clean['actual7dReturn'].mean()) * 100

    print(f"   Original spread:    {original_spread:>+8.2f} pts")
    print(f"   Cleaned spread:     {cleaned_spread:>+8.2f} pts")
    print(f"   Improvement:        {cleaned_spread - original_spread:>+8.2f} pts")

    # ============================================================
    # SAVE RESULTS
    # ============================================================

    # Save cleaned dataset
    df_clean.to_csv('model-features-cleaned.csv', index=False)

    # Save outliers for review
    all_outliers.to_csv('data-quality-outliers.csv', index=False)

    # Save analysis results
    results = {
        'timestamp': datetime.now().isoformat(),
        'total_samples': len(df),
        'extreme_outliers': len(extreme_positive) + len(extreme_negative),
        'high_outliers': len(high_positive) + len(high_negative),
        'reasonable_returns': len(reasonable),
        'original_spread_pts': float(original_spread),
        'cleaned_spread_pts': float(cleaned_spread),
        'improvement_pts': float(cleaned_spread - original_spread),
        'errors_found': errors_found,
        'top_outlier_tickers': outlier_tickers.head(10).to_dict(),
    }

    with open('data-quality-analysis.json', 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n✅ Results saved:")
    print(f"   - model-features-cleaned.csv ({len(df_clean)} samples)")
    print(f"   - data-quality-outliers.csv ({len(all_outliers)} outliers)")
    print(f"   - data-quality-analysis.json (summary)")

    # ============================================================
    # FINAL RECOMMENDATION
    # ============================================================

    print("\n" + "="*80)
    print("FINAL RECOMMENDATION")
    print("="*80)

    print(f"\n💡 Analysis Conclusion:\n")

    if cleaned_spread > 0 and original_spread < 0:
        print(f"   🎯 CRITICAL: Outliers are INVERTING the model!")
        print(f"      Original: {original_spread:+.2f} pts (negative)")
        print(f"      Cleaned:  {cleaned_spread:+.2f} pts (positive)")
        print(f"      Removing outliers fixes the negative spread!\n")
        print(f"   ✅ STRONGLY RECOMMEND:")
        print(f"      1. Use cleaned dataset for model training")
        print(f"      2. Re-train baseline model on cleaned data")
        print(f"      3. Expect much better performance")
    elif cleaned_spread > original_spread + 10:
        print(f"   ✅ RECOMMEND: Clean data significantly improves model")
        print(f"      Improvement: {cleaned_spread - original_spread:+.2f} pts")
    elif cleaned_spread > original_spread:
        print(f"   👍 CONSIDER: Cleaning provides modest improvement")
        print(f"      Improvement: {cleaned_spread - original_spread:+.2f} pts")
    else:
        print(f"   ⚠️  WARNING: Cleaning doesn't help much")
        print(f"      May need different approach")

    print("\n" + "="*80)
    print("✅ ANALYSIS COMPLETE")
    print("="*80)

    return df_clean, all_outliers, results

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 analyze-data-quality.py <csv_file>")
        print("Example: python3 analyze-data-quality.py model-features-full.csv")
        sys.exit(1)

    csv_file = sys.argv[1]
    df_clean, outliers, results = analyze_data_quality(csv_file)
