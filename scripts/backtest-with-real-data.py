#!/usr/bin/env python3
"""
PRODUCTION BACKTEST with REAL Financial Data

Tests the prediction model with actual XBRL-extracted financials:
- Real EPS from SEC filings (94.6% coverage)
- Real revenue from SEC filings (98.9% coverage)
- Real surprises calculated from prior periods
- Market cap categories
- Market regime effects

Goal: Validate 65.1% accuracy with real (not simulated) data
"""

import json
import numpy as np
import pandas as pd

# Load real financial data
with open('/tmp/dataset-real-financials.json', 'r') as f:
    data = json.load(f)

filings = pd.DataFrame(data['filings'])

# Market cap mapping
market_caps = {
    'AAPL': 3800, 'MSFT': 3400, 'GOOGL': 2100, 'AMZN': 1900,
    'NVDA': 3200, 'META': 1400, 'TSLA': 1100, 'AVGO': 900,
    'JPM': 600, 'V': 550, 'WMT': 500, 'MA': 470,
    'COST': 380, 'HD': 360, 'PG': 390, 'NFLX': 320,
    'DIS': 210, 'PYPL': 80, 'INTC': 190, 'AMD': 280
}

filings['market_cap'] = filings['ticker'].map(market_caps)
filings['year'] = pd.to_datetime(filings['filingDate']).dt.year

# Market regime
def get_regime(year):
    if year == 2022:
        return 'bear'
    elif year in [2023, 2025]:
        return 'bull'
    return 'flat'

filings['regime'] = filings['year'].apply(get_regime)

print("=" * 80)
print("PRODUCTION BACKTEST - REAL FINANCIAL DATA")
print("=" * 80)
print(f"Dataset: {len(filings)} filings")
print(f"EPS coverage: {data['stats']['withEPS']}/{data['stats']['total']} ({data['stats']['withEPS']/data['stats']['total']*100:.1f}%)")
print(f"Revenue coverage: {data['stats']['withRevenue']}/{data['stats']['total']} ({data['stats']['withRevenue']/data['stats']['total']*100:.1f}%)")
print(f"Model: v2.1 with real fundamentals")
print()

def predict_with_real_model(row):
    """
    Production model with REAL financial features
    """
    prediction = 0.83  # Baseline

    market_cap = row['market_cap']
    regime = row['regime']
    real_financials = row.get('realFinancials', {})

    # Market cap effect
    if market_cap < 200:
        prediction -= 0.5
    elif 200 <= market_cap < 500:
        prediction += 1.0
        if regime == 'bull':
            prediction += 0.5
    elif 500 <= market_cap < 1000:
        prediction += 0.3
    else:
        prediction += 0.5

    # EPS surprise (MAJOR FACTOR) - using REAL data
    eps_surprise = real_financials.get('epsSurprise')
    eps_magnitude = real_financials.get('epsSurpriseMagnitude', 0)

    if eps_surprise == 'beat':
        prediction += 1.0  # Base beat bonus
        if eps_magnitude > 10:
            prediction += 0.8  # Large beat
    elif eps_surprise == 'miss':
        prediction -= 1.0  # Base miss penalty
        if eps_magnitude < -10:
            prediction -= 0.7  # Large miss

    # Revenue surprise - using REAL data
    rev_surprise = real_financials.get('revenueSurprise')
    if rev_surprise == 'beat':
        prediction += 0.8
    elif rev_surprise == 'miss':
        prediction -= 1.5

    # Market regime dampening
    if regime == 'bull' and prediction < 0:
        prediction *= 0.3  # 70% dampening (buy the dip)
    elif regime == 'bear' and prediction > 0:
        prediction *= 0.5  # 50% dampening (sell the rally)

    return prediction

# Generate predictions
filings['predicted'] = filings.apply(predict_with_real_model, axis=1)
filings['actual'] = filings['actual7dReturn']
filings['correct_direction'] = (filings['predicted'] > 0) == (filings['actual'] > 0)
filings['error'] = np.abs(filings['predicted'] - filings['actual'])

# Overall performance
total = len(filings)
correct = filings['correct_direction'].sum()
accuracy = (correct / total) * 100
baseline = 54.7

