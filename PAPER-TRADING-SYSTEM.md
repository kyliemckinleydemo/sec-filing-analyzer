# Paper Trading System Documentation

**Status**: ✅ Production Ready
**Portfolio ID**: `cmgu5ysgx0000boh27mxywid1`
**Starting Capital**: $100,000
**Created**: October 17, 2025

---

## Overview

The paper trading system automatically executes theoretical trades based on the 80% accuracy ML model. When new SEC filings (10-K, 10-Q) are analyzed, the system:

1. **Evaluates** the model's prediction and confidence
2. **Opens position** if criteria are met (confidence >60%, predicted return >2%)
3. **Holds position** for exactly 7 days
4. **Closes automatically** after 7-day hold period
5. **Tracks performance** vs model predictions

This validates the model's real-world performance and provides live metrics for continuous improvement.

---

## System Architecture

```
Daily 2:00 AM ET
    │
    ├─► Job 1: Fetch SEC Filings (RSS feed)
    │   └─► Update company fundamentals
    │       └─► New 10-K/10-Q filings detected
    │
    ▼ 30 minutes
    │
Daily 2:30 AM ET
    │
    ├─► Job 2: Update Analyst Data
    │   └─► Fetch analyst activity (30-day window)
    │       └─► Filing ready for ML prediction
    │           │
    │           └─► ML Model analyzes filing
    │               └─► Generates prediction + confidence
    │                   │
    │                   └─► Paper Trading Engine evaluates
    │                       │
    │                       ├─► If criteria met:
    │                       │   └─► Opens position (LONG/SHORT)
    │                       │       └─► Records entry price, shares, date
    │                       │
    │                       └─► If criteria not met:
    │                           └─► Skips trade (logs reason)
    │
    ▼ 30 minutes
    │
Daily 3:00 AM ET
    │
    └─► Job 3: Close Expired Positions
        └─► Find positions open 7+ days
            └─► Fetch current price
                └─► Close position
                    └─► Calculate P&L
                        └─► Compare predicted vs actual return
                            └─► Update portfolio metrics
                                └─► Create daily snapshot
```

---

## Trading Rules

### Entry Criteria

A trade is **only executed** if ALL of these conditions are met:

1. **Model Confidence**: > 60% (configurable, default 60%)
2. **Predicted Return**: > 2% absolute value (worthwhile vs commissions)
3. **No Existing Position**: Not already holding the same ticker
4. **Sufficient Cash**: Enough cash to open the position
5. **Portfolio Active**: Portfolio not paused/disabled

### Entry Timing

Trades are executed at **market open on the next trading day** after the filing:

**Why?**
- SEC filings typically occur after market close (4:00 PM ET)
- You can't trade at filing time - market is closed
- Realistic simulation: place order after reading filing, execute at next open
- Matches real-world trading constraints

**Examples**:
- Filing on Monday 5:00 PM → Enter Tuesday 9:30 AM open
- Filing on Friday 6:00 PM → Enter Monday 9:30 AM open (skip weekend)
- Filing on Wednesday 8:00 PM → Enter Thursday 9:30 AM open

**Implementation**:
- Uses historical opening price for backtesting
- Falls back to current price for real-time filings
- Skips weekends and holidays automatically

### Position Sizing

Position size is calculated using a simplified **Kelly Criterion**:

```
Position Size = min(
  (Confidence × |Predicted Return|) / 100,
  Max Position Size (10% default)
)
```

**Examples**:
- Predicted: +5% return, 80% confidence → Size = (0.80 × 5) / 100 = 4% of portfolio
- Predicted: +8% return, 70% confidence → Size = (0.70 × 8) / 100 = 5.6% of portfolio
- Predicted: +15% return, 90% confidence → Size = 13.5%, capped at 10% = **10% of portfolio**

This ensures:
- Higher confidence + higher predicted return = larger position
- Never risk more than 10% on a single trade
- Conservative sizing for lower confidence predictions

### Exit Criteria

