#!/usr/bin/env python3
"""
Advanced Regression: Deep dive into non-linear market cap relationship

The initial regression found:
- market_cap coefficient: -6.127
- market_cap_squared coefficient: +4.642

This suggests a U-shaped or inverted-U relationship!
Let's investigate and visualize.
"""

import json
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler, PolynomialFeatures
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score
from sklearn.metrics import mean_absolute_error
import warnings
warnings.filterwarnings('ignore')

# Read dataset
with open('/tmp/dataset.json', 'r') as f:
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

print("=" * 80)
print("ANALYZING NON-LINEAR MARKET CAP RELATIONSHIP")
print("=" * 80)
print()

# Group by market cap bins
print("RETURNS BY MARKET CAP CATEGORY:")
print("-" * 80)

filings['cap_category'] = pd.cut(
    filings['market_cap'],
    bins=[0, 200, 500, 1000, 5000],
    labels=['Small (<$200B)', 'Large ($200-500B)', 'Mega ($500B-1T)', 'Ultra (>$1T)']
)

for cat in ['Small (<$200B)', 'Large ($200-500B)', 'Mega ($500B-1T)', 'Ultra (>$1T)']:
    subset = filings[filings['cap_category'] == cat]
    if len(subset) > 0:
        mean_ret = subset['actual7dReturn'].mean()
        median_ret = subset['actual7dReturn'].median()
        pct_positive = (subset['actual7dReturn'] > 0).sum() / len(subset) * 100
        print(f"{cat:25s}: n={len(subset):3d}, mean={mean_ret:+.2f}%, median={median_ret:+.2f}%, {pct_positive:.1f}% positive")

print()

# Group by specific tickers
print("RETURNS BY TICKER (sorted by market cap):")
print("-" * 80)

ticker_stats = []
for ticker in market_caps.keys():
    subset = filings[filings['ticker'] == ticker]
    if len(subset) > 0:
        mean_ret = subset['actual7dReturn'].mean()
        median_ret = subset['actual7dReturn'].median()
        pct_positive = (subset['actual7dReturn'] > 0).sum() / len(subset) * 100
        ticker_stats.append({
            'ticker': ticker,
            'market_cap': market_caps[ticker],
            'n': len(subset),
            'mean': mean_ret,
            'median': median_ret,
            'pct_positive': pct_positive
        })

ticker_df = pd.DataFrame(ticker_stats).sort_values('market_cap', ascending=False)

for _, row in ticker_df.iterrows():
    print(f"{row['ticker']:6s} (${row['market_cap']:4.0f}B): n={row['n']:2.0f}, mean={row['mean']:+6.2f}%, {row['pct_positive']:5.1f}% positive")

print()

# Test polynomial degrees
print("=" * 80)
print("TESTING POLYNOMIAL REGRESSION (finding optimal degree)")
print("=" * 80)
print()

X = filings[['market_cap']].values
y = filings['actual7dReturn'].values

results = []

for degree in range(1, 6):
    # Create polynomial pipeline
    pipeline = Pipeline([
        ('poly', PolynomialFeatures(degree=degree, include_bias=False)),
        ('scaler', StandardScaler()),
        ('regression', LinearRegression())
    ])

    # Fit
    pipeline.fit(X, y)

    # Metrics
    r2_train = pipeline.score(X, y)
    cv_scores = cross_val_score(pipeline, X, y, cv=5, scoring='r2')
    r2_cv = cv_scores.mean()

    y_pred = pipeline.predict(X)
    mae = mean_absolute_error(y, y_pred)
    direction_correct = ((y_pred > 0) == (y > 0)).sum()
    direction_acc = direction_correct / len(y) * 100

    results.append({
        'degree': degree,
        'r2_train': r2_train,
        'r2_cv': r2_cv,
        'mae': mae,
        'direction_acc': direction_acc
    })

    print(f"Degree {degree}: R²={r2_train:.4f}, R²(CV)={r2_cv:.4f}, MAE={mae:.2f}%, Dir Acc={direction_acc:.1f}%")

