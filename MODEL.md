# Alpha Model v1.0 — Prediction Model Documentation

## Overview

StockHuntr uses a **Stepwise+Ridge regression model** to predict 30-day market-relative alpha (stock return minus S&P 500 return) for companies that file 10-K, 10-Q, and 8-K reports with the SEC.

**Implementation**: `lib/alpha-model.ts`
**Model type**: Ridge regression (alpha=100) on 8 features selected by forward stepwise selection
**Target variable**: 30-day alpha = stock return - S&P 500 return over 30 calendar days post-filing
**Training data**: 340 SEC filings from 107 S&P 500 companies (Oct 2023 - Oct 2025)
**Validation**: 5-fold TimeSeriesSplit cross-validation (no lookahead bias)

---

## Performance

| Metric | Value |
|--------|-------|
| Cross-validated R² | 0.043 ± 0.056 |
| Directional accuracy (all signals) | 56.3% (80/142) |
| **Directional accuracy (high confidence)** | **62.5% (30/48)** |
| LONG-SHORT spread (all) | +3.73 percentage points |
| **LONG-SHORT spread (high confidence)** | **+7.64 percentage points** |
| SHORT signal accuracy | 62.7% (strongest signal type) |

The model's primary edge is **identifying relative losers** — SHORT signals have the highest directional accuracy at 62.7%.

---

## Features (8 of 29 selected)

Features are listed by absolute weight (importance to the model). All features are standardized (z-scored) before weighting.

| # | Feature | Weight | Source | Interpretation |
|---|---------|--------|--------|----------------|
| 1 | `priceToLow` | **+1.3191** | `currentPrice / fiftyTwoWeekLow` | Momentum: stocks far above 52-week low continue outperforming |
| 2 | `majorDowngrades` | **+0.7783** | AnalystActivity (top-tier banks) | Contrarian: major bank downgrades signal market overreaction → recovery |
| 3 | `analystUpsidePotential` | **-0.4069** | `((targetPrice / currentPrice) - 1) × 100` | Value trap: high upside targets signal stocks that keep underperforming |
| 4 | `priceToHigh` | **+0.3872** | `currentPrice / fiftyTwoWeekHigh` | Momentum: stocks near 52-week high continue showing strength |
| 5 | `concernLevel` | **-0.1165** | Claude AI (0-10 scale) | AI signal: higher filing concern → lower alpha |
| 6 | `marketCap` | **+0.0822** | Yahoo Finance | Size effect: larger companies → more predictable positive alpha |
| 7 | `sentimentScore` | **+0.0413** | Claude AI (-1 to +1) | AI signal: positive filing sentiment → positive alpha (weak) |
| 8 | `upgradesLast30d` | **-0.0112** | AnalystActivity | Negligible after other analyst features are included |

### Feature Categories

- **Market structure** (features 1, 4, 6): ~1.79 combined weight — dominates the model
- **Analyst activity** (features 2, 3, 8): ~1.19 combined weight — contrarian signals are key
- **AI-generated** (features 5, 7): ~0.16 combined weight — weak but real, survives stepwise selection

---

## Signal Classification

The model outputs a continuous score. Signals and confidence levels are assigned based on where the score falls in the training data distribution:

| Percentile Range | Signal | Confidence | Training Threshold |
|-----------------|--------|------------|-------------------|
| >90th | LONG | high | score > +1.6600 |
| 75th-90th | LONG | medium | score > +0.0438 |
| 25th-75th | NEUTRAL | low | -0.8114 to +0.0438 |
| 10th-25th | SHORT | medium | score < -0.8114 |
| <10th | SHORT | high | score < -1.0345 |

**Predicted 30-day return** = expected alpha + market baseline (0.8%/month long-run S&P 500 average).

---

## How It Works

### Scoring Formula

For each filing:

1. Extract 8 raw feature values from database (Company, Filing, AnalystActivity tables)
2. Standardize each feature: `z = (raw - training_mean) / training_std`
3. Multiply by weight: `contribution = weight × z`
4. Sum all contributions → raw score
5. Map score to signal/confidence via percentile thresholds

The model is a **fixed formula** — no retraining, no Python subprocess, no external dependencies. Scoring is deterministic and instant.

### Feature Extraction

`extractAlphaFeatures()` in `lib/alpha-model.ts` takes:
- **Company record**: currentPrice, fiftyTwoWeekHigh, fiftyTwoWeekLow, marketCap, analystTargetPrice
- **Filing record**: concernLevel, sentimentScore (from Claude AI analysis)
- **Analyst activity**: upgrade count and major-firm downgrade count in the 30 days before the filing

Missing values fall back to training means, contributing zero signal for that feature.

### Critical: Feature Scale

`priceToHigh` and `priceToLow` must be **ratios**, not percentages:
- Correct: `currentPrice / fiftyTwoWeekHigh` → e.g., 0.88
- Wrong: `(currentPrice / fiftyTwoWeekHigh - 1) × 100` → e.g., -12.0

The training data means confirm the ratio scale: `priceToHigh` mean = 0.8588, `priceToLow` mean = 1.3978.

---

## What It Replaced

The alpha model replaced three separate prediction systems:

### 1. RandomForest (lib/ml-prediction.ts → scripts/predict_single_filing.py)

- **Problem**: Retrained a 200-tree RandomForest from CSV on every API call (~2-3 seconds)
- **Problem**: max_depth=10 on n=352 samples → massive overfitting (CV R² = -0.067, worse than predicting the mean)
- **Problem**: Predicted raw 7-day returns (dominated by market direction, not filing-specific signal)
- **Problem**: 33 features, but hardcoded `riskScore=5` and `sentimentScore=0` — threw away the actual Claude AI outputs
- **Problem**: Fake confidence (starts at 0.65, bumps up for upgrades/coverage/prediction magnitude)

