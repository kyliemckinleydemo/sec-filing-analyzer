# Alpha Model v2 — Prediction Model Documentation

## Overview

StockHuntr uses a **Mixture-of-Experts (MoE) Ridge regression model** to predict 30-day market-relative alpha (stock return minus S&P 500 return) for companies that file 10-K, 10-Q, and 8-K reports with the SEC.

**Implementation**: `lib/alpha-model.ts`
**Model type**: Ridge regression (λ=100) with forward stepwise feature selection, routed through 44 MoE experts
**Target variable**: 30-day alpha = stock return − S&P 500 return over 30 calendar days post-filing
**Training data**: 4,009 SEC filings from 500+ companies across all sectors and cap tiers (2022–2025)
**Validation**: Strict 90-day walk-forward cross-validation (no lookahead bias, 90-day gap prevents boundary leakage)

---

## Performance

| Metric | Value |
|--------|-------|
| Strict 90-day CV directional accuracy (all) | 56.2% |
| **Directional accuracy (high confidence)** | **77.5%** |
| Annualized Sharpe ratio (high-conf signals) | **2.22** |
| Standard CV directional accuracy | 59.5% |
| CV gap (standard vs. strict) | ~3pp — confirms real OOS signal |
| Temporal consistency (2+ yrs → 1-2 yrs → last 12mo) | 69.8% → 76.6% → 82.2% |

The 3pp gap between standard and strict CV is healthy — small enough to confirm real signal, large enough to confirm honest measurement. The temporal consistency trend (improving with recency) is evidence the model is not a pure bull-market artifact.

The model's primary edge is **identifying relative losers** — SHORT signals carry the highest directional accuracy.

### v1 vs v2 Comparison

| Metric | v1 | v2 |
|--------|----|----|
| Training samples | 340 | 4,009 |
| Features | 8 | 13 |
| MoE experts | 1 (global only) | 44 |
| High-conf directional accuracy | 62.5% | 77.5% |
| Historical price snapshots | No | Yes (99% coverage) |
| Macro regime features | No | Yes |
| EPS surprise | No | Yes |
| Cap-tier specialization | No | Yes (4 tiers) |
| Sector specialization | 0 sectors | 11 sectors |

---

## Features (13 selected)

All features are standardized (z-scored) before weighting. Missing values fall back to training means, contributing zero signal.

### Price Momentum (strongest category)

| Feature | Source | Interpretation |
|---------|--------|----------------|
| `priceToLow` | `currentPrice / fiftyTwoWeekLow` | Momentum: stocks far above 52-week low continue outperforming |
| `priceToHigh` | `currentPrice / fiftyTwoWeekHigh` | Momentum: stocks near 52-week high continue showing strength |

**Critical scale note**: These are **ratios**, not percentages.
- Correct: `currentPrice / fiftyTwoWeekHigh` → e.g., 0.88
- Wrong: `(currentPrice / fiftyTwoWeekHigh - 1) × 100` → e.g., -12.0

Training-set means confirm ratio scale: `priceToHigh` mean = 0.8588, `priceToLow` mean = 1.3978.

### Analyst Activity (contrarian signals)

| Feature | Source | Interpretation |
|---------|--------|----------------|
| `majorDowngrades` | AnalystActivity table (top-tier banks) | Contrarian: major bank downgrades signal overreaction → recovery |
| `analystUpsidePotential` | `((targetPrice / currentPrice) - 1) × 100` | Value trap: high upside targets → stocks keep underperforming |
| `upgradesLast30d` | AnalystActivity table | Lagging indicator: upgrades follow price strength, slight negative weight |

**Major firms**: Goldman Sachs, Morgan Stanley, JP Morgan, Bank of America, Citi, Wells Fargo, Barclays, UBS.
Data sourced from Yahoo Finance `upgradeDowngradeHistory` via the daily analyst cron (117k+ rows in AnalystActivity table).

### AI-Generated Signals

| Feature | Source | Interpretation |
|---------|--------|----------------|
| `concernLevel` | Claude AI (0-10 scale) | Higher filing concern → lower alpha |
| `sentimentScore` | Claude AI (-1 to +1) | Positive filing sentiment → positive alpha (weak but real) |
| `toneChangeDelta` | `currentSentiment - priorSentiment` | Tone shift vs prior same-type filing; more predictive than absolute sentiment |

### Earnings & Filing Context

| Feature | Source | Interpretation |
|---------|--------|----------------|
| `epsSurprise` | Yahoo Finance earningsHistory | Strongest new feature: EPS beat → positive alpha, miss → negative; winsorized ±50% |
| `filingTypeFactor` | 10-K=0, 10-Q=0.5, 8-K=1 | 8-Ks carry immediate event catalysts; 10-Ks are longer-cycle |

### Macro Regime (new in v2)

| Feature | Source | Interpretation |
|---------|--------|----------------|
| `spxTrend30d` | MacroIndicators table (SPY chart) | S&P 500 30-day return at filing date: rising market lifts alpha |
| `vixLevel` | MacroIndicators table (VIXY chart) | Fear gauge: elevated VIX increases signal dispersion |

