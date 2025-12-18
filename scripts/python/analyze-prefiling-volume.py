#!/usr/bin/env python3
"""
Pre-Filing Volume Analysis (EXPERIMENTAL)

Tests whether unusual trading volume in the 30 days BEFORE a filing
predicts the post-filing return.

Key Questions:
1. Does abnormal pre-filing volume predict positive returns?
2. Is rising volume before filing a bullish indicator?
3. Can we detect information leakage / insider activity?
4. Does volume pattern matter (steady vs spike vs declining)?

This is much more predictive than post-filing volume because it happens
BEFORE we know the earnings result - could be a leading indicator!
"""

import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
import sys
import json
from scipy import stats
import time

# ============================================================
# CONFIGURATION
# ============================================================

CACHE_FILE = 'prefiling-volume-cache.json'
RATE_LIMIT_DELAY = 1.0  # Seconds between API calls
LOOKBACK_DAYS = 30  # Volume in 30 days before filing
BASELINE_DAYS = 90  # Compare to 90-day baseline

# ============================================================
# DATA FETCHING
# ============================================================

def fetch_prefiling_volume(ticker, filing_date):
    """
    Fetch pre-filing volume metrics.

    Returns:
        - avg_volume_30d_before: Avg daily volume in 30 days before filing
        - avg_volume_90d_baseline: Baseline avg over 90 days
        - volume_trend_30d: Linear regression slope (rising or falling?)
        - abnormal_volume_ratio: 30d avg / 90d baseline
        - max_spike_ratio: Largest single-day spike in 30d period
        - high_volume_days: Number of days with volume >1.5x baseline
        - volume_percentile_30d: Where does 30d avg rank in 1-year history?
    """
    try:
        filing_dt = pd.to_datetime(filing_date)

        # Make filing_dt timezone-aware for comparison
        if filing_dt.tzinfo is None:
            filing_dt = filing_dt.tz_localize('America/New_York')

        # Need data: 90 days before filing for baseline, plus 1 year for percentile
        start_date = filing_dt - timedelta(days=400)  # Buffer for trading days
        end_date = filing_dt

        ticker_obj = yf.Ticker(ticker)
        hist = ticker_obj.history(start=start_date, end=end_date)

        if hist.empty or 'Volume' not in hist.columns:
            return None

        # Make sure both timestamps are timezone-aware
        if hist.index.tz is None:
            hist.index = hist.index.tz_localize('America/New_York')

        # Filter to before filing date
        hist = hist[hist.index < filing_dt]

        if len(hist) < 30:  # Need at least 30 days of data
            return None

        # Get last 30 trading days before filing
        volume_30d = hist['Volume'].tail(30)

        # Get 90-day baseline (30-120 days before filing)
        if len(hist) < 120:
            volume_90d = hist['Volume'].head(len(hist) - 30)
        else:
            volume_90d = hist['Volume'].iloc[-120:-30]

        if len(volume_90d) < 10:  # Need reasonable baseline
            return None

        # Calculate metrics
        avg_volume_30d = volume_30d.mean()
        avg_volume_90d = volume_90d.mean()
        abnormal_ratio = avg_volume_30d / avg_volume_90d if avg_volume_90d > 0 else None

        # Volume trend (rising or falling in last 30 days?)
        days = np.arange(len(volume_30d))
        slope, intercept = np.polyfit(days, volume_30d.values, 1)
        trend_pct = (slope * 30) / avg_volume_30d * 100 if avg_volume_30d > 0 else None

        # Max single-day spike
        max_spike = (volume_30d / avg_volume_90d).max() if avg_volume_90d > 0 else None

        # High volume days (>1.5x baseline)
        high_vol_threshold = avg_volume_90d * 1.5
        high_volume_days = (volume_30d > high_vol_threshold).sum()

        # Volume percentile (vs 1-year history)
        if len(hist) > 60:
            volume_percentile = stats.percentileofscore(hist['Volume'].tail(252), avg_volume_30d)
        else:
            volume_percentile = None

        # Recent acceleration (last 10 days vs previous 20 days)
        if len(volume_30d) >= 30:
            recent_10d = volume_30d.tail(10).mean()
            previous_20d = volume_30d.head(20).mean()
            acceleration_ratio = recent_10d / previous_20d if previous_20d > 0 else None
        else:
            acceleration_ratio = None

        return {
            'avg_volume_30d_before': float(avg_volume_30d),
            'avg_volume_90d_baseline': float(avg_volume_90d),
            'abnormal_volume_ratio': float(abnormal_ratio) if abnormal_ratio else None,
            'volume_trend_30d_pct': float(trend_pct) if trend_pct is not None else None,
            'max_spike_ratio': float(max_spike) if max_spike else None,
            'high_volume_days': int(high_volume_days),
            'volume_percentile': float(volume_percentile) if volume_percentile else None,
            'acceleration_ratio': float(acceleration_ratio) if acceleration_ratio else None,
        }

    except Exception as e:
        print(f"  ❌ Error: {e}", file=sys.stderr)
        return None

