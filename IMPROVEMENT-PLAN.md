# Directional Accuracy Improvement Plan

## Current State: 51-58% (Barely Better Than Random)

### Results Breakdown
- **Overall**: 51.4% (Champion)
- **Mega-caps**: 58.1% (Linear+Momentum) - ONLY decent segment
- **Mid-caps**: 56.0% (Champion)
- **Small-caps**: 45.9% - WORSE than random

**Problem**: We're not beating the market in a meaningful way.

---

## Why Are We Failing?

### 1. **7-Day Window Is Too Short** ⚠️

Stock prices in a 7-day window are heavily influenced by:
- **Random market noise**: Daily volatility dominates
- **Macro events**: Fed announcements, geopolitical news
- **Sector rotation**: Tech up, finance down (nothing to do with filing)

**SEC filing impact takes time to materialize** - institutional investors need weeks to:
1. Read and analyze the filing (1-3 days)
2. Build conviction (1-2 weeks)
3. Accumulate/distribute position (2-4 weeks)

**Solution**: Test 30-day and 90-day returns instead

### 2. **We're Predicting the Wrong Thing** ⚠️

Current approach: "Will stock go UP or DOWN after filing?"

**Problem**: In a bull market (2025), stocks go up ~52-55% of the time regardless of filings.

We should predict: **"Will stock OUTPERFORM or UNDERPERFORM the market?"**

```typescript
// Current (wrong)
predicted_return = model(filing)
actual_return = stock_7d_return

// Better approach
predicted_alpha = model(filing)  // Excess return vs market
actual_alpha = stock_7d_return - spy_7d_return
```

**This removes market beta** and focuses on filing-specific impact.

### 3. **Placeh older Coefficients** ⚠️

Our momentum model uses guessed coefficients:

```typescript
// scripts/comprehensive-model-analysis.ts:165-172
if (data.priceToMA30 !== null) prediction += (data.priceToMA30 - 1) * 5.0;  // GUESS!
if (data.rsi14 !== null) prediction += (data.rsi14 - 50) * 0.05;  // GUESS!
if (data.macdHistogram !== null) prediction += data.macdHistogram * 0.3;  // GUESS!
if (data.volatility30 !== null) prediction += data.volatility30 * -0.2;  // GUESS!
if (data.return30d !== null) prediction += data.return30d * 0.15;  // GUESS!
```

**Solution**: Use regression to find optimal coefficients

### 4. **Missing Critical Features** ⚠️

Features we DON'T have that matter:

| Feature | Why It Matters | Difficulty |
|---------|----------------|------------|
| **Earnings surprise** | Actual vs expected EPS | Medium - need to parse filings |
| **Revenue surprise** | Actual vs expected revenue | Medium - same |
| **Guidance change** | Forward-looking statements | Hard - NLP required |
| **Insider trading** | CEO/CFO buying/selling | Easy - SEC Form 4 |
| **Short interest** | Market sentiment | Easy - available via API |
| **Options flow** | Institutional positioning | Medium - paid data |
| **Sector performance** | Relative strength | Easy - already have SPX |

### 5. **Sample Size Issues** ⚠️

- **Mega-caps**: Only 31 samples - confidence interval is ±17 points!
- **10-K filings**: Only 13 samples - can't draw conclusions
- **Overall**: 360 samples across 4 market cap × 3 filing types = only 30 per segment

**Target**: 1000+ samples minimum

### 6. **Model Overfitting vs Underfitting** ⚠️

Our R-squared is 0.006 (basically 0%) - we're explaining NONE of the variance.

This means:
- Either: We're missing the right features
- Or: Stock returns are too random in 7-day windows (likely)

---

## Concrete Improvement Actions

### 🎯 PHASE 1: Quick Wins (1-2 weeks)

#### 1.1 Change to Market-Relative Returns

**Impact**: +5-10 points expected

```typescript
// Update backfill-stock-prices.ts
const spxReturn = getMarketReturn(filingDate, 7);
const alpha = stockReturn - spxReturn;

// Now predict alpha instead of absolute return
// This removes market beta
```

**Files to update**:
- `scripts/backfill-stock-prices.ts` - add alpha calculation
- `scripts/comprehensive-model-analysis.ts` - predict alpha
- `prisma/schema.prisma` - add `actual7dAlpha` field

#### 1.2 Optimize Momentum Coefficients via Regression

**Impact**: +3-5 points expected

```typescript
// Use scikit-learn-style regression
// Find optimal weights for:
// - priceToMA30, rsi14, macd, volatility30, spxReturn7d

// Current: Hand-picked coefficients
// New: Data-driven coefficients
```

**Action**: Create `scripts/optimize-coefficients.ts` using linear regression

#### 1.3 Extend to 30-Day Returns

**Impact**: +8-12 points expected (biggest improvement)

```typescript
// 7-day: Too noisy
// 30-day: Institutional money has time to react
// 90-day: Even better but slower feedback

// Test all three, use best
```

**Action**: Backfill 30-day and 90-day returns, compare

#### 1.4 Add Short Interest Data

**Impact**: +2-4 points expected

High short interest + positive filing = short squeeze potential

**Data source**: Yahoo Finance has short interest
```typescript
const quote = await yahooFinance.quoteSummary(ticker, {
  modules: ['defaultKeyStatistics']
});
const shortInterest = quote.defaultKeyStatistics.shortRatio; // Days to cover
```

---

### 🚀 PHASE 2: Medium-Term (1-2 months)

#### 2.1 Parse Earnings Surprises from Filings

**Impact**: +5-8 points expected