Positions are **automatically closed** after:
- **7 calendar days** from entry date (the day you bought at open)
- Daily cron job at 3:00 AM ET checks for expired positions
- Uses current market price at time of close
- Records actual return for comparison to prediction

**Example Timeline**:
- Filing: Monday 5:00 PM
- Entry: Tuesday 9:30 AM (market open)
- Exit: Tuesday +7 days at current price
- **Total hold**: Exactly 7 days from entry

### Commissions and Fees

Realistic trading costs are included:
- **$1.00 per trade** (entry and exit)
- Total cost per round-trip: $2.00
- Applied to P&L calculations
- Typical of zero-commission brokers (payment for order flow)

---

## Portfolio Configuration

### Current Settings

| Setting | Value | Description |
|---------|-------|-------------|
| **Starting Capital** | $100,000 | Initial account value |
| **Max Position Size** | 10% | Maximum per position ($10,000) |
| **Min Confidence** | 60% | Minimum model confidence to trade |
| **Hold Period** | 7 days | Fixed hold period (matches training) |
| **Commission** | $1.00 | Per-trade commission |
| **Portfolio ID** | `cmgu5ysgx0000boh27mxywid1` | Database identifier |

### Modifying Settings

To create a portfolio with different settings:

```typescript
import { createPaperPortfolio } from '../lib/paper-trading';

const portfolioId = await createPaperPortfolio(
  'Conservative Portfolio',
  50000.00,  // $50k starting capital
  {
    maxPositionSize: 0.05,   // Max 5% per position
    minConfidence: 0.70      // Only trade if >70% confidence
  }
);
```

---

## API Endpoints

### 1. Execute Trade Signal

**Endpoint**: `POST /api/paper-trading/execute-signal`

Called after ML model analyzes a filing.

**Request Body**:
```json
{
  "portfolioId": "cmgu5ysgx0000boh27mxywid1",
  "ticker": "AAPL",
  "filingId": "filing-id-here",
  "predictedReturn": 5.3,
  "confidence": 0.82,
  "direction": "LONG",
  "marketCap": 3000000000000
}
```

**Response (Trade Executed)**:
```json
{
  "executed": true,
  "tradeId": "trade-id-here",
  "trade": {
    "ticker": "AAPL",
    "shares": 50,
    "entryPrice": 175.23,
    "positionValue": 8761.50,
    "commission": 1.00
  }
}
```

**Response (Trade Skipped)**:
```json
{
  "executed": false,
  "reason": "Signal did not meet trading criteria"
}
```

### 2. Get Portfolio Summary

**Endpoint**: `GET /api/paper-trading/portfolio/[portfolioId]`

Retrieves current portfolio state, open positions, and recent trades.

**Response**:
```json
{
  "portfolio": {
    "name": "Main Portfolio",
    "startingCapital": 100000.00,
    "currentCash": 92345.67,
    "totalValue": 103456.78,
    "totalReturn": 3.46,
    "winRate": 75.5,
    "totalTrades": 12,
    "winningTrades": 9,
    "losingTrades": 3
  },
  "openPositions": [
    {
      "ticker": "AAPL",
      "shares": 50,
      "entryPrice": 175.23,
      "currentPrice": 178.45,
      "unrealizedPnL": 161.00,
      "unrealizedPnLPct": 1.84,
      "daysHeld": 3,
      "predictedReturn": 5.3,
      "confidence": 0.82
    }
  ],
  "recentTrades": [
    {
      "ticker": "MSFT",
      "entryPrice": 350.12,
      "exitPrice": 358.90,
      "realizedPnL": 450.30,
      "realizedPnLPct": 2.51,
      "predictedReturn": 3.2,
      "actualReturn": 2.51,
      "exitDate": "2025-10-15T03:00:00.000Z"
    }
  ],
  "stats": {
    "modelAccuracy": 75.0,
    "avgWin": 3.45,
    "avgLoss": -1.23,
    "profitFactor": 2.80,
    "avgHoldDays": 7.0,
    "bestTrade": { ... },
    "worstTrade": { ... }
  }
}
```