MacroIndicators table covers daily data from 2022-02-15 to present. 100% coverage across the 4,009 training filings.

---

## Mixture-of-Experts Architecture

Instead of one global model, we deploy **44 specialist experts** trained on subsets of the data:

### Expert Hierarchy

| Type | Count | Description |
|------|-------|-------------|
| Global | 1 | Fallback when no sector/cap-tier data |
| Sector | 11 | One per GICS sector (Technology, Healthcare, Financials, etc.) |
| Cap tier | 4 | Mega (>$200B), Large ($10-200B), Mid ($2-10B), Small (<$2B) |
| Sector × Cap tier | 29 | Combined experts (only trained when segment has ≥30 samples) |
| **Total** | **44** | |

### Routing Logic (4-level cascade)

```
sector:capTier expert → if exists, use it
  else → sector expert → if exists, use it
    else → capTier expert → if exists, use it
      else → global expert
```

Each expert has its own `FEATURE_STATS` (means and stds), `WEIGHTS`, and `SCORE_PERCENTILES` calibrated to its segment.

---

## Signal Classification

The model outputs a continuous score per expert. Signals and confidence levels are assigned based on where the score falls in that expert's training distribution:

| Percentile Range | Signal | Confidence |
|-----------------|--------|------------|
| >90th | LONG | high |
| 75th–90th | LONG | medium |
| 25th–75th | NEUTRAL | low |
| 10th–25th | SHORT | medium |
| <10th | SHORT | high |

**Predicted 30-day return** = expected alpha + market baseline (0.8%/month long-run S&P 500 average).

---

## How It Works

### Scoring Formula

For each filing:

1. Fetch macro data from MacroIndicators table (nearest row within 7 days of filing date)
2. Extract 13 raw feature values from Company, Filing, AnalystActivity, and MacroIndicators tables
3. Route to appropriate MoE expert based on sector + cap tier
4. Standardize each feature: `z = (raw - expert_mean) / expert_std`
5. Multiply by expert weight: `contribution = weight × z`
6. Sum all contributions → raw score
7. Map score to signal/confidence via expert's percentile thresholds

The model is a **fixed formula** — no retraining, no Python subprocess, no external dependencies. Scoring is deterministic and instant.

### Feature Extraction

`extractAlphaFeatures()` in `lib/alpha-model.ts` accepts:
- **Price data**: currentPrice, fiftyTwoWeekHigh, fiftyTwoWeekLow, marketCap, analystTargetPrice
- **Filing data**: concernLevel, sentimentScore, filingType, priorSentimentScore, epsSurprise
- **Macro data**: spxTrend30d, vixLevel
- **Analyst data**: upgradesLast30d, majorDowngradesLast30d

### Historical Price Snapshots

The predict route queries CompanySnapshot (triggerType='filing') for the price at filing date, falling back to current Company prices only when no snapshot exists. 99% of training filings have a historical snapshot, eliminating the stale-price bias where today's price is used for a 2-year-old filing.

---

## Key Discoveries from Model Development

### 1. Target Alpha, Not Returns

Predicting raw 7-day returns is dominated by market direction (bull vs. bear). Switching to **30-day market-relative alpha** removes market noise and isolates the filing-specific signal. This was the single most impactful architectural decision.

### 2. Simple Models Beat Complex Ones on Small Data

A systematic model zoo evaluation tested OLS, Ridge, Lasso, ElasticNet, Stepwise, Polynomial, Random Forest, and Gradient Boosting. RandomForest on 340 samples had CV R² = -0.067 (worse than predicting the mean). Ridge with 8 features achieved R² = +0.043. Simple linear models generalize far better on financial datasets where n is small relative to feature count.

### 3. Contrarian Analyst Signals

Major bank downgrades are the **second strongest bullish signal**. The market systematically overreacts to negative analyst actions from top-tier firms, creating a 30-day recovery opportunity. This directly contradicts naive intuition (and the old rule-based model which penalized downgrades).

High analyst upside potential is a **bearish signal** — stocks with large price target vs. current price gaps tend to be value traps that continue underperforming.

### 4. EPS Surprise Is the Strongest New Feature

Adding `epsSurprise` from Yahoo Finance earningsHistory was the single largest incremental improvement in v2. Coverage is 58% of filings (limited by availability of historical consensus data). The feature is winsorized to ±50% to prevent extreme outliers from distorting the model.

### 5. Macro Regime Prevents Bull-Market Bias

Without spxTrend30d and vixLevel, a model trained on 2022-2025 data risks being systematically bullish because most of the training period was in an uptrend. Adding macro regime features allows the model to modulate its confidence based on market conditions at the time of filing, improving bear-period signal quality.

### 6. Mixture of Experts Captures Sector-Specific Dynamics

Technology and Financials have different alpha dynamics post-filing than Industrials or Utilities. A single global model averages these away. The MoE architecture allows Technology mega-caps to have different feature weights than small-cap Healthcare companies without explicit interaction terms.