print("=" * 80)
print("OVERALL PERFORMANCE")
print("=" * 80)
print(f"Total Filings: {total}")
print(f"Direction Accuracy: {accuracy:.1f}% ({correct}/{total} correct)")
print(f"Baseline (always +): {baseline}%")
print(f"Improvement: {accuracy - baseline:+.1f} percentage points")
print()

mean_error = filings['error'].mean()
median_error = filings['error'].median()
print(f"Mean Absolute Error: {mean_error:.2f}%")
print(f"Median Absolute Error: {median_error:.2f}%")
print()

# Status
if accuracy >= 65:
    status = "✅ EXCELLENT - Production ready!"
    symbol = "✅"
elif accuracy >= 60:
    status = "✅ GOOD - Beats target"
    symbol = "✅"
elif accuracy > 57:
    status = "⚠️  FAIR - Approaching target"
    symbol = "⚠️"
else:
    status = "❌ POOR - Below expectations"
    symbol = "❌"

print(f"Status: {symbol} {status}")
print()

# Breakdown by EPS surprise
print("=" * 80)
print("PERFORMANCE BY EPS SURPRISE (REAL DATA)")
print("=" * 80)

for surprise in ['beat', 'miss', 'inline']:
    subset = filings[filings['realFinancials'].apply(lambda x: x.get('epsSurprise') if isinstance(x, dict) else None) == surprise]
    if len(subset) > 0:
        acc = (subset['correct_direction'].sum() / len(subset)) * 100
        mean_ret = subset['actual'].mean()
        mean_pred = subset['predicted'].mean()
        print(f"{surprise.capitalize():>7s}: {len(subset):>3d} filings, {acc:>5.1f}% accuracy, mean actual={mean_ret:+6.2f}%, mean predicted={mean_pred:+6.2f}%")

print()

# By market cap
print("=" * 80)
print("PERFORMANCE BY MARKET CAP")
print("=" * 80)

cap_categories = [
    ('Small (<$200B)', 0, 200),
    ('Large ($200-500B)', 200, 500),
    ('Mega ($500B-1T)', 500, 1000),
    ('Ultra (>$1T)', 1000, 10000)
]

for name, min_cap, max_cap in cap_categories:
    subset = filings[(filings['market_cap'] >= min_cap) & (filings['market_cap'] < max_cap)]
    if len(subset) > 0:
        acc = (subset['correct_direction'].sum() / len(subset)) * 100
        mean_ret = subset['actual'].mean()
        print(f"{name:<25s}: {len(subset):>3d} filings, {acc:>5.1f}% accuracy, {mean_ret:+6.2f}% mean return")

print()

# By regime
print("=" * 80)
print("PERFORMANCE BY MARKET REGIME")
print("=" * 80)

for regime in ['bull', 'bear', 'flat']:
    subset = filings[filings['regime'] == regime]
    if len(subset) > 0:
        acc = (subset['correct_direction'].sum() / len(subset)) * 100
        mean_ret = subset['actual'].mean()
        print(f"{regime.capitalize():>6s}: {len(subset):>3d} filings, {acc:>5.1f}% accuracy, {mean_ret:+6.2f}% mean return")

print()

# Top performers
print("=" * 80)
print("TOP 5 TICKERS (Highest Accuracy)")
print("=" * 80)

ticker_stats = []
for ticker in filings['ticker'].unique():
    subset = filings[filings['ticker'] == ticker]
    if len(subset) > 0:
        acc = (subset['correct_direction'].sum() / len(subset)) * 100
        mean_ret = subset['actual'].mean()
        ticker_stats.append({
            'ticker': ticker,
            'accuracy': acc,
            'count': len(subset),
            'mean_return': mean_ret
        })

ticker_df = pd.DataFrame(ticker_stats).sort_values('accuracy', ascending=False)

for _, row in ticker_df.head(5).iterrows():
    print(f"{row['ticker']:>6s}: {row['accuracy']:>5.1f}% ({row['count']:>2.0f} filings), mean return={row['mean_return']:+6.2f}%")

print()