### 3. Close Expired Positions (Cron)

**Endpoint**: `GET /api/cron/paper-trading-close-positions`

Automatically called by Vercel Cron at 3:00 AM ET daily.

**Response**:
```json
{
  "success": true,
  "message": "Closed 3 positions across 1 portfolios",
  "results": {
    "portfolios": 1,
    "positionsClosed": 3
  }
}
```

---

## Dashboard

### Accessing the Dashboard

**URL**: `https://your-domain.vercel.app/paper-trading`

The dashboard provides real-time visibility into:

1. **Portfolio Metrics**
   - Total value and return since inception
   - Cash balance and allocation
   - Win rate and trade statistics
   - Model directional accuracy

2. **Open Positions**
   - Current holdings with unrealized P&L
   - Entry price vs current price
   - Days held (countdown to auto-close)
   - Model prediction vs current performance

3. **Recent Trades**
   - Last 10 closed positions
   - Realized P&L per trade
   - Predicted return vs actual return
   - Model accuracy per trade (✓ or ✗)

4. **Performance Stats**
   - Average win/loss percentages
   - Profit factor (total wins / total losses)
   - Best and worst trades
   - Average hold period

### Dashboard Features

- **Auto-Refresh**: Updates every 60 seconds
- **Color Coding**: Green for profits, red for losses
- **Model Accuracy Tracking**: Compares predicted vs actual returns
- **Position Monitoring**: Shows days remaining until auto-close

---

## Performance Metrics

### Key Performance Indicators (KPIs)

1. **Total Return**
   - (Current Portfolio Value - Starting Capital) / Starting Capital × 100
   - Target: Beat market (S&P 500) return

2. **Win Rate**
   - Winning Trades / Total Trades × 100
   - Expected: 75-85% (based on model accuracy)

3. **Model Accuracy**
   - Trades where prediction direction matched actual direction
   - Expected: 75-85% (mega/large-caps)

4. **Profit Factor**
   - Total $ Wins / Total $ Losses
   - Target: > 2.0 (wins are 2× larger than losses)

5. **Sharpe Ratio** (Future Enhancement)
   - Risk-adjusted return
   - Target: > 1.0

6. **Max Drawdown**
   - Largest peak-to-trough decline
   - Track for risk management

### Expected Performance

Based on the 80% accuracy ML model:

**Conservative Estimate**:
- Win Rate: 75%
- Average Win: +3.5%
- Average Loss: -1.5%
- Profit Factor: 2.33
- **Expected Annual Return**: ~30-40%

**Aggressive Estimate**:
- Win Rate: 80%
- Average Win: +4.0%
- Average Loss: -2.0%
- Profit Factor: 3.20
- **Expected Annual Return**: ~50-70%

**Reality Check**:
- These are theoretical estimates
- Real performance will vary based on:
  - Market conditions
  - Timing of SEC filings
  - Price slippage (not modeled)
  - Actual vs predicted returns

---

## Database Schema

### PaperPortfolio Table

Stores portfolio configuration and performance metrics.

```typescript
{
  id: string;                    // Unique portfolio ID
  name: string;                  // "Main Portfolio"
  startingCapital: number;       // $100,000
  currentCash: number;           // Current cash balance
  totalValue: number;            // Cash + open positions
  totalReturn: number;           // % return since inception
  winRate: number;               // % of winning trades
  sharpeRatio: number;           // Risk-adjusted return
  maxDrawdown: number;           // Worst peak-to-trough
  totalTrades: number;           // Count of all trades
  winningTrades: number;         // Count of profitable trades
  losingTrades: number;          // Count of losing trades
  maxPositionSize: number;       // Max % per position (0.10 = 10%)
  minConfidence: number;         // Min model confidence (0.60 = 60%)
  isActive: boolean;             // Portfolio enabled?
  createdAt: DateTime;
  updatedAt: DateTime;
}
```