### 7. AI Features Are Weak but Real

Claude-generated features (concernLevel, sentimentScore, toneChangeDelta) survive forward stepwise selection against market features — they add real signal beyond what price and analyst data provide alone. However, their combined contribution is much smaller than price momentum or EPS surprise.

---

## Integration Points

### API Endpoints

| Endpoint | How it uses the model |
|----------|----------------------|
| `GET /api/analyze/[accession]` | Runs `predictAlpha()` after Claude AI analysis (user-triggered) |
| `GET /api/predict/[accession]` | Runs `predictAlpha()` for batch/cron predictions; fetches MacroIndicators |
| `POST /api/paper-trading/execute-signal` | Receives signal from prediction for trade execution |

### Database Columns

| Table | Column | Description |
|-------|--------|-------------|
| `Filing` | `predicted30dAlpha` | Model's expected 30-day alpha (percentage points) |
| `Filing` | `predicted30dReturn` | Expected 30-day total return (alpha + 0.8% baseline) |
| `Filing` | `predicted7dReturn` | Estimated 7-day return (30d return × 7/30, backward compat) |
| `Filing` | `predictionConfidence` | Mapped confidence (high=0.85, medium=0.65, low=0.5) |
| `Filing` | `epsSurprise` | EPS surprise % at filing date |
| `Prediction` | `predictedReturn` | Predicted 30-day total return |
| `Prediction` | `confidence` | Confidence score (0–1) |
| `Prediction` | `features` | Feature contribution breakdown (JSON) |
| `Prediction` | `modelVersion` | `'alpha-v1.0'` (stored label in DB) |
| `MacroIndicators` | `spxReturn30d`, `vixClose` | Macro data queried at prediction time |
| `CompanySnapshot` | `currentPrice`, `fiftyTwoWeekHigh/Low` | Historical prices at filing date (triggerType='filing') |

---

## What It Replaced (v1 Predecessors)

### 1. RandomForest (lib/ml-prediction.ts → scripts/predict_single_filing.py)

- **Problem**: Retrained a 200-tree RandomForest from CSV on every API call (~2-3 seconds)
- **Problem**: max_depth=10 on n=352 samples → massive overfitting (CV R² = -0.067)
- **Problem**: Predicted raw 7-day returns dominated by market direction
- **Problem**: Hardcoded `riskScore=5` and `sentimentScore=0` — threw away actual Claude AI outputs

### 2. Logistic Regression Baseline (lib/baseline-features.ts)

- **Problem**: Predicted every stock as positive — zero discriminative power
- **Problem**: "67.5% accuracy" was the base rate of positive returns in a bull market

### 3. Rule-Based Engine (lib/predictions.ts, still used as fallback)

- **Problem**: ~15 interacting factors with hand-tuned, never-validated weights
- **Problem**: Most factors don't survive cross-validation
- **Still used as**: last-resort fallback when Company has no price data

---

## Model Maintenance

### When to Retrain

- If high-confidence directional accuracy drops below 65% over 50+ predictions
- If LONG-SHORT spread turns negative over 30+ signals
- If market regime fundamentally changes (prolonged bear market may require recalibration)
- Run `npx tsx scripts/retrain-alpha-v2.ts` to regenerate all 44 expert coefficients

### Backtest

```bash
npx tsx scripts/backtest-alpha-v2.ts
```

Reports overall, by filing type, by temporal period, and historical-snapshot vs. stale-price accuracy.

### What NOT to Change

- `FEATURE_STATS` per expert — frozen from training, required for correct standardization
- `WEIGHTS` per expert — the regression coefficients
- `SCORE_PERCENTILES` per expert — calibrated to training distribution
- Feature scale (ratios not percentages for price features)
- `filingTypeFactor` encoding (10-K=0, 10-Q=0.5, 8-K=1)

### What CAN Be Adjusted

- Market baseline (currently 0.8%/month) — update if long-run S&P 500 average changes
- Confidence mapping thresholds — if percentile-based classification needs tuning
- Paper trading parameters — position sizing, hold period, stop-loss/take-profit
- `EPS_SURPRISE_WINSOR` cap (currently ±50%) — widen if outlier handling needs adjustment

---

## Files Reference

| File | Purpose |
|------|---------|
| `lib/alpha-model.ts` | 44 MoE expert definitions, `predictAlpha()`, `extractAlphaFeatures()`, `getCapTier()` |
| `scripts/retrain-alpha-v2.ts` | Walk-forward retraining script — regenerates all 44 experts |
| `scripts/backtest-alpha-v2.ts` | Backtesting with full metrics breakdown |
| `lib/accuracy-tracker.ts` | Tracks predicted vs. actual returns live |
| `lib/paper-trading.ts` | Trade execution engine using model signals |
| `lib/predictions.ts` | Legacy rule-based engine (fallback only) |
| `app/api/predict/[accession]/route.ts` | Batch/cron prediction path with macro data fetch |
| `app/api/analyze/[accession]/route.ts` | User-triggered analysis + prediction |