### 2. Logistic Regression Baseline (lib/baseline-features.ts)

- **Problem**: Predicted every stock as positive — confusion matrix: TN=0, FP=344, FN=0, TP=713
- **Problem**: "67.5% accuracy" was just the base rate of positive returns in a bull market
- **Problem**: Zero discriminative power

### 3. Rule-Based Engine (lib/predictions.ts)

- **Problem**: ~15 interacting factors with hand-tuned, never-validated weights
- **Problem**: Sophisticated heuristics (concern-adjusted sentiment inversion, P/E multipliers, market regime) but no out-of-sample validation
- **Problem**: Most factors don't survive cross-validation — only 8 of 29 candidates contribute real signal

---

## Key Discoveries from Model Development

### 1. Target Alpha, Not Returns

Predicting raw 7-day returns is dominated by market direction (bull vs bear market). Switching to **30-day market-relative alpha** removes market noise and isolates the filing-specific signal. This was the single most impactful change.

### 2. Simple Models Beat Complex Ones

A systematic model zoo evaluation tested OLS, Ridge, Lasso, ElasticNet, Stepwise, Polynomial, Random Forest, Gradient Boosting, and Mutual Information. The RandomForest (production model at the time) had CV R² = -0.067. Ridge with 8 features achieved R² = 0.043 — simple linear models generalize far better on small datasets.

### 3. Contrarian Analyst Signals

Major bank downgrades (Goldman Sachs, Morgan Stanley, JP Morgan, etc.) are the **second strongest bullish signal** (+0.78 weight). The market systematically overreacts to negative analyst actions from top-tier firms, creating a 30-day recovery opportunity. This directly contradicts the old rule-based model which penalized downgrades.

Conversely, high analyst upside potential is a **bearish signal** (-0.41 weight) — stocks with high price targets relative to current price tend to be "value traps" that continue underperforming.

### 4. AI Features Are Weak but Real

Claude-generated features (concernLevel, sentimentScore) collectively contribute ~0.16 weight out of ~3.3 total. Market structure features dominate. However, `concernLevel` (-0.12) is the 5th most important feature and survives forward stepwise selection, meaning it adds real signal beyond what market data provides. The old model wasted these features by hardcoding them to constants.

### 5. Momentum Dominates

The two strongest features are price ratios (priceToLow: +1.32, priceToHigh: +0.39). Stocks with strong recent performance relative to their 52-week range continue that trajectory post-filing. This is consistent with well-documented momentum effects in financial literature.

---

## Integration Points

### API Endpoints

| Endpoint | How it uses the model |
|----------|----------------------|
| `GET /api/analyze/[accession]` | Runs `predictAlpha()` after Claude AI analysis (user-triggered) |
| `GET /api/predict/[accession]` | Runs `predictAlpha()` for batch/cron predictions |
| `POST /api/paper-trading/execute-signal` | Receives signal from prediction for trade execution |

### Database Columns

| Table | Column | Description |
|-------|--------|-------------|
| `Filing` | `predicted30dAlpha` | Model's expected 30-day alpha (pp) |
| `Filing` | `predicted7dReturn` | Estimated 7-day return (alpha × 7/30 + baseline) |
| `Filing` | `predictionConfidence` | Mapped confidence (high=0.85, medium=0.65, low=0.5) |
| `Prediction` | `predictedReturn` | Predicted 30-day total return |
| `Prediction` | `confidence` | Confidence score (0-1) |
| `Prediction` | `features` | Feature contribution breakdown (JSON) |
| `Prediction` | `modelVersion` | `'alpha-v1.0'` |

### Major Firms List (for majorDowngrades feature)

```
Goldman Sachs, Morgan Stanley, JP Morgan, Bank of America,
Citi, Wells Fargo, Barclays, UBS
```

---

## Model Maintenance

### When to Retrain

- If high-confidence directional accuracy drops below 55% over 50+ predictions
- If LONG-SHORT spread turns negative over 30+ signals
- If market regime fundamentally changes (sustained bear market may invert momentum signals)

### What NOT to Change

- `FEATURE_STATS` — frozen from training set, required for correct standardization
- `WEIGHTS` — the model coefficients
- `SCORE_PERCENTILES` — calibrated to training distribution
- Feature scale (ratios not percentages for price features)

### What CAN Be Adjusted

- Market baseline (currently 0.8%/month) — update if long-run S&P 500 average changes significantly
- Confidence mapping thresholds — if the percentile-based classification needs tuning based on live performance
- Paper trading parameters — position sizing, hold period, stop-loss/take-profit levels

---

## Files Reference

| File | Purpose |
|------|---------|
| `lib/alpha-model.ts` | Model weights, scoring function, feature extraction |
| `lib/accuracy-tracker.ts` | Tracks predicted vs actual returns |
| `lib/paper-trading.ts` | Trade execution engine using model signals |
| `lib/predictions.ts` | Legacy rule-based engine (fallback only) |
| `lib/ml-prediction.ts` | Deprecated RandomForest bridge |
| `lib/baseline-features.ts` | Deprecated logistic regression features |
| `app/api/analyze/[accession]/route.ts` | User-triggered analysis + prediction |
| `app/api/predict/[accession]/route.ts` | Batch/cron prediction path |
| `data/ml_dataset_with_concern.csv` | Training dataset (340 filings, 29 features) — do not delete |
