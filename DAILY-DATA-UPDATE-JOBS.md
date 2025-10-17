# Daily Data Update Jobs

## Overview

The production system runs **2 automated cron jobs** every day to keep data fresh for the ML model:

1. **Daily Filings & Fundamentals** (2:00 AM ET)
2. **Analyst Data Update** (2:30 AM ET)

Both jobs run automatically via Vercel Cron and ensure the 80% accuracy ML model has all required features.

---

## Job 1: Daily Filings & Fundamentals
**Endpoint**: `/api/cron/daily-filings-rss`
**Schedule**: `0 2 * * *` (2:00 AM ET daily)
**Duration**: ~30-60 seconds
**Status**: ✅ Already implemented

### What It Does

1. **Fetches new SEC filings** via RSS feed
   - Gets all 10-K, 10-Q, 8-K filings from past 24 hours
   - Catch-up mode for missed days (uses daily index files)
   - Stores in database

2. **Updates company fundamentals** from Yahoo Finance
   - Market capitalization
   - Current stock price
   - P/E ratio (current and forward)
   - 52-week high/low
   - Analyst target price
   - Earnings date
   - Beta, volume, dividend yield

3. **Creates historical snapshots**
   - Stores daily snapshot in CompanySnapshot table
   - Tracks changes over time
   - Used for historical analysis

### Data Captured for ML Model
- ✅ `marketCap` - Used by model (6th most important feature)
- ✅ `currentPrice` - Used by model
- ✅ `peRatio` - Used by model (5th most important feature)
- ✅ `forwardPE` - Used by model (8th most important feature)
- ✅ `fiftyTwoWeekHigh` - Used by model
- ✅ `fiftyTwoWeekLow` - Used by model
- ✅ `priceToHigh` - Calculated feature (3rd most important)
- ✅ `priceToLow` - Calculated feature (2nd most important)

---

## Job 2: Analyst Data Update
**Endpoint**: `/api/cron/update-analyst-data`
**Schedule**: `30 2 * * *` (2:30 AM ET daily)
**Duration**: ~60-90 seconds
**Status**: ✅ **Just added** (Oct 17, 2025)

### What It Does

1. **Finds recent filings** from past 7 days
   - Only 10-K and 10-Q filings
   - Filings that need analyst data

2. **Fetches analyst consensus** from Yahoo Finance
   - Number of analysts covering the stock
   - Consensus rating (Strong Buy to Strong Sell)
   - Target price (mean, high, low)
   - Upside potential (% to target price)

3. **Tracks analyst activity** in 30 days before filing
   - Upgrades and downgrades
   - Major firm activity (Goldman, JPM, Morgan Stanley, etc.)
   - Net sentiment (upgrades minus downgrades)

4. **Updates analysisData** JSON field
   - Merges with existing Claude AI analysis
   - Preserves all other data
   - Ready for ML model

### Data Captured for ML Model
- ✅ `upgradesLast30d` - Number of upgrades
- ✅ `downgradesLast30d` - Number of downgrades
- ✅ `netUpgrades` - **#1 most important feature!**
- ✅ `majorUpgrades` - From top-tier firms
- ✅ `majorDowngrades` - From top-tier firms (7th most important)
- ✅ `analystConsensusScore` - Overall rating (0-100 scale)
- ✅ `analystUpsidePotential` - % upside to target (9th most important)
- ✅ `analystCoverage` - Number of analysts

---

## Complete Feature Coverage

### ✅ Features Captured Daily

| Feature | Source | Job | Importance Rank |
|---------|--------|-----|----------------|
| netUpgrades | Yahoo Finance | Analyst Data | **#1** |
| priceToLow | Calculated | Filings & Fundamentals | **#2** |
| priceToHigh | Calculated | Filings & Fundamentals | **#3** |
| riskScore | Claude AI | (Manual analysis) | **#4** |
| peRatio | Yahoo Finance | Filings & Fundamentals | **#5** |
| marketCap | Yahoo Finance | Filings & Fundamentals | **#6** |
| downgradesLast30d | Yahoo Finance | Analyst Data | **#7** |
| forwardPE | Yahoo Finance | Filings & Fundamentals | **#8** |
| analystUpsidePotential | Yahoo Finance | Analyst Data | **#9** |
| analystConsensusScore | Yahoo Finance | Analyst Data | **#10** |