### PaperTrade Table

Stores individual trades (open and closed).

```typescript
{
  id: string;                    // Unique trade ID
  portfolioId: string;           // Foreign key to portfolio
  ticker: string;                // "AAPL", "MSFT", etc.
  filingId: string;              // SEC filing that triggered trade
  direction: string;             // "LONG" or "SHORT"

  // Entry
  entryDate: DateTime;           // When position opened
  entryPrice: number;            // Price at entry
  shares: number;                // Number of shares
  entryValue: number;            // shares × entryPrice
  entryCommission: number;       // $1.00

  // Exit
  exitDate: DateTime;            // When position closed
  exitPrice: number;             // Price at exit
  exitValue: number;             // shares × exitPrice
  exitCommission: number;        // $1.00

  // P&L
  realizedPnL: number;           // $ profit/loss
  realizedPnLPct: number;        // % profit/loss
  unrealizedPnL: number;         // Current P&L (if open)

  // Model prediction
  predictedReturn: number;       // ML model's prediction
  confidence: number;            // Model confidence (0-1)
  actualReturn: number;          // Actual return after exit

  // Status
  status: string;                // "OPEN", "CLOSED", "CANCELLED"
  notes: string;                 // Trade notes

  createdAt: DateTime;
  updatedAt: DateTime;
}
```

### PortfolioSnapshot Table

Stores daily portfolio snapshots for charting.

```typescript
{
  id: string;
  portfolioId: string;
  date: DateTime;                // Snapshot date (midnight)
  totalValue: number;            // Portfolio value
  cashBalance: number;           // Cash portion
  positionsValue: number;        // Open positions value
  dailyReturn: number;           // % change from yesterday
  dailyPnL: number;              // $ change from yesterday
  cumulativeReturn: number;      // % return since inception
  cumulativePnL: number;         // $ P&L since inception
  openPositions: number;         // Count of open positions
  createdAt: DateTime;
}
```

---

## Cron Job Schedule

### Job 3: Paper Trading Position Closure

**Schedule**: `0 3 * * *` (3:00 AM ET daily)
**Endpoint**: `/api/cron/paper-trading-close-positions`
**Duration**: ~60-90 seconds

**What It Does**:
1. Finds all positions open 7+ days
2. Fetches current prices from Yahoo Finance
3. Closes expired positions
4. Calculates realized P&L
5. Compares predicted vs actual returns
6. Updates portfolio metrics
7. Creates daily portfolio snapshots

**Runs After**:
- Job 1 (2:00 AM): Daily filings & fundamentals
- Job 2 (2:30 AM): Analyst data update

This sequence ensures:
- New filings are analyzed first
- New positions can be opened
- Then expired positions are closed
- Clean daily cycle

---

## Integration with ML Model

### Automatic Trade Execution Flow

When a new SEC filing is analyzed:

1. **Filing Analysis** (manual or automated)
   ```typescript
   // Analyze filing with ML model
   const prediction = await mlModel.predict(filingData);
   // prediction = { return: 5.3, confidence: 0.82 }
   ```

2. **Generate Trade Signal**
   ```typescript
   const signal = {
     portfolioId: 'cmgu5ysgx0000boh27mxywid1',
     ticker: 'AAPL',
     filingId: filing.id,
     predictedReturn: prediction.return,
     confidence: prediction.confidence,
     direction: prediction.return > 0 ? 'LONG' : 'SHORT',
     marketCap: company.marketCap
   };
   ```

3. **Submit to Paper Trading Engine**
   ```typescript
   const response = await fetch('/api/paper-trading/execute-signal', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(signal)
   });
   ```

4. **Engine Evaluates & Executes**
   - Checks confidence threshold (>60%)
   - Checks predicted return magnitude (>2%)
   - Calculates position size (Kelly Criterion)
   - Fetches current price
   - Opens position if criteria met
   - Records trade in database