print()

# Find best model
results_df = pd.DataFrame(results)
best_degree = results_df.loc[results_df['direction_acc'].idxmax(), 'degree']
print(f"Best degree (by direction accuracy): {int(best_degree)}")
print()

# Fit best model
best_pipeline = Pipeline([
    ('poly', PolynomialFeatures(degree=int(best_degree), include_bias=False)),
    ('scaler', StandardScaler()),
    ('regression', LinearRegression())
])
best_pipeline.fit(X, y)

# Get coefficients
poly_features = best_pipeline.named_steps['poly'].get_feature_names_out(['market_cap'])
coefs = best_pipeline.named_steps['regression'].coef_

print("POLYNOMIAL COEFFICIENTS:")
print("-" * 80)
for feature, coef in zip(poly_features, coefs):
    print(f"{feature:20s}: {coef:+.6f}")
print()

# Interpret the relationship
if best_degree >= 2:
    linear_coef = coefs[0]
    quad_coef = coefs[1] if len(coefs) > 1 else 0

    print("INTERPRETATION:")
    print("-" * 80)
    if quad_coef > 0:
        print("Shape: U-shaped (convex)")
        print("→ Small and large caps perform better")
        print("→ Mid caps perform worse")
        vertex = -linear_coef / (2 * quad_coef)
        print(f"→ Minimum at ~${vertex:.0f}B market cap")
    elif quad_coef < 0:
        print("Shape: Inverted-U (concave)")
        print("→ Mid caps perform better")
        print("→ Small and large caps perform worse")
        vertex = -linear_coef / (2 * quad_coef)
        print(f"→ Maximum at ~${vertex:.0f}B market cap")
    else:
        print("Shape: Linear")
        if linear_coef > 0:
            print("→ Larger caps perform better")
        else:
            print("→ Smaller caps perform better")
    print()

# Create visualization
print("Generating visualization...")
X_plot = np.linspace(X.min(), X.max(), 100).reshape(-1, 1)
y_plot = best_pipeline.predict(X_plot)

plt.figure(figsize=(12, 6))

# Scatter plot of actual data
plt.subplot(1, 2, 1)
plt.scatter(filings['market_cap'], filings['actual7dReturn'], alpha=0.5, s=20)
plt.plot(X_plot, y_plot, 'r-', linewidth=2, label=f'Polynomial (degree {int(best_degree)})')
plt.xlabel('Market Cap ($ Billions)')
plt.ylabel('7-Day Return (%)')
plt.title('Market Cap vs Returns (with polynomial fit)')
plt.grid(True, alpha=0.3)
plt.legend()

# Binned averages
plt.subplot(1, 2, 2)
bins = [0, 200, 400, 600, 1000, 1500, 2500, 5000]
bin_centers = []
bin_means = []
bin_stds = []

for i in range(len(bins) - 1):
    mask = (filings['market_cap'] >= bins[i]) & (filings['market_cap'] < bins[i+1])
    if mask.sum() > 0:
        bin_centers.append((bins[i] + bins[i+1]) / 2)
        bin_means.append(filings[mask]['actual7dReturn'].mean())
        bin_stds.append(filings[mask]['actual7dReturn'].std())

plt.errorbar(bin_centers, bin_means, yerr=bin_stds, fmt='o-', capsize=5, linewidth=2, markersize=8)
plt.axhline(y=0, color='gray', linestyle='--', alpha=0.5)
plt.axhline(y=filings['actual7dReturn'].mean(), color='green', linestyle='--', alpha=0.5, label='Dataset mean')
plt.xlabel('Market Cap Bin Center ($ Billions)')
plt.ylabel('Mean 7-Day Return (%)')
plt.title('Average Returns by Market Cap Bin')
plt.grid(True, alpha=0.3)
plt.legend()

plt.tight_layout()
plt.savefig('/tmp/market_cap_analysis.png', dpi=150, bbox_inches='tight')
print(f"Saved visualization to /tmp/market_cap_analysis.png")
print()

