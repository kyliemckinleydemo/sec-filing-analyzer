# Yahoo Finance Data - Query Enhancement Opportunities

## Executive Summary

We're already collecting rich financial data from Yahoo Finance API, but we're only using a fraction of it in our query interface. This document outlines the available data and opportunities to create powerful new query capabilities.

## Currently Available Data

### From Yahoo Finance API (Already Collected)
We collect this data via `yahooFinanceClient.getCompanyFinancials()` and store it in the `Company` table:

#### Core Metrics (Stored in DB)
- **Market Cap** (`marketCap`) ✅ Used in queries
- **P/E Ratio** (`peRatio`) ✅ Used in queries
- **Forward P/E** (`forwardPE`) ✅ Available but not queried
- **Current Price** (`currentPrice`) ✅ Used in queries
- **52-Week High/Low** (`fiftyTwoWeekHigh`, `fiftyTwoWeekLow`) ✅ Available but not queried
- **Analyst Target Price** (`analystTargetPrice`) ✅ Available but not queried

#### Additional Data (In `yahooFinanceData` JSON field)
- **Dividend Yield** - Not directly queryable
- **Beta** (volatility vs market) - Not directly queryable
- **Volume** & **Average Volume** - Not directly queryable
- **Analyst Rating** (1-5 scale) - Not directly queryable
- **Number of Analyst Opinions** - Not directly queryable
- **EPS Actual** (TTM) - Not directly queryable
- **EPS Estimates** (Current Year, Forward) - Not directly queryable
- **Trailing Annual Dividend Rate** - Not directly queryable

### From CompanySnapshot (Historical Tracking)
We track changes over time via the daily cron job:
- All the above metrics captured as snapshots
- Can track analyst target price changes
- Can track P/E ratio trends
- Can track price movements

## 🎯 High-Value Query Opportunities

### 1. Dividend & Income Investing Queries
**Currently Missing, Easy to Add**

```
"Show companies with dividend yield > 3%"
"List dividend aristocrats" (companies that increased dividends)
"Find high-yield dividend stocks with P/E < 15"
"Show companies with dividend yield > 4% and market cap > 10B"
```

**Implementation**:
- Add `dividendYield` field to Company table
- Extract from `yahooFinanceData` JSON during backfill
- Add query pattern to match dividend queries

### 2. Volatility & Risk Queries
**Currently Missing, Easy to Add**

```
"Show low-beta stocks" (beta < 0.8)
"Find high-beta stocks for trading" (beta > 1.5)
"List stable blue chips" (beta < 0.9, market cap > 100B)
"Show volatile tech stocks" (beta > 1.3, sector = Technology)
```

**Implementation**:
- Add `beta` field to Company table
- Extract from `yahooFinanceData` JSON
- Add query patterns for volatility

### 3. Valuation & Value Investing Queries
**Partially Available, Can Enhance**

```
"Show undervalued stocks" (currentPrice < analystTargetPrice * 0.9)
"Find stocks trading near 52-week lows"
"Show companies at 52-week highs with strong momentum"
"List value stocks" (P/E < 15, dividend yield > 2%, market cap > 5B)
"Find growth at reasonable price" (P/E < 25, forward P/E < 20)
```

**Implementation**:
- Already have all needed data!
- Just need to add query patterns
- Add calculated fields (e.g., % from 52-week high/low)

### 4. Analyst Consensus Queries
**Data Available, Not Exposed**

```
"Show stocks with strong analyst buy ratings"
"Find companies where analysts are bullish" (avg rating < 2.0)
"List stocks with high analyst coverage" (>20 analysts)
"Show stocks with analyst upgrades" (target price increased)
```

**Implementation**:
- Add `analystRating` and `analystCount` fields
- Use CompanySnapshot to track rating changes over time

### 5. Trading Volume Queries
**Data Available, Not Exposed**

```
"Show stocks with unusual volume" (volume > 2x average)
"Find liquid large caps" (avg volume > 10M, market cap > 10B)
"List low-volume small caps"
```

**Implementation**:
- Add `volume` and `averageVolume` fields to Company table
- Add query patterns for volume-based screening

### 6. Multi-Factor Screening (Most Powerful!)
**Combine Multiple Criteria**

```
"Show value dividend stocks" (P/E < 15, dividend yield > 3%, market cap > 5B)
"Find quality growth stocks" (forward P/E < 25, beta < 1.2, analyst rating < 2.5)
"List safe income plays" (dividend yield > 4%, beta < 0.8, market cap > 10B)
"Show undervalued mega-caps" (market cap > 500B, P/E < 20, price < target * 0.95)
```

**Implementation**:
- Add multiple fields to Company table
- Create sophisticated query parser that handles AND/OR logic
- Most valuable for power users

## 📊 Recommended Implementation Priority

### Phase 1: Quick Wins (1-2 hours)
Add these fields to Company table (extract from existing JSON):
1. `dividendYield` Float?
2. `beta` Float?
3. `analystRating` Float?
4. `analystCount` Int?

Add 5-10 new query patterns for:
- Dividend screening
- Beta/volatility screening
- Analyst consensus
- Undervalued stocks (price vs target)
- 52-week high/low positioning

### Phase 2: Enhanced Queries (2-3 hours)
1. Add calculated fields (% from 52-week high/low)
2. Multi-factor screening (AND/OR logic)
3. Sector-specific queries
4. Historical trend queries (using CompanySnapshot)

### Phase 3: Advanced Features (3-5 hours)
1. Natural language query parsing with AI
2. Custom screener builder UI
3. Saved searches
4. Query result sorting/filtering
5. Export to CSV

## 💰 Value Proposition Enhancement

Current positioning:
> "Query real-time stock prices, P/E ratios, and analyst targets"

Enhanced positioning:
> "Advanced stock screening: dividend yields, valuation metrics, analyst consensus, volatility, and multi-factor analysis - Find value stocks, income plays, growth opportunities"

This positions us as a serious financial analysis tool, not just a filing viewer.

## 🔧 Technical Implementation

### Step 1: Update Schema
```prisma
model Company {
  // ... existing fields ...

  // Add these fields
  dividendYield       Float?
  beta                Float?
  analystRating       Float?  // 1-5 scale (1=Strong Buy, 5=Sell)
  analystCount        Int?
  volume              BigInt?
  averageVolume       BigInt?

  // Calculated fields (can be computed on-the-fly or stored)
  percentFrom52WeekHigh Float?
  percentFrom52WeekLow  Float?
  priceToTargetRatio    Float?
}
```

### Step 2: Backfill Script
Extract data from `yahooFinanceData` JSON and populate new fields for all 430+ companies.

### Step 3: Add Query Patterns
Add 10-15 new patterns to `/app/api/query/route.ts`

### Step 4: Update UI
Add new example queries showcasing these capabilities.

## 📈 Impact Metrics

**Current Query Capabilities**: 6 query types
**With Phase 1**: 15-20 query types (2.5-3x increase)
**With Phase 2**: 30+ query types (5x increase)

**User Value**:
- Replaces needs for: Yahoo Finance screener, Finviz, Stock Rover
- Unique advantage: Combines financial screening with SEC filing analysis
- Competitive moat: No other tool offers this combination

## Next Steps

1. Review this analysis
2. Prioritize which query types to add first
3. Run schema migration to add new fields
4. Create backfill script
5. Add query patterns
6. Update marketing/UI to showcase new capabilities

---

*Generated: 2025-10-22*
*Status: Analysis Complete - Ready for Implementation*