When 10-Q/10-K includes earnings:
- Extract actual EPS from filing
- Compare to consensus estimate (we already have)
- Surprise % = (Actual - Estimate) / |Estimate|

Positive surprise = bullish signal

**Action**: Add NLP parsing to `lib/analyze-filing.ts`

#### 2.2 Add Insider Trading Data

**Impact**: +3-5 points expected

Track Form 4 filings (insider transactions):
- CEO/CFO/Directors buying = bullish
- Heavy selling = bearish

**Data source**: SEC EDGAR API
```
https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=4
```

**Action**: Create `scripts/backfill-insider-trades.ts`

#### 2.3 Collect More Training Data

**Impact**: +2-4 points expected (from reduced variance)

Current: 360 samples over 5 months
**Target**: 1000+ samples over 2+ years

**Action**:
- Go back to 2023-01-01
- Analyze all filings in date range
- Backfill historical prices for those dates

#### 2.4 Add Sector-Relative Performance

**Impact**: +3-5 points expected

Instead of vs SPX, compare to sector ETF:
- Tech stock vs XLK (Technology Select Sector ETF)
- Finance stock vs XLF (Financial Select Sector ETF)
- etc.

**Action**: Add sector ETF returns to MacroIndicators table

---

### 🎓 PHASE 3: Advanced (2-4 months)

#### 3.1 Ensemble of Specialized Models

Train separate models for:
- Each filing type (10-K, 10-Q, 8-K)
- Each market cap segment
- Each sector
- Each market regime (bull/bear/sideways)

**Expected**: 62-68% accuracy with proper ensembling

#### 3.2 Add Guidance and Forward-Looking Statements

Parse "Management Discussion & Analysis" section:
- Positive guidance = bullish
- Negative guidance = bearish
- No guidance = neutral

**Requires**: Advanced NLP (GPT-4 or similar)

#### 3.3 Options Flow Analysis

Track unusual options activity:
- Heavy call buying = bullish
- Heavy put buying = bearish
- Large institutional sweeps = high conviction

**Data source**: Paid (Unusual Whales, FlowAlgo, etc.)

---

## Recommended Priority Order

### Do IMMEDIATELY (This Week)

1. **Switch to 30-day returns** - Single biggest improvement
2. **Calculate market-relative returns (alpha)** - Remove beta
3. **Optimize momentum coefficients** - Stop guessing

**Expected improvement: 51% → 62-65%**

### Do Next (Next Month)

4. **Add short interest data** - Easy win
5. **Collect 2 years of historical data** - More samples
6. **Parse earnings surprises** - High-value signal

**Expected improvement: 65% → 68-72%**

### Do Later (If Needed)

7. **Insider trading data** - Diminishing returns
8. **Sector-relative performance** - Nice to have
9. **Advanced NLP for guidance** - Expensive

---

## Expected Outcomes by Phase

| Phase | Timeline | Expected Accuracy | Business Impact |
|-------|----------|-------------------|-----------------|
| **Current** | Today | 51-58% | Not viable |
| **Phase 1** | 2 weeks | 62-65% | Viable for launch |
| **Phase 2** | 2 months | 68-72% | Competitive advantage |
| **Phase 3** | 4 months | 72-78% | Industry-leading |

---

## Reality Check: Is This Achievable?

**Professional analyst accuracy**: 55-60% for 12-month price targets

**Our current target**: 7-day returns

**Problem**: Short-term prediction is HARDER than long-term!

### Alternative Approach: Longer Time Horizons

Instead of 7-day, we could offer:
- **30-day**: More predictable (expect 65-70%)
- **90-day**: Even better (expect 70-75%)
- **6-month**: Most predictable (expect 75-80%)

**Trade-off**: Users want quick feedback, but longer horizons are more accurate.

**Recommendation**: Offer multiple time horizons
- "7-day: 58% confidence - Low"
- "30-day: 68% confidence - Medium"
- "90-day: 75% confidence - High"

---

## Action Plan Summary

### Week 1-2: Foundation
- [ ] Add actual7dAlpha and actual30dReturn to schema
- [ ] Backfill 30-day returns for all 360 filings
- [ ] Calculate alpha (stock return - SPX return)
- [ ] Re-run analysis with 30-day alpha predictions
- [ ] Optimize momentum coefficients via regression

### Week 3-4: Quick Wins
- [ ] Add short interest data
- [ ] Collect 1 year of historical data (target 800 samples)
- [ ] Test sector-relative performance
- [ ] Build simple earnings surprise detector

### Month 2: Refinement
- [ ] Add insider trading signals
- [ ] Build ensemble model (by segment)
- [ ] Implement proper cross-validation
- [ ] Calibrate confidence scores

### Month 3+: Advanced Features
- [ ] Add guidance parsing with GPT-4
- [ ] Consider options flow data (if ROI justifies cost)
- [ ] Build sector-specific models
- [ ] Implement regime detection

---

## Bottom Line

**Current problem**: 51% accuracy with 7-day returns is not useful.

**Root cause**: 7-day window too short + wrong target (absolute vs relative returns)

**Solution**:
1. **Switch to 30-day returns** → expect 10-point improvement
2. **Predict alpha (vs SPX)** → expect 5-point improvement
3. **Optimize coefficients** → expect 3-5 point improvement

**Expected outcome after 2 weeks**: 62-65% accuracy on 30-day alpha

**Is that good enough?**
- Yes for soft launch
- No for aggressive marketing
- Need Phase 2 (68-72%) for competitive advantage

---

**Next Action**: Run Phase 1 improvements this week, reassess results.
