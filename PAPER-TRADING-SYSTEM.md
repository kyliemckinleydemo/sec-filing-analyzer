# Paper Trading System

## Overview

The paper trading system automatically executes virtual trades based on Alpha Model v1.0 predictions. When SEC filings (10-K, 10-Q) are analyzed, the system evaluates the model's LONG/SHORT/NEUTRAL signal and opens positions accordingly. Positions auto-close after a 30-day hold period matching the model's prediction horizon.

**Dashboard**: [stockhuntr.net/paper-trading](https://stockhuntr.net/paper-trading)
**Starting Capital**: $100,000
**Implementation**: `lib/paper-trading.ts`

---

## How It Works

```
Filing Analyzed (user or cron)
    │
    └─► Alpha Model scores filing → LONG / SHORT / NEUTRAL
        │
        ├─► LONG or SHORT with sufficient confidence/magnitude
        │   └─► Paper Trading Engine evaluates signal
        │       ├─► Checks: confidence ≥ portfolio threshold (default 60%)
        │       ├─► Checks: |predicted return| ≥ 0.5%
        │       ├─► Checks: no existing position in ticker
        │       ├─► Checks: sufficient cash
        │       └─► Opens position at next trading day's open price
        │
        └─► NEUTRAL or low confidence
            └─► No trade

Daily Cron (3:00 AM ET)
    │
    └─► Close positions open 30+ days
        └─► Fetch current price → calculate P&L
            └─► Update portfolio metrics + daily snapshot
```

---

## Trading Rules

### Entry Criteria

A trade executes when ALL conditions are met:

| Condition | Threshold | Source |
|-----------|-----------|--------|
| Model confidence | ≥ portfolio `minConfidence` (default 60%) | `PaperPortfolio.minConfidence` |
| Predicted return magnitude | ≥ 0.5% | Alpha model `predicted30dReturn` |
| No duplicate position | Not already holding the ticker | `PaperTrade` where status=OPEN |
| Sufficient cash | Position value ≤ available cash | `PaperPortfolio.currentCash` |
| Portfolio active | Not paused | `PaperPortfolio.isActive` |

### Signal Mapping

| Alpha Model Signal | Trade Direction |
|-------------------|----------------|
| LONG (high confidence) | BUY — full position |
| LONG (medium confidence) | BUY — full position |
| SHORT (high confidence) | SHORT — full position |
| SHORT (medium confidence) | SHORT — full position |
| NEUTRAL (low confidence) | No trade |

### Entry Timing

Trades execute at **market open on the next trading day** after the filing:

- Filing Monday 5:00 PM → Enter Tuesday 9:30 AM
- Filing Friday 6:00 PM → Enter Monday 9:30 AM (skip weekend)
- Uses historical opening price for backtesting, current price for recent filings
- If price unavailable, trade queued as PENDING for next market open

### Position Sizing (Kelly Criterion)

```
Position Size = min(
  (confidence × |predictedReturn|) / 100,
  maxPositionSize (default 10%)
)
```

Examples:
- Predicted: +3.5% alpha, 85% confidence → (0.85 × 3.5) / 100 = 2.98% of portfolio
- Predicted: +5.0% alpha, 65% confidence → (0.65 × 5.0) / 100 = 3.25% of portfolio
- Predicted: +12% alpha, 85% confidence → 10.2%, capped at **10% of portfolio**

### Exit Rules

- **Hold period**: 30 calendar days from entry (matches alpha model's 30-day prediction horizon)
- **Daily cron**: Checks for expired positions at 3:00 AM ET
- **Exit price**: Current market price at time of closure
- **Commission**: $1.00 per trade ($2.00 round-trip)

---

## Portfolio Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Starting Capital | $100,000 | Initial account value |
| Max Position Size | 10% | Maximum per position ($10,000) |
| Min Confidence | 60% | Minimum model confidence to trade |
| Hold Period | 30 days | Matches alpha model prediction horizon |
| Commission | $1.00 | Per-trade commission |

---

## API Endpoints

### Execute Trade Signal

**`POST /api/paper-trading/execute-signal`**

Called after alpha model scores a filing.

```json
{
  "portfolioId": "cmgu5ysgx0000boh27mxywid1",
  "ticker": "AAPL",
  "filingId": "filing-id",
  "predictedReturn": 3.5,
  "confidence": 0.85,
  "direction": "LONG",
  "marketCap": 3000000000000
}
```

### Get Portfolio Summary

**`GET /api/paper-trading/portfolio/[portfolioId]`**

Returns portfolio state, open positions with unrealized P&L, and recent closed trades.

### Close Expired Positions (Cron)

**`GET /api/cron/paper-trading-close-positions`**

Runs daily at 3:00 AM ET. Closes positions held 30+ days, updates metrics, creates daily snapshots.

---

## Integration with Alpha Model

When a filing is analyzed via `/api/analyze/[accession]`:

1. Claude AI analyzes the filing → `concernLevel`, `sentimentScore`
2. Yahoo Finance provides company data → `currentPrice`, `fiftyTwoWeekHigh/Low`, `marketCap`
3. `AnalystActivity` queried → `upgradesLast30d`, `majorDowngradesLast30d`
4. `extractAlphaFeatures()` builds feature vector
5. `predictAlpha()` scores the filing → signal, confidence, expected alpha
6. If signal is LONG or SHORT → trade signal sent to paper trading engine

```typescript
import { predictAlpha, extractAlphaFeatures } from '@/lib/alpha-model';

const features = extractAlphaFeatures(company, filing, analystActivity);
const prediction = predictAlpha(features);

// Submit to paper trading if actionable signal
if (prediction.signal !== 'NEUTRAL') {
  await engine.evaluateTradeSignal({
    ticker: company.ticker,
    filingId: filing.id,
    predictedReturn: prediction.predicted30dReturn,
    confidence: prediction.confidence === 'high' ? 0.85 : 0.65,
    direction: prediction.signal as 'LONG' | 'SHORT',
    marketCap: company.marketCap,
  });
}
```

---

## Expected Performance

Based on alpha model backtesting (340 filings, Oct 2023 - Oct 2025):

| Metric | All Signals | High Confidence |
|--------|------------|-----------------|
| Directional accuracy | 56.3% | 62.5% |
| LONG-SHORT spread | +3.73pp | +7.64pp |
| SHORT accuracy | 62.7% | — |

**Important caveats**:
- Training period (2023-2025) was a strong bull market — raw return accuracy is inflated
- The model targets **alpha** (vs S&P 500), not raw returns, which partially mitigates this
- Real-world performance will vary with market conditions, slippage, and timing
- Paper trading validates live performance — monitor directional accuracy and spread

---

## Database Schema

### PaperPortfolio

Portfolio configuration and aggregate metrics.

| Column | Type | Description |
|--------|------|-------------|
| startingCapital | Float | Initial capital ($100,000) |
| currentCash | Float | Available cash |
| totalValue | Float | Cash + open positions |
| totalReturn | Float | % return since inception |
| winRate | Float | % of winning trades |
| maxPositionSize | Float | Max % per position (0.10 = 10%) |
| minConfidence | Float | Min confidence to trade (0.60 = 60%) |
| isActive | Boolean | Portfolio enabled |

### PaperTrade

Individual trade records.

| Column | Type | Description |
|--------|------|-------------|
| ticker | String | Stock ticker |
| filingId | String | Filing that triggered the trade |
| direction | String | LONG or SHORT |
| entryDate/Price/Value | DateTime/Float | Entry details |
| exitDate/Price/Value | DateTime/Float | Exit details (null while open) |
| predictedReturn | Float | Alpha model's prediction |
| confidence | Float | Model confidence (0-1) |
| actualReturn | Float | Realized return after exit |
| realizedPnL | Float | Dollar P&L |
| status | String | OPEN, CLOSED, PENDING, CANCELLED |

### PortfolioSnapshot

Daily snapshots for charting portfolio value over time.

---

## Monitoring

### What to Watch

- **Directional accuracy**: Should track near backtested 56-62% over time
- **LONG-SHORT spread**: Should remain positive — if negative, model may be degrading
- **Position closures**: Cron job should close positions daily — check for stuck positions (>35 days)
- **Cash balance**: Should stay above 20% of portfolio value

### Troubleshooting

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| No trades executing | No new filings analyzed, or all signals NEUTRAL | Check filing ingestion cron |
| Positions not closing | Cron job failure or Yahoo Finance API error | Check Vercel function logs, trigger manually |
| Accuracy below 50% | Market regime change or model degradation | Review by signal type (LONG vs SHORT) |
| Inaccurate P&L | Stale price data or wrong direction | Verify prices match Yahoo Finance |

---

## Files

| File | Purpose |
|------|---------|
| `lib/paper-trading.ts` | PaperTradingEngine class — evaluation, execution, closure |
| `lib/alpha-model.ts` | Alpha model scoring (provides trade signals) |
| `app/api/paper-trading/execute-signal/route.ts` | Trade submission endpoint |
| `app/api/paper-trading/portfolio/[portfolioId]/route.ts` | Portfolio summary endpoint |
| `app/api/cron/paper-trading-close-positions/route.ts` | Daily position closure cron |
| `app/paper-trading/page.tsx` | Dashboard UI |
