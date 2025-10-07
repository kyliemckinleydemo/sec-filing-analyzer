#!/usr/bin/env python3
"""
Analyze the distribution of 7-day returns in the dataset

This helps us understand:
1. Average return after earnings filings
2. Distribution (positive vs negative)
3. Volatility and outliers
4. Patterns by ticker, filing type, year
"""

import json
import sys
import numpy as np
from collections import defaultdict
from datetime import datetime

# Read dataset
with open('/tmp/full-collection.log', 'r') as f:
    content = f.read()
    # Extract JSON from the log (it's at the end)
    json_start = content.rfind('{')
    data = json.loads(content[json_start:])

filings = data['filings']
returns = [f['actual7dReturn'] for f in filings]

print("=" * 80)
print("RETURNS DISTRIBUTION ANALYSIS")
print("=" * 80)
print(f"Total filings: {len(filings)}")
print(f"Date range: 2022-01-01 to 2025-10-06")
print()

# Overall statistics
print("OVERALL STATISTICS")
print("-" * 80)
print(f"Mean return: {np.mean(returns):+.2f}%")
print(f"Median return: {np.median(returns):+.2f}%")
print(f"Std deviation: {np.std(returns):.2f}%")
print(f"Min return: {np.min(returns):+.2f}%")
print(f"Max return: {np.max(returns):+.2f}%")
print()

# Distribution
positive = [r for r in returns if r > 0]
negative = [r for r in returns if r < 0]
neutral = [r for r in returns if r == 0]

print("DIRECTION DISTRIBUTION")
print("-" * 80)
print(f"Positive returns: {len(positive)} ({len(positive)/len(returns)*100:.1f}%)")
print(f"Negative returns: {len(negative)} ({len(negative)/len(returns)*100:.1f}%)")
print(f"Neutral returns: {len(neutral)} ({len(neutral)/len(returns)*100:.1f}%)")
print()
print(f"Average positive return: +{np.mean(positive):.2f}%")
print(f"Average negative return: {np.mean(negative):.2f}%")
print()

# Percentiles
print("PERCENTILES")
print("-" * 80)
for p in [5, 10, 25, 50, 75, 90, 95]:
    print(f"  {p}th percentile: {np.percentile(returns, p):+.2f}%")
print()

# By filing type
print("BY FILING TYPE")
print("-" * 80)
by_type = defaultdict(list)
for f in filings:
    by_type[f['filingType']].append(f['actual7dReturn'])

for ftype in ['10-Q', '10-K']:
    if ftype in by_type:
        rets = by_type[ftype]
        pos = sum(1 for r in rets if r > 0)
        print(f"{ftype}: {len(rets)} filings, mean {np.mean(rets):+.2f}%, "
              f"{pos}/{len(rets)} positive ({pos/len(rets)*100:.1f}%)")
print()

# By year
print("BY YEAR (Market Regime)")
print("-" * 80)
by_year = defaultdict(list)
for f in filings:
    year = f['filingDate'][:4]
    by_year[year].append(f['actual7dReturn'])

for year in sorted(by_year.keys()):
    rets = by_year[year]
    pos = sum(1 for r in rets if r > 0)
    print(f"{year}: {len(rets)} filings, mean {np.mean(rets):+.2f}%, "
          f"{pos}/{len(rets)} positive ({pos/len(rets)*100:.1f}%)")
print()

# By ticker (top performers and worst performers)
print("TOP 5 PERFORMERS (Average Return)")
print("-" * 80)
by_ticker = defaultdict(list)
for f in filings:
    by_ticker[f['ticker']].append(f['actual7dReturn'])

ticker_avgs = [(ticker, np.mean(rets)) for ticker, rets in by_ticker.items()]
ticker_avgs.sort(key=lambda x: x[1], reverse=True)

for ticker, avg in ticker_avgs[:5]:
    rets = by_ticker[ticker]
    pos = sum(1 for r in rets if r > 0)
    print(f"{ticker}: {len(rets)} filings, mean {avg:+.2f}%, "
          f"{pos}/{len(rets)} positive ({pos/len(rets)*100:.1f}%)")
print()

print("BOTTOM 5 PERFORMERS (Average Return)")
print("-" * 80)
for ticker, avg in ticker_avgs[-5:]:
    rets = by_ticker[ticker]
    pos = sum(1 for r in rets if r > 0)
    print(f"{ticker}: {len(rets)} filings, mean {avg:+.2f}%, "
          f"{pos}/{len(rets)} positive ({pos/len(rets)*100:.1f}%)")
print()

# Outliers
print("OUTLIERS (|return| > 15%)")
print("-" * 80)
outliers = [(f['ticker'], f['filingType'], f['filingDate'], f['actual7dReturn'])
            for f in filings if abs(f['actual7dReturn']) > 15]
outliers.sort(key=lambda x: abs(x[3]), reverse=True)

for ticker, ftype, date, ret in outliers[:10]:
    print(f"{ticker} {ftype} {date}: {ret:+.2f}%")
print()

# Key insights for model optimization
print("=" * 80)
print("KEY INSIGHTS FOR MODEL OPTIMIZATION")
print("=" * 80)
print()
print(f"1. BASE RATE: {len(positive)/len(returns)*100:.1f}% of filings have positive returns")
print(f"   → Naive 'always predict positive' would be right {len(positive)/len(returns)*100:.1f}% of the time")
print()
print(f"2. MEAN RETURN: {np.mean(returns):+.2f}%")
print(f"   → Average filing results in {np.mean(returns):+.2f}% return over 7 days")
print()
print(f"3. ASYMMETRY: Avg positive (+{np.mean(positive):.2f}%) vs avg negative ({np.mean(negative):.2f}%)")
print(f"   → Positive surprises slightly larger than negative surprises")
print()
print(f"4. VOLATILITY: Std dev = {np.std(returns):.2f}%")
print(f"   → High variance means predicting magnitude is hard")
print()
print(f"5. MODEL TARGET: Beat {len(positive)/len(returns)*100:.1f}% direction accuracy")
print(f"   → Need to identify which filings lead to positive vs negative returns")
print()
print("=" * 80)