# Model comparison
print("=" * 80)
print("MODEL EVOLUTION")
print("=" * 80)
print(f"{'Model Version':<40s} {'Accuracy':>10s} {'vs Baseline':>12s}")
print("-" * 80)
print(f"{'Baseline (always positive)':<40s} {baseline:>9.1f}% {0.0:>11.1f} pts")
print(f"{'v1.0: Hand-tuned (no data)':<40s} {'~59%':>10s} {'+4.3 pts':>12s}")
print(f"{'v2.0: Market cap only':<40s} {54.7:>9.1f}% {0.0:>11.1f} pts")
print(f"{'v2.1: Simulated fundamentals':<40s} {65.1:>9.1f}% {'+10.4 pts':>12s}")
print(f"{'v2.2: REAL fundamentals (PRODUCTION)':<40s} {accuracy:>9.1f}% {accuracy-baseline:>11.1f} pts")
print()

# Compare to simulated
simulated_accuracy = 65.1
diff = accuracy - simulated_accuracy

print("=" * 80)
print("REAL vs SIMULATED COMPARISON")
print("=" * 80)
print(f"Simulated features: {simulated_accuracy}%")
print(f"Real XBRL features: {accuracy:.1f}%")
print(f"Difference: {diff:+.1f} percentage points")

if diff > 2:
    print("✅ Real data IMPROVES model!")
elif diff < -2:
    print("⚠️  Real data slightly worse than simulation")
else:
    print("✅ Real data validates simulation!")

print()

# Feature importance
print("=" * 80)
print("FEATURE IMPORTANCE (REAL DATA)")
print("=" * 80)

# EPS surprise impact
eps_beat_correct = filings[filings['realFinancials'].apply(lambda x: x.get('epsSurprise') if isinstance(x, dict) else None) == 'beat']['correct_direction'].sum()
eps_beat_total = len(filings[filings['realFinancials'].apply(lambda x: x.get('epsSurprise') if isinstance(x, dict) else None) == 'beat'])
eps_miss_correct = filings[filings['realFinancials'].apply(lambda x: x.get('epsSurprise') if isinstance(x, dict) else None) == 'miss']['correct_direction'].sum()
eps_miss_total = len(filings[filings['realFinancials'].apply(lambda x: x.get('epsSurprise') if isinstance(x, dict) else None) == 'miss'])

if eps_beat_total > 0 and eps_miss_total > 0:
    print(f"1. EPS Surprise (REAL):")
    print(f"   Beats: {eps_beat_correct}/{eps_beat_total} ({eps_beat_correct/eps_beat_total*100:.1f}%)")
    print(f"   Misses: {eps_miss_correct}/{eps_miss_total} ({eps_miss_correct/eps_miss_total*100:.1f}%)")
    print(f"   Impact: {((eps_beat_correct/eps_beat_total) - baseline/100)*100:+.1f} pts (beats)")
    print()

# Market cap
large_cap_correct = filings[(filings['market_cap'] >= 200) & (filings['market_cap'] < 500)]['correct_direction'].sum()
large_cap_total = len(filings[(filings['market_cap'] >= 200) & (filings['market_cap'] < 500)])
print(f"2. Large Cap Premium ($200-500B):")
print(f"   Accuracy: {large_cap_correct}/{large_cap_total} ({large_cap_correct/large_cap_total*100:.1f}%)")
print(f"   Impact: {large_cap_correct/large_cap_total*100 - baseline:+.1f} pts")
print()

print("3. Market Regime: 70% dampening in bull markets")
print()

# Conclusion
print("=" * 80)
print("PRODUCTION READINESS ASSESSMENT")
print("=" * 80)
print()

if accuracy >= 65:
    print(f"✅ SUCCESS! Model achieves {accuracy:.1f}% with REAL data")
    print(f"   → {accuracy-60:.1f} pts above 60% target")
    print(f"   → {data['stats']['withEPS']/data['stats']['total']*100:.1f}% EPS coverage")
    print(f"   → {data['stats']['withRevenue']/data['stats']['total']*100:.1f}% revenue coverage")
    print(f"   → READY FOR PRODUCTION DEPLOYMENT")
else:
    print(f"⚠️  Model achieves {accuracy:.1f}% with real data")
    print(f"   → {60-accuracy:.1f} pts below 60% target")
    print(f"   → Need additional features (sentiment, risk scores)")

print()
print("NEXT STEPS FOR PRODUCTION:")
print("1. ✅ Real financial data extracted")
print("2. ⏳ Add sentiment analysis")
print("3. ⏳ Add risk score deltas")
print("4. ⏳ Create latest filings view")
print("5. ⏳ Deploy to production")
print()
print("=" * 80)