**9 out of top 10 features are automatically updated daily!**

Only `riskScore` (from Claude AI filing analysis) requires manual processing.

### ❌ Features NOT Yet Automated

These features have low coverage (<40%) and are not critical:

- **Technical indicators** (MA30, MA50, RSI, MACD)
  - Could be added via daily job
  - Current coverage: 33%
  - Would require fetching historical prices daily

- **Macro indicators** (S&P 500 returns, VIX)
  - Could be added via daily job
  - Current coverage: 38%
  - Single API call could update for all filings

---

## Job Scheduling

```
2:00 AM ET - Job 1: Daily Filings & Fundamentals
              └─ Fetches new SEC filings
              └─ Updates company fundamentals
              └─ Creates historical snapshots

2:30 AM ET - Job 2: Analyst Data Update
              └─ Updates analyst data for filings from past 7 days
              └─ Ensures new filings have ML features
```

**Why 30-minute gap?**
- Job 1 creates the filings that Job 2 updates
- Prevents race conditions
- Ensures Job 1 completes before Job 2 starts

---

## Monitoring

### Check Job Status

```bash
# View recent cron runs
curl https://your-domain.vercel.app/api/cron/daily-filings-rss

# View analyst data updates
curl https://your-domain.vercel.app/api/cron/update-analyst-data
```

### Expected Results

**Job 1 (Daily Filings)**:
```json
{
  "success": true,
  "message": "Fetched 150 filings, stored 150 (daily mode), updated 45 companies with Yahoo Finance data",
  "results": {
    "fetched": 150,
    "stored": 150,
    "companiesProcessed": 45,
    "yahooFinanceUpdates": 45,
    "yahooFinanceErrors": 0
  }
}
```

**Job 2 (Analyst Data)**:
```json
{
  "success": true,
  "message": "Updated analyst data for 42 filings",
  "results": {
    "updated": 42,
    "errors": 0,
    "total": 42
  }
}
```

---

## Rate Limits

Both jobs are designed to stay well within API limits:

- **Yahoo Finance**: 2,000 requests/hour, 48,000/day
  - Job 1: ~50 requests (companies with new filings)
  - Job 2: ~100 requests (recent filings × 2 modules each)
  - Total: ~150 requests/day = **0.3% of limit**

- **SEC EDGAR**: No official limit, be respectful
  - Job 1: 1-3 requests (RSS feed + optional catch-up)
  - Well within acceptable use

---

## What Happens if Jobs Fail?

### Job 1 Failure
- **Catch-up mode activates** on next run
- Fetches all missed days using SEC daily index files
- No data loss - system self-heals

### Job 2 Failure
- **Next run processes past 7 days** (not just 1 day)
- Ensures all recent filings get analyst data
- Idempotent - safe to re-run

---

## Future Enhancements (Optional)

### 1. Add Technical Indicators
**Benefit**: May improve accuracy by 2-3 percentage points
**Implementation**:
- Fetch historical prices daily (30-day window)
- Calculate MA30, MA50, RSI, MACD
- Store in TechnicalIndicators table

### 2. Add Macro Indicators
**Benefit**: Provides market context
**Implementation**:
- Fetch S&P 500 returns (7d, 30d)
- Fetch VIX (volatility index)
- Store in MacroIndicators table
- Single update applies to all filings

### 3. Real-Time Updates
**Benefit**: Faster data for intraday filings
**Implementation**:
- Run Job 1 every 4 hours (6× daily)
- Run Job 2 30 minutes after each Job 1
- Requires Vercel Pro plan (more cron jobs)

---

## Summary

✅ **Job 1** (2:00 AM) - Fetches filings and fundamentals
✅ **Job 2** (2:30 AM) - Updates analyst data
✅ **9 out of 10 top features** automatically updated daily
✅ **80% model accuracy** maintained with fresh data
✅ **Self-healing** catch-up mode for missed runs
✅ **Well within API limits** (0.3% of Yahoo Finance daily limit)

**Status**: Production ready. All critical ML features are automatically updated every 24 hours.