# Test interaction with bull market
print("=" * 80)
print("TESTING MARKET CAP × BULL MARKET INTERACTION")
print("=" * 80)
print()

# Create features
features = pd.DataFrame()
features['market_cap'] = filings['market_cap']
features['market_cap_sq'] = filings['market_cap'] ** 2
features['bull_market'] = filings['year'].isin([2023, 2025]).astype(int)
features['cap_bull'] = features['market_cap'] * features['bull_market']
features['cap_sq_bull'] = features['market_cap_sq'] * features['bull_market']

# Fit model with interactions
lr_interact = LinearRegression()
lr_interact.fit(features, y)

# Metrics
r2 = lr_interact.score(features, y)
y_pred = lr_interact.predict(features)
direction_correct = ((y_pred > 0) == (y > 0)).sum()
direction_acc = direction_correct / len(y) * 100

print(f"R² with interactions: {r2:.4f}")
print(f"Direction accuracy: {direction_acc:.1f}%")
print()

print("COEFFICIENTS:")
print("-" * 80)
for col, coef in zip(features.columns, lr_interact.coef_):
    print(f"{col:20s}: {coef:+.6f}")
print(f"{'Intercept':<20s}: {lr_interact.intercept_:+.6f}")
print()

# Compare bull vs bear markets
bull_mask = filings['year'].isin([2023, 2025])
bear_mask = filings['year'] == 2022

print("MARKET CAP EFFECT BY REGIME:")
print("-" * 80)
print("\nBULL MARKETS (2023, 2025):")
for cat in ['Small (<$200B)', 'Large ($200-500B)', 'Mega ($500B-1T)', 'Ultra (>$1T)']:
    subset = filings[bull_mask & (filings['cap_category'] == cat)]
    if len(subset) > 0:
        mean_ret = subset['actual7dReturn'].mean()
        pct_positive = (subset['actual7dReturn'] > 0).sum() / len(subset) * 100
        print(f"  {cat:25s}: mean={mean_ret:+6.2f}%, {pct_positive:5.1f}% positive")

print("\nBEAR MARKET (2022):")
for cat in ['Small (<$200B)', 'Large ($200-500B)', 'Mega ($500B-1T)', 'Ultra (>$1T)']:
    subset = filings[bear_mask & (filings['cap_category'] == cat)]
    if len(subset) > 0:
        mean_ret = subset['actual7dReturn'].mean()
        pct_positive = (subset['actual7dReturn'] > 0).sum() / len(subset) * 100
        print(f"  {cat:25s}: mean={mean_ret:+6.2f}%, {pct_positive:5.1f}% positive")

print()

print("=" * 80)
print("FINAL RECOMMENDATIONS")
print("=" * 80)
print()

best_acc = results_df['direction_acc'].max()
improvement = best_acc - 54.7

if improvement > 5:
    print(f"✅ SUCCESS: Polynomial model achieves {best_acc:.1f}% direction accuracy")
    print(f"   → Beats baseline by {improvement:.1f} percentage points")
    print(f"   → Non-linear market cap relationship {'CONFIRMED' if best_degree > 1 else 'NOT FOUND'}")
else:
    print(f"⚠️  LIMITED IMPROVEMENT: Best model achieves {best_acc:.1f}% direction accuracy")
    print(f"   → Beats baseline by {improvement:.1f} percentage points")
    print(f"   → Market cap alone insufficient for prediction")

print()
print("KEY FINDING:")
if best_degree > 1:
    print(f"→ Market cap has NON-LINEAR effect (degree {int(best_degree)} polynomial)")
    print(f"→ Should use polynomial or categorical features, not linear")
else:
    print(f"→ Market cap has LINEAR effect")
    print(f"→ Simple linear term sufficient")

print()
print("RECOMMENDATION: Add real features (EPS, guidance, sentiment) to improve accuracy")
print("=" * 80)