### Example Integration Code

Add to your filing analysis endpoint:

```typescript
// After ML model generates prediction
if (prediction && prediction.confidence > 0.60) {
  // Submit to paper trading
  try {
    await fetch('/api/paper-trading/execute-signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolioId: process.env.PORTFOLIO_ID,
        ticker: company.ticker,
        filingId: filing.id,
        predictedReturn: prediction.return,
        confidence: prediction.confidence,
        direction: prediction.return > 0 ? 'LONG' : 'SHORT',
        marketCap: company.marketCap
      })
    });
  } catch (error) {
    console.error('Paper trading submission failed:', error);
    // Don't fail the filing analysis if paper trading fails
  }
}
```

---

## Monitoring and Alerts

### Daily Monitoring Checklist

Check these metrics daily:

1. **Cron Job Status**
   - Verify Job 3 ran successfully at 3:00 AM
   - Check Vercel logs for errors

2. **Portfolio Health**
   - Total value vs starting capital
   - Number of open positions (should be reasonable)
   - Cash balance (not too low)

3. **Model Accuracy**
   - Compare predicted vs actual returns
   - Should be 75-85% directional accuracy
   - If dropping below 65%, investigate

4. **Trade Execution**
   - New positions opened on filing days
   - Positions closed after 7 days
   - No stuck positions (>8 days old)

### Alerts to Set Up (Future)

1. **Portfolio Drawdown > 10%**
   - Alert if portfolio drops >10% from peak
   - May indicate model degradation

2. **Model Accuracy < 65%**
   - Alert if accuracy drops below production threshold
   - Requires model retraining

3. **Cron Job Failure**
   - Alert if position closure job fails
   - Manual intervention needed

4. **Cash < 20%**
   - Alert if cash drops below 20% of portfolio
   - May need to close positions or reduce sizing

---

## Future Enhancements

### Phase 1: Basic Improvements

1. **Stop Loss / Take Profit**
   - Auto-close if position drops 5% (stop loss)
   - Auto-close if position gains 10% (take profit)
   - Overrides 7-day hold period

2. **Email Notifications**
   - Daily summary email
   - Trade execution alerts
   - Performance milestones

3. **Advanced Charting**
   - Portfolio value over time (line chart)
   - Cumulative return vs S&P 500
   - Win/loss distribution histogram

### Phase 2: Risk Management

1. **Position Limits**
   - Max 5 open positions at once
   - Sector exposure limits
   - Prevent over-concentration

2. **Dynamic Position Sizing**
   - Reduce size after losing streak
   - Increase size after winning streak
   - Volatility-adjusted sizing

3. **Correlation Analysis**
   - Avoid opening correlated positions
   - Diversification score

### Phase 3: Strategy Variants

1. **Multiple Portfolios**
   - Conservative (5% max position, 70% confidence)
   - Aggressive (15% max position, 55% confidence)
   - Mega-cap only (10% position, 60% confidence)

2. **Different Hold Periods**
   - 3-day hold period
   - 14-day hold period
   - 30-day hold period
   - Compare performance

3. **Short Selling**
   - Currently supports SHORT direction
   - Need to implement borrow costs
   - Track short interest

---

## Troubleshooting

### Common Issues

#### 1. No Trades Being Executed

**Symptoms**: Portfolio dashboard shows 0 open positions for days

**Possible Causes**:
- No new SEC filings matching criteria (10-K, 10-Q only)
- Model predictions below confidence threshold (60%)
- Predicted returns too small (<2%)
- Already holding positions in those tickers

**Resolution**:
- Check recent SEC filings: were there any 10-K/10-Q?
- Review model predictions: what confidence/return?
- Lower `minConfidence` setting if too restrictive
- Check logs for "Signal rejected" messages

#### 2. Positions Not Closing After 7 Days

**Symptoms**: Positions show 8+ days held