def load_cache():
    """Load cached volume data."""
    try:
        with open(CACHE_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def save_cache(cache):
    """Save volume data cache."""
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f, indent=2)

# ============================================================
# ANALYSIS
# ============================================================

def analyze_prefiling_volume(csv_file):
    """Main analysis pipeline."""
    print("="*80)
    print("  PRE-FILING VOLUME ANALYSIS (EXPERIMENTAL)")
    print("="*80)
    print("\n🔬 Testing if volume BEFORE filing predicts returns")
    print("   - Abnormal volume could indicate information leakage")
    print("   - Rising volume might signal institutional accumulation")
    print("   - Could detect insider/congress trading patterns")
    print("   - Much more predictive than post-filing volume!\n")

    # Load feature data
    print(f"📊 Loading feature data from {csv_file}...")
    df = pd.read_csv(csv_file)
    df['filingDate'] = pd.to_datetime(df['filingDate'])
    print(f"  ✅ Loaded {len(df)} samples\n")

    # Load cache
    cache = load_cache()
    print(f"💾 Loaded {len(cache)} cached records\n")

    # Fetch volume data
    print("📈 Fetching pre-filing volume data from yfinance...")
    print("   (This may take several minutes due to rate limiting...)\n")

    volume_data = []
    fetched = 0
    cached = 0
    failed = 0

    for idx, row in df.iterrows():
        ticker = row['ticker']
        filing_date = row['filingDate']
        filing_id = row['filingId']

        # Cache key
        cache_key = f"{ticker}_{filing_date.strftime('%Y-%m-%d')}"

        # Check cache
        if cache_key in cache:
            volume_metrics = cache[cache_key]
            cached += 1
            print(f"  [{idx+1}/{len(df)}] {ticker} on {filing_date.date()} - 💾 cached")
        else:
            print(f"  [{idx+1}/{len(df)}] {ticker} on {filing_date.date()}", end=' ')
            volume_metrics = fetch_prefiling_volume(ticker, filing_date)

            if volume_metrics:
                cache[cache_key] = volume_metrics
                fetched += 1
                print("✅")
            else:
                failed += 1
                print("❌")

            # Rate limiting
            time.sleep(RATE_LIMIT_DELAY)

        # Add to results
        if volume_metrics:
            volume_data.append({
                'filingId': filing_id,
                'ticker': ticker,
                'filingDate': filing_date,
                'actual7dReturn': row['actual7dReturn'],
                'epsSurprise': row.get('epsSurprise'),
                'return_positive': row['actual7dReturn'] > 0,
                'beat': row.get('epsSurprise', 0) > 2,
                'miss': row.get('epsSurprise', 0) < -2,
                **volume_metrics
            })

    # Save cache
    save_cache(cache)
    print(f"\n💾 Saved {len(cache)} records to cache")
    print(f"📊 Fetched: {fetched} new | Cached: {cached} | Failed: {failed}\n")

    if not volume_data:
        print("❌ No volume data available. Cannot perform analysis.")
        return

    # Create analysis dataframe
    vol_df = pd.DataFrame(volume_data)
    coverage_pct = len(vol_df) / len(df) * 100
    print(f"✅ Volume data for {len(vol_df)}/{len(df)} samples ({coverage_pct:.1f}%)\n")

    # Save raw data
    vol_df.to_csv('prefiling-volume-data.csv', index=False)
    print("💾 Saved to: prefiling-volume-data.csv\n")

    # ============================================================
    # CORRELATION ANALYSIS
    # ============================================================

    print("="*80)
    print("CORRELATION ANALYSIS")
    print("="*80)

    print("\n📊 Do pre-filing volume metrics predict returns?\n")

    vol_df['abs_return'] = vol_df['actual7dReturn'].abs()

    correlations = {
        'Abnormal Volume (30d/90d)': vol_df[['abnormal_volume_ratio', 'actual7dReturn']].corr().iloc[0, 1],
        'Volume Trend (slope)': vol_df[['volume_trend_30d_pct', 'actual7dReturn']].corr().iloc[0, 1],
        'Max Spike': vol_df[['max_spike_ratio', 'actual7dReturn']].corr().iloc[0, 1],
        'High Volume Days': vol_df[['high_volume_days', 'actual7dReturn']].corr().iloc[0, 1],
        'Volume Percentile': vol_df[['volume_percentile', 'actual7dReturn']].corr().iloc[0, 1],
        'Acceleration (10d/20d)': vol_df[['acceleration_ratio', 'actual7dReturn']].corr().iloc[0, 1],
    }

    print(f"{'Metric':<30} {'Correlation':<15} {'Strength':<15}")
    print("-"*80)

    for metric, corr in correlations.items():
        if abs(corr) > 0.2:
            strength = "🎯 Strong"
        elif abs(corr) > 0.1:
            strength = "👍 Moderate"
        elif abs(corr) > 0.05:
            strength = "⚠️  Weak"
        else:
            strength = "❌ None"

        print(f"{metric:<30} {corr:>+13.3f}   {strength:<15}")

    # ============================================================
    # ABNORMAL VOLUME ANALYSIS
    # ============================================================

    print("\n" + "="*80)
    print("ABNORMAL VOLUME BUCKET ANALYSIS")
    print("="*80)

    print("\n📊 Returns by Pre-Filing Volume Level:\n")

    # Create volume buckets
    vol_df['volume_bucket'] = pd.cut(
        vol_df['abnormal_volume_ratio'],
        bins=[0, 0.8, 1.0, 1.3, 10],
        labels=['Low (<0.8x)', 'Normal (0.8-1.0x)', 'Elevated (1.0-1.3x)', 'High (>1.3x)']
    )

    print(f"{'Volume Level':<20} {'Count':<8} {'Avg Return':<15} {'% Positive':<12} {'Median Return':<15}")
    print("-"*80)

    for bucket in ['Low (<0.8x)', 'Normal (0.8-1.0x)', 'Elevated (1.0-1.3x)', 'High (>1.3x)']:
        subset = vol_df[vol_df['volume_bucket'] == bucket]
        if len(subset) == 0:
            continue

        avg_return = subset['actual7dReturn'].mean()
        median_return = subset['actual7dReturn'].median()
        pct_positive = (subset['return_positive'].sum() / len(subset) * 100)

        print(f"{bucket:<20} {len(subset):<8} {avg_return*100:>+13.2f}% {pct_positive:>10.1f}% {median_return*100:>+13.2f}%")

    # ============================================================
    # RISING VOLUME ANALYSIS
    # ============================================================

    print("\n" + "="*80)
    print("VOLUME TREND ANALYSIS")
    print("="*80)

    print("\n📊 Does rising volume predict better returns?\n")

    vol_df['trend_bucket'] = pd.cut(
        vol_df['volume_trend_30d_pct'],
        bins=[-1000, -20, -5, 5, 20, 1000],
        labels=['Sharp Decline', 'Declining', 'Flat', 'Rising', 'Sharp Rise']
    )

    print(f"{'Trend':<20} {'Count':<8} {'Avg Return':<15} {'% Positive':<12}")
    print("-"*80)

    for bucket in ['Sharp Decline', 'Declining', 'Flat', 'Rising', 'Sharp Rise']:
        subset = vol_df[vol_df['trend_bucket'] == bucket]
        if len(subset) == 0:
            continue

        avg_return = subset['actual7dReturn'].mean()
        pct_positive = (subset['return_positive'].sum() / len(subset) * 100)

        print(f"{bucket:<20} {len(subset):<8} {avg_return*100:>+13.2f}% {pct_positive:>10.1f}%")

    # ============================================================
    # VOLUME SPIKE ANALYSIS
    # ============================================================

    print("\n" + "="*80)
    print("VOLUME SPIKE DETECTION")
    print("="*80)

    print("\n📊 Do large volume spikes predict returns?\n")

    vol_df['spike_bucket'] = pd.cut(
        vol_df['max_spike_ratio'],
        bins=[0, 2, 3, 4, 100],
        labels=['No Spike (<2x)', 'Moderate (2-3x)', 'Large (3-4x)', 'Extreme (>4x)']
    )

    print(f"{'Max Spike':<20} {'Count':<8} {'Avg Return':<15} {'% Positive':<12}")
    print("-"*80)

    for bucket in ['No Spike (<2x)', 'Moderate (2-3x)', 'Large (3-4x)', 'Extreme (>4x)']:
        subset = vol_df[vol_df['spike_bucket'] == bucket]
        if len(subset) == 0:
            continue

        avg_return = subset['actual7dReturn'].mean()
        pct_positive = (subset['return_positive'].sum() / len(subset) * 100)

        print(f"{bucket:<20} {len(subset):<8} {avg_return*100:>+13.2f}% {pct_positive:>10.1f}%")

    # ============================================================
    # COMBINED SIGNALS
    # ============================================================

    print("\n" + "="*80)
    print("COMBINED VOLUME + SURPRISE SIGNALS")
    print("="*80)

    print("\n📊 Best combination of pre-filing volume + earnings surprise:\n")

    vol_df['high_abnormal_vol'] = vol_df['abnormal_volume_ratio'] > 1.2
    vol_df['rising_vol'] = vol_df['volume_trend_30d_pct'] > 5

    print(f"{'Signal Combination':<35} {'Count':<8} {'Avg Return':<15} {'% Positive':<12}")
    print("-"*80)

    scenarios = [
        ('Beat + High Volume', vol_df['beat'] & vol_df['high_abnormal_vol']),
        ('Beat + Normal Volume', vol_df['beat'] & ~vol_df['high_abnormal_vol']),
        ('Beat + Rising Volume', vol_df['beat'] & vol_df['rising_vol']),
        ('Beat + Flat/Falling Volume', vol_df['beat'] & ~vol_df['rising_vol']),
        ('Miss + High Volume', vol_df['miss'] & vol_df['high_abnormal_vol']),
        ('Miss + Normal Volume', vol_df['miss'] & ~vol_df['high_abnormal_vol']),
        ('High Vol + Rising Vol (no beat/miss)', (~vol_df['beat'] & ~vol_df['miss']) & vol_df['high_abnormal_vol'] & vol_df['rising_vol']),
    ]

    for name, mask in scenarios:
        subset = vol_df[mask]
        if len(subset) == 0:
            continue

        avg_return = subset['actual7dReturn'].mean()
        pct_positive = (subset['return_positive'].sum() / len(subset) * 100)

        print(f"{name:<35} {len(subset):<8} {avg_return*100:>+13.2f}% {pct_positive:>10.1f}%")

    # ============================================================
    # INFORMATION LEAKAGE DETECTION
    # ============================================================

    print("\n" + "="*80)
    print("POTENTIAL INFORMATION LEAKAGE PATTERNS")
    print("="*80)

    print("\n🔍 Looking for suspicious pre-filing volume patterns...\n")

    # Define suspicious patterns
    vol_df['suspicious'] = (
        (vol_df['abnormal_volume_ratio'] > 1.5) &  # High volume
        (vol_df['volume_trend_30d_pct'] > 15) &    # Rising
        (vol_df['acceleration_ratio'] > 1.3)       # Accelerating
    )

    suspicious = vol_df[vol_df['suspicious']]

    print(f"Found {len(suspicious)} potentially suspicious patterns\n")

    if len(suspicious) > 0:
        print(f"{'Ticker':<10} {'Date':<12} {'Volume Ratio':<15} {'Trend %':<12} {'7d Return':<12}")
        print("-"*80)

        for _, row in suspicious.head(20).iterrows():
            print(f"{row['ticker']:<10} {str(row['filingDate'].date()):<12} {row['abnormal_volume_ratio']:>13.2f}x {row['volume_trend_30d_pct']:>10.1f}% {row['actual7dReturn']*100:>+10.2f}%")

        # Check if suspicious patterns predict returns
        suspicious_return = suspicious['actual7dReturn'].mean()
        normal_return = vol_df[~vol_df['suspicious']]['actual7dReturn'].mean()
        diff = suspicious_return - normal_return

        print(f"\n💡 Suspicious patterns average return: {suspicious_return*100:+.2f}%")
        print(f"💡 Normal patterns average return: {normal_return*100:+.2f}%")
        print(f"💡 Difference: {diff*100:+.2f}%")

        if diff > 0.10:
            print("\n   🚨 SIGNIFICANT: Suspicious volume predicts higher returns!")
            print("      This suggests potential information leakage")
        elif diff > 0.05:
            print("\n   ⚠️  MODERATE: Some correlation with suspicious patterns")
        else:
            print("\n   ✅ No clear information leakage detected")

    # ============================================================
    # SUMMARY & RECOMMENDATIONS
    # ============================================================

    print("\n" + "="*80)
    print("SUMMARY & RECOMMENDATIONS")
    print("="*80)

    # Find strongest correlations
    sorted_corr = sorted(correlations.items(), key=lambda x: abs(x[1]), reverse=True)

    print("\n📊 Strongest Predictive Signals:\n")
    for i, (metric, corr) in enumerate(sorted_corr[:3], 1):
        print(f"   {i}. {metric}: r={corr:+.3f}")

    # Calculate recommendation score
    score = 0
    reasons = []

    # Check correlation strength
    max_corr = max(abs(c) for c in correlations.values())
    if max_corr > 0.15:
        score += 2
        reasons.append(f"✅ Strong correlation detected (max r={max_corr:+.3f})")
    elif max_corr > 0.08:
        score += 1
        reasons.append(f"👍 Moderate correlation (max r={max_corr:+.3f})")
    else:
        reasons.append(f"⚠️  Weak correlation (max r={max_corr:+.3f})")

    # Check if abnormal volume predicts returns
    if len(vol_df[vol_df['volume_bucket'] == 'High (>1.3x)']) > 0:
        high_vol_return = vol_df[vol_df['volume_bucket'] == 'High (>1.3x)']['actual7dReturn'].mean()
        normal_vol_return = vol_df[vol_df['volume_bucket'] == 'Normal (0.8-1.0x)']['actual7dReturn'].mean()
        vol_diff = high_vol_return - normal_vol_return

        if vol_diff > 0.10:
            score += 2
            reasons.append(f"✅ High pre-filing volume = better returns (+{vol_diff*100:.1f}%)")
        elif vol_diff > 0.05:
            score += 1
            reasons.append(f"👍 Some volume effect (+{vol_diff*100:.1f}%)")

    # Check suspicious patterns
    if len(suspicious) > 5 and diff > 0.10:
        score += 1
        reasons.append(f"✅ Suspicious patterns detected ({len(suspicious)} cases)")

    print("\n💡 Key Findings:\n")
    for reason in reasons:
        print(f"   {reason}")

    print(f"\n📊 Recommendation Score: {score}/5\n")

    if score >= 4:
        print("   🎯 STRONG RECOMMENDATION: Add pre-filing volume features")
        print("      Volume shows strong predictive power")
        print("      Likely to improve model significantly")
        print("      May detect information leakage / insider activity")
    elif score >= 2:
        print("   👍 MODERATE RECOMMENDATION: Worth testing volume features")
        print("      Some predictive signal detected")
        print("      Could provide modest improvement")
    else:
        print("   ⚠️  WEAK RECOMMENDATION: Limited predictive value")
        print("      Correlation is weak")
        print("      May not be worth added complexity")

    print("\n📝 Suggested Features to Add:")
    print("   1. abnormal_volume_ratio (30d avg / 90d baseline)")
    print("   2. volume_trend_30d_pct (rising/falling indicator)")
    print("   3. acceleration_ratio (recent 10d / previous 20d)")
    print("   4. high_volume_days (count of abnormal days)")
    print("   5. suspicious_pattern flag (combined indicator)")

    # Save results
    summary = {
        'timestamp': datetime.now().isoformat(),
        'samples_analyzed': len(vol_df),
        'coverage_pct': float(coverage_pct),
        'correlations': {k: float(v) for k, v in correlations.items()},
        'suspicious_patterns_found': int(len(suspicious)),
        'recommendation_score': score,
        'recommendation': 'STRONG' if score >= 4 else 'MODERATE' if score >= 2 else 'WEAK'
    }

    with open('prefiling-volume-summary.json', 'w') as f:
        json.dump(summary, f, indent=2)

    print("\n✅ Results saved to:")
    print("   - prefiling-volume-data.csv")
    print("   - prefiling-volume-summary.json")
    print("   - prefiling-volume-cache.json")

    print("\n" + "="*80)
    print("✅ ANALYSIS COMPLETE")
    print("="*80)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 analyze-prefiling-volume.py <feature_csv>")
        print("Example: python3 analyze-prefiling-volume.py model-features-initial.csv")
        sys.exit(1)

    csv_file = sys.argv[1]
    analyze_prefiling_volume(csv_file)
