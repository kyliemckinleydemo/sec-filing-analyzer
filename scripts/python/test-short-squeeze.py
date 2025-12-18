#!/usr/bin/env python3
"""
Short Squeeze Hypothesis Test

Tests if high short interest + earnings beat = bigger returns (short squeeze)

Uses current short interest data from Yahoo Finance matched to recent filings.
"""

import pandas as pd
import yfinance as yf
import time
import sys
from datetime import datetime, timedelta

# ============================================================
# CONFIGURATION
# ============================================================

SHORT_INTEREST_THRESHOLD = 10.0  # >10% is "high" short interest
RATE_LIMIT_DELAY = 0.5  # Seconds between API calls

# ============================================================
# DATA FETCHING
# ============================================================

def get_short_interest(ticker):
    """Fetch current short interest for a ticker."""
    try:
        stock = yf.Ticker(ticker)
        info = stock.info

        short_pct = info.get('shortPercentOfFloat')
        days_to_cover = info.get('shortRatio')

        # Convert to percentage if needed
        if short_pct and short_pct > 1:
            short_pct = short_pct / 100

        return {
            'ticker': ticker,
            'short_pct_float': short_pct,
            'days_to_cover': days_to_cover,
            'success': True
        }
    except Exception as e:
        return {
            'ticker': ticker,
            'short_pct_float': None,
            'days_to_cover': None,
            'success': False,
            'error': str(e)
        }

# ============================================================
# ANALYSIS
# ============================================================