**Possible Causes**:
- Cron job failed to run
- Yahoo Finance API error (couldn't fetch price)
- Database update failed

**Resolution**:
- Check Vercel cron logs for Job 3
- Manually trigger: `curl https://your-domain/api/cron/paper-trading-close-positions`
- Check Yahoo Finance API status
- Verify database connectivity

#### 3. Inaccurate P&L Calculations

**Symptoms**: P&L doesn't match expected values

**Possible Causes**:
- Price data stale or incorrect
- Commission not applied
- Direction (LONG/SHORT) incorrect

**Resolution**:
- Verify prices in database match Yahoo Finance
- Check trade record: entry price, exit price, shares
- Recalculate manually: (exit - entry) × shares - commissions
- Check direction field

#### 4. Model Accuracy Below Expected

**Symptoms**: Model accuracy <75% on dashboard

**Possible Causes**:
- Market regime change (model trained on different conditions)
- Model degradation over time
- Different market cap mix than training data
- Timing issues (7-day hold may not be optimal for all stocks)

**Resolution**:
- Analyze by market cap: which segment underperforming?
- Review recent trades: any patterns in losses?
- Consider retraining model with recent data
- Test different hold periods

---

## Maintenance

### Weekly Tasks

1. **Review Performance**
   - Check total return vs target
   - Analyze winning/losing trades
   - Compare to S&P 500 benchmark

2. **Model Accuracy Check**
   - Calculate directional accuracy
   - Break down by market cap
   - Identify systematic errors

3. **Database Cleanup** (Optional)
   - Archive closed trades >90 days old
   - Keep portfolio snapshots for charting

### Monthly Tasks

1. **Performance Report**
   - Monthly return
   - Sharpe ratio
   - Max drawdown
   - Comparison to benchmarks

2. **Model Evaluation**
   - Is accuracy maintaining 75%+?
   - Any features losing predictive power?
   - Consider retraining if degrading

3. **Strategy Optimization**
   - Test different confidence thresholds
   - Test different position sizes
   - Test different hold periods

### Quarterly Tasks

1. **Comprehensive Review**
   - Overall system health
   - Model performance trends
   - Strategy effectiveness

2. **Feature Engineering**
   - Add new ML features if available
   - Remove low-importance features
   - Retrain model

3. **Risk Assessment**
   - Review max drawdown
   - Analyze losing trades
   - Adjust risk parameters if needed

---

## Summary

### System Status: ✅ Production Ready

The paper trading system is fully functional and ready to validate the 80% accuracy ML model in production:

**✓ Database Schema**: Created (PaperPortfolio, PaperTrade, PortfolioSnapshot)
**✓ Trading Engine**: Implemented (evaluation, execution, closure)
**✓ API Endpoints**: Built (execute signal, portfolio summary)
**✓ Cron Job**: Configured (daily position closure at 3:00 AM)
**✓ Dashboard**: Created (live portfolio monitoring)
**✓ Portfolio**: Initialized ($100,000 starting capital)

### Key Features

- **Automatic Trading**: Executes based on ML predictions
- **Risk Management**: Kelly Criterion position sizing, 10% max position
- **7-Day Hold**: Matches model training window
- **Performance Tracking**: Compares predicted vs actual returns
- **Real-Time Dashboard**: Monitor portfolio 24/7
- **Daily Cron**: Auto-closes positions, updates metrics

### Next Steps

1. **Deploy to Vercel** (cron job will activate)
2. **Monitor First Trades** (wait for next SEC filing)
3. **Track Model Accuracy** (compare predictions to results)
4. **Optimize Strategy** (adjust confidence/sizing as needed)

**Expected Timeline**:
- First trade: Within 1-2 days (when next 10-K/10-Q filed)
- First close: 7 days after first trade
- Meaningful data: 30-60 days (15-30 trades)
- Statistical significance: 90+ days (40+ trades)

---

**Created**: October 17, 2025
**Status**: Production
**Portfolio ID**: `cmgu5ysgx0000boh27mxywid1`
**Dashboard**: `/paper-trading`
