#!/usr/bin/env python3
"""
Comprehensive Backtest: Test optimized model on all 278 historical filings

Measures:
1. Direction accuracy (% correct positive/negative predictions)
2. Mean absolute error
3. Performance by ticker, filing type, market regime
"""

import json
import sys
import numpy as np
from collections import defaultdict

# Read dataset
with open('/tmp/dataset.json', 'r') as f:
    data = json.load(f)

filings = data['filings']

print("=" * 80)
print("COMPREHENSIVE BACKTEST: 278 FILINGS (2022-2025)")
print("=" * 80)
print(f"Total filings: {len(filings)}")
print(f"Date range: 2022-01-01 to 2025-10-06")
print()

# For now, we'll simulate predictions using the baseline model
# In production, this would call the actual prediction engine for each filing
print("SIMULATING PREDICTIONS...")
print("-" * 80)

# Baseline model (simple heuristic):
# - Start at +0.83% (dataset mean)
# - Adjust based on known patterns
predictions = []
for filing in filings:
    actual_return = filing['actual7dReturn']

    # Simulate a simple baseline prediction
    # Real implementation would use full prediction engine with all features
    predicted_return = 0.83  # Start with dataset mean baseline

    # Simple heuristic: assume positive (matches 54.7% base rate)
    # This is the naive "always predict positive" baseline

    predictions.append({
        'ticker': filing['ticker'],
        'filingType': filing['filingType'],
        'filingDate': filing['filingDate'],
        'predicted': predicted_return,
        'actual': actual_return,
        'correct_direction': (predicted_return > 0) == (actual_return > 0),
        'error': abs(predicted_return - actual_return)
    })

# Calculate overall accuracy
correct = sum(1 for p in predictions if p['correct_direction'])
total = len(predictions)
direction_accuracy = correct / total * 100

print(f"\nProcessed {total} filings")
print()

# Overall results
print("OVERALL RESULTS")
print("=" * 80)
print(f"Direction Accuracy: {direction_accuracy:.1f}% ({correct}/{total} correct)")
print(f"Baseline (always positive): 54.7%")
print(f"Improvement: {direction_accuracy - 54.7:+.1f} percentage points")
print()

mean_error = np.mean([p['error'] for p in predictions])
median_error = np.median([p['error'] for p in predictions])
print(f"Mean Absolute Error: {mean_error:.2f}%")
print(f"Median Absolute Error: {median_error:.2f}%")
print()

# By filing type
print("BY FILING TYPE")
print("-" * 80)
by_type = defaultdict(list)
for p in predictions:
    by_type[p['filingType']].append(p)

for ftype in ['10-Q', '10-K']:
    if ftype in by_type:
        preds = by_type[ftype]
        correct_type = sum(1 for p in preds if p['correct_direction'])
        accuracy_type = correct_type / len(preds) * 100
        print(f"{ftype}: {accuracy_type:.1f}% accuracy ({correct_type}/{len(preds)} correct)")
print()

# By ticker
print("TOP 5 TICKERS (Best Direction Accuracy)")
print("-" * 80)
by_ticker = defaultdict(list)
for p in predictions:
    by_ticker[p['ticker']].append(p)

ticker_accuracy = []
for ticker, preds in by_ticker.items():
    correct_ticker = sum(1 for p in preds if p['correct_direction'])
    accuracy_ticker = correct_ticker / len(preds) * 100
    ticker_accuracy.append((ticker, accuracy_ticker, correct_ticker, len(preds)))

ticker_accuracy.sort(key=lambda x: x[1], reverse=True)

for ticker, acc, correct, total in ticker_accuracy[:5]:
    print(f"{ticker}: {acc:.1f}% ({correct}/{total} correct)")
print()

print("BOTTOM 5 TICKERS (Worst Direction Accuracy)")
print("-" * 80)
for ticker, acc, correct, total in ticker_accuracy[-5:]:
    print(f"{ticker}: {acc:.1f}% ({correct}/{total} correct)")
print()

# Key insights
print("=" * 80)
print("KEY INSIGHTS")
print("=" * 80)
print()
print(f"1. BASELINE MODEL: {direction_accuracy:.1f}% direction accuracy")
print(f"   → Naive 'always positive' baseline: 54.7%")
print(f"   → {direction_accuracy:.1f}% is {'BELOW' if direction_accuracy < 54.7 else 'ABOVE'} baseline")
print()
print(f"2. MAGNITUDE PREDICTION: MAE = {mean_error:.2f}%")
print(f"   → High error confirms focus should be on DIRECTION not magnitude")
print()
print(f"3. NEXT STEPS:")
print(f"   → Implement full prediction engine with all features for each filing")
print(f"   → Extract financial metrics (EPS, revenue, guidance) from filings")
print(f"   → Re-run backtest with complete feature set")
print(f"   → Target: >60% direction accuracy")
print()
print("=" * 80)
print()
print("NOTE: This is a BASELINE test using dataset mean (+0.83%) only.")
print("Full backtest requires extracting features from all 278 filings.")
print("=" * 80)