def analyze_short_squeeze(csv_file):
    """Test short squeeze hypothesis."""
    print("="*80)
    print("  SHORT SQUEEZE HYPOTHESIS TEST")
    print("="*80)
    print("\n🎯 Hypothesis: High short interest + earnings beat = bigger returns")
    print("   (Short sellers forced to cover, amplifying upward move)\n")

    # Load feature data
    print(f"📊 Loading feature data from {csv_file}...")
    df = pd.read_csv(csv_file)
    df['filingDate'] = pd.to_datetime(df['filingDate'])

    # Filter to recent filings (last 3 months) where current SI is most relevant
    cutoff_date = datetime.now() - timedelta(days=90)
    recent_df = df[df['filingDate'] >= cutoff_date].copy()

    print(f"  ✅ Loaded {len(df)} total samples")
    print(f"  ✅ Using {len(recent_df)} recent samples (last 90 days)\n")

    if len(recent_df) == 0:
        print("❌ No recent filings found. Try with full dataset.")
        return

    # Get unique tickers
    tickers = recent_df['ticker'].unique()
    print(f"📊 Fetching short interest for {len(tickers)} tickers...")
    print("   (This will take a few minutes...)\n")

    # Fetch short interest
    short_data = []
    for i, ticker in enumerate(tickers, 1):
        print(f"  [{i}/{len(tickers)}] {ticker}...", end=' ')
        si_data = get_short_interest(ticker)

        if si_data['success'] and si_data['short_pct_float'] is not None:
            short_data.append(si_data)
            print(f"✅ {si_data['short_pct_float']*100:.1f}%")
        else:
            print("❌")

        time.sleep(RATE_LIMIT_DELAY)

    print(f"\n✅ Got short interest for {len(short_data)}/{len(tickers)} tickers\n")

    # Create short interest lookup
    si_df = pd.DataFrame(short_data)
    si_lookup = si_df.set_index('ticker')['short_pct_float'].to_dict()

    # Add short interest to filings
    recent_df['short_interest'] = recent_df['ticker'].map(si_lookup)

    # Filter to filings with SI data
    with_si = recent_df[recent_df['short_interest'].notna()].copy()
    coverage = len(with_si) / len(recent_df) * 100

    print(f"📊 Coverage: {len(with_si)}/{len(recent_df)} filings ({coverage:.1f}%) have short interest data\n")

    if len(with_si) == 0:
        print("❌ No filings with short interest data")
        return

    # Categorize by short interest and earnings surprise
    with_si['high_short_interest'] = with_si['short_interest'] > (SHORT_INTEREST_THRESHOLD / 100)
    with_si['beat'] = with_si['epsSurprise'] > 2
    with_si['miss'] = with_si['epsSurprise'] < -2
    with_si['inline'] = (~with_si['beat']) & (~with_si['miss'])

    # ============================================================
    # SHORT INTEREST DISTRIBUTION
    # ============================================================

    print("="*80)
    print("SHORT INTEREST DISTRIBUTION")
    print("="*80)

    print(f"\n📊 Short Interest Stats:")
    print(f"   Min:     {with_si['short_interest'].min()*100:.2f}%")
    print(f"   25th:    {with_si['short_interest'].quantile(0.25)*100:.2f}%")
    print(f"   Median:  {with_si['short_interest'].median()*100:.2f}%")
    print(f"   75th:    {with_si['short_interest'].quantile(0.75)*100:.2f}%")
    print(f"   Max:     {with_si['short_interest'].max()*100:.2f}%")
    print(f"   Mean:    {with_si['short_interest'].mean()*100:.2f}%")

    high_si_count = with_si['high_short_interest'].sum()
    print(f"\n📊 High Short Interest (>{SHORT_INTEREST_THRESHOLD}%): {high_si_count} filings ({high_si_count/len(with_si)*100:.1f}%)")

    # Top shorted stocks
    print(f"\n📊 Most Shorted Stocks in Dataset:")
    top_shorted = with_si.nlargest(10, 'short_interest')[['ticker', 'short_interest', 'filingDate', 'epsSurprise', 'actual7dReturn']]
    print(f"\n{'Ticker':<8} {'Short %':<10} {'Date':<12} {'EPS Surprise':<15} {'7d Return':<12}")
    print("-"*80)
    for _, row in top_shorted.iterrows():
        print(f"{row['ticker']:<8} {row['short_interest']*100:<10.1f} {str(row['filingDate'].date()):<12} {row['epsSurprise']:<+15.1f} {row['actual7dReturn']*100:<+12.1f}%")

    # ============================================================
    # SHORT SQUEEZE ANALYSIS
    # ============================================================

    print("\n" + "="*80)
    print("SHORT SQUEEZE ANALYSIS")
    print("="*80)

    print("\n📊 Returns by Short Interest + Earnings Result:\n")

    scenarios = [
        ("High SI + Beat", with_si['high_short_interest'] & with_si['beat']),
        ("Normal SI + Beat", (~with_si['high_short_interest']) & with_si['beat']),
        ("High SI + Miss", with_si['high_short_interest'] & with_si['miss']),
        ("Normal SI + Miss", (~with_si['high_short_interest']) & with_si['miss']),
        ("High SI + Inline", with_si['high_short_interest'] & with_si['inline']),
        ("Normal SI + Inline", (~with_si['high_short_interest']) & with_si['inline']),
    ]

    print(f"{'Scenario':<25} {'Count':<8} {'Avg Return':<15} {'Median Return':<15} {'% Positive':<12}")
    print("-"*80)

    results = []

    for name, mask in scenarios:
        subset = with_si[mask]
        if len(subset) == 0:
            continue

        avg_return = subset['actual7dReturn'].mean()
        median_return = subset['actual7dReturn'].median()
        pct_positive = (subset['actual7dReturn'] > 0).sum() / len(subset) * 100

        results.append({
            'scenario': name,
            'count': len(subset),
            'avg_return': avg_return,
            'median_return': median_return,
            'pct_positive': pct_positive
        })

        print(f"{name:<25} {len(subset):<8} {avg_return*100:<+15.2f}% {median_return*100:<+15.2f}% {pct_positive:<12.1f}%")

    # ============================================================
    # SHORT SQUEEZE DETECTION
    # ============================================================

    print("\n" + "="*80)
    print("SHORT SQUEEZE CANDIDATES")
    print("="*80)

    # Define short squeeze: high SI + beat + big return
    squeeze_candidates = with_si[
        (with_si['high_short_interest']) &
        (with_si['beat']) &
        (with_si['actual7dReturn'] > 0.10)  # >10% return
    ].copy()

    print(f"\n🎯 Detected {len(squeeze_candidates)} potential short squeezes")
    print("   (High SI + Beat + >10% return)\n")

    if len(squeeze_candidates) > 0:
        squeeze_candidates = squeeze_candidates.sort_values('actual7dReturn', ascending=False)
        print(f"{'Ticker':<8} {'Short %':<10} {'Date':<12} {'Surprise':<12} {'Return':<12} {'Status'}")
        print("-"*80)

        for _, row in squeeze_candidates.iterrows():
            status = "🚀 SQUEEZE" if row['actual7dReturn'] > 0.30 else "📈 Strong"
            print(f"{row['ticker']:<8} {row['short_interest']*100:<10.1f} {str(row['filingDate'].date()):<12} {row['epsSurprise']:<+12.1f} {row['actual7dReturn']*100:<+12.1f}% {status}")

    # ============================================================
    # STATISTICAL ANALYSIS
    # ============================================================

    print("\n" + "="*80)
    print("STATISTICAL ANALYSIS")
    print("="*80)

    # Compare high SI + beat vs normal SI + beat
    high_si_beat = with_si[with_si['high_short_interest'] & with_si['beat']]['actual7dReturn']
    normal_si_beat = with_si[(~with_si['high_short_interest']) & with_si['beat']]['actual7dReturn']

    if len(high_si_beat) > 0 and len(normal_si_beat) > 0:
        diff = high_si_beat.mean() - normal_si_beat.mean()

        print(f"\n📊 Beat Scenario Comparison:")
        print(f"   High SI + Beat:    {high_si_beat.mean()*100:+.2f}% avg ({len(high_si_beat)} samples)")
        print(f"   Normal SI + Beat:  {normal_si_beat.mean()*100:+.2f}% avg ({len(normal_si_beat)} samples)")
        print(f"   Difference:        {diff*100:+.2f} percentage points")

        if diff > 0.05:
            print(f"\n   ✅ SHORT SQUEEZE EFFECT DETECTED!")
            print(f"      High SI amplifies upside by {diff*100:+.1f} pts")
        elif diff > 0:
            print(f"\n   👍 Slight positive effect (+{diff*100:.1f} pts)")
        else:
            print(f"\n   ❌ No short squeeze effect detected")
            print(f"      High SI actually reduced returns by {-diff*100:.1f} pts")

    # ============================================================
    # BY SHORT INTEREST BUCKET
    # ============================================================

    print("\n" + "="*80)
    print("RETURNS BY SHORT INTEREST LEVEL (BEATS ONLY)")
    print("="*80)

    beats_only = with_si[with_si['beat']].copy()

    if len(beats_only) > 0:
        # Create buckets
        beats_only['si_bucket'] = pd.cut(
            beats_only['short_interest'] * 100,
            bins=[0, 5, 10, 15, 20, 100],
            labels=['0-5%', '5-10%', '10-15%', '15-20%', '>20%']
        )

        print(f"\n{'SI Bucket':<15} {'Count':<8} {'Avg Return':<15} {'Median Return':<15} {'Max Return':<12}")
        print("-"*80)

        for bucket in ['0-5%', '5-10%', '10-15%', '15-20%', '>20%']:
            subset = beats_only[beats_only['si_bucket'] == bucket]
            if len(subset) == 0:
                continue

            avg_return = subset['actual7dReturn'].mean()
            median_return = subset['actual7dReturn'].median()
            max_return = subset['actual7dReturn'].max()

            print(f"{bucket:<15} {len(subset):<8} {avg_return*100:<+15.2f}% {median_return*100:<+15.2f}% {max_return*100:<+12.1f}%")

    # ============================================================
    # SAVE RESULTS
    # ============================================================

    output = {
        'timestamp': datetime.now().isoformat(),
        'samples_analyzed': len(with_si),
        'high_si_threshold': SHORT_INTEREST_THRESHOLD,
        'high_si_count': int(high_si_count),
        'squeeze_candidates': len(squeeze_candidates),
        'scenarios': results,
    }

    import json
    with open('short-squeeze-analysis.json', 'w') as f:
        json.dump(output, f, indent=2)

    # Save detailed data
    with_si.to_csv('short-interest-filings.csv', index=False)

    print("\n✅ Results saved to:")
    print("   - short-squeeze-analysis.json")
    print("   - short-interest-filings.csv")

    # ============================================================
    # CONCLUSION
    # ============================================================

    print("\n" + "="*80)
    print("CONCLUSION")
    print("="*80)

    print("\n💡 Key Findings:\n")

    if len(high_si_beat) > 0 and len(normal_si_beat) > 0:
        diff = high_si_beat.mean() - normal_si_beat.mean()

        if diff > 0.10:
            print(f"   🎯 STRONG SHORT SQUEEZE EFFECT")
            print(f"      High SI + Beat outperforms by {diff*100:+.1f} pts")
            print(f"      Recommendation: ADD short interest as feature")
        elif diff > 0.05:
            print(f"   ✅ MODERATE SHORT SQUEEZE EFFECT")
            print(f"      High SI + Beat outperforms by {diff*100:+.1f} pts")
            print(f"      Recommendation: Test in model")
        elif diff > 0:
            print(f"   👍 SLIGHT POSITIVE EFFECT")
            print(f"      High SI + Beat outperforms by {diff*100:+.1f} pts")
            print(f"      May not be worth the complexity")
        else:
            print(f"   ❌ NO SHORT SQUEEZE EFFECT")
            print(f"      High SI actually reduced returns")
            print(f"      Not worth adding to model")

    if len(squeeze_candidates) > 0:
        print(f"\n   🚀 Found {len(squeeze_candidates)} short squeeze candidates")
        print(f"      Average return: {squeeze_candidates['actual7dReturn'].mean()*100:+.1f}%")
        print(f"      These are tradeable opportunities!")

    print("\n" + "="*80)
    print("✅ ANALYSIS COMPLETE")
    print("="*80)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 test-short-squeeze.py <csv_file>")
        print("Example: python3 test-short-squeeze.py model-features-full.csv")
        sys.exit(1)

    csv_file = sys.argv[1]
    analyze_short_squeeze(csv_file)
