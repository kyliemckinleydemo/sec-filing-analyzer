# Options & Short Interest Analysis Framework

## Overview

Pre-filing options activity and short interest could be much more predictive than stock volume because:
- Options traders are typically more sophisticated
- Requires explicit directional conviction
- Can detect institutional positioning
- Less retail noise

---

## Key Metrics to Track (30 Days Before Filing)

### 1. Put/Call Ratio (P/C)

**What it measures:** Ratio of put volume to call volume

**Calculation:**
```
P/C Ratio = Put Volume / Call Volume
```

**Signals:**
- **High P/C (>1.0)**: Bearish sentiment, hedging activity
- **Low P/C (<0.7)**: Bullish sentiment, call buying
- **Rising P/C**: Increasing bearish sentiment
- **Falling P/C**: Increasing bullish sentiment

**Pre-filing indicator:**
- Compare 30-day pre-filing P/C to 90-day baseline
- P/C ratio change = (30d P/C / 90d P/C) - 1

**Expected:**
- Falling P/C before good earnings (call buying)
- Rising P/C before bad earnings (put buying or hedging)

---

### 2. Options Volume Spike

**What it measures:** Unusual options activity compared to baseline

**Calculation:**
```
Volume Spike Ratio = 30d Avg Options Volume / 90d Baseline Volume
```

**Signals:**
- **High volume (>2x)**: Major positioning happening
- **Very high (>3x)**: Potential information leakage
- **With call bias**: Bullish positioning
- **With put bias**: Bearish positioning or hedging

**Pre-filing indicator:**
- Options volume surge before filing = informed activity
- Combined with P/C ratio for direction

---

### 3. Implied Volatility (IV) Changes

**What it measures:** Market's expectation of future volatility

**Calculation:**
```
IV Percentile = Current IV rank vs 1-year range
IV Change = (30d Avg IV / 90d Baseline IV) - 1
```

**Signals:**
- **Rising IV**: Market expects big move
- **IV spike**: Anticipation of major news
- **With call buying**: Bullish big move expected
- **With put buying**: Bearish move or hedging

**Pre-filing indicator:**
- IV rising before filing = market senses something
- Doesn't predict direction, but magnitude

---

### 4. Open Interest (OI) Changes

**What it measures:** New positions being opened (not just traded)

**Calculation:**
```
Call OI Change = (Current Call OI - 30d Ago Call OI) / 30d Ago
Put OI Change = (Current Put OI - 30d Ago Put OI) / 30d Ago
OI Bias = Call OI Change - Put OI Change
```

**Signals:**
- **Rising Call OI**: Accumulation of bullish positions
- **Rising Put OI**: Accumulation of bearish positions or hedges
- **Both rising**: Straddle positioning (big move expected)

**Pre-filing indicator:**
- Building call OI = institutions positioning for upside
- Building put OI = hedging or bearish bet

---

### 5. Short Interest

**What it measures:** Percentage of float sold short

**Calculation:**
```
Short Interest % = Shares Shorted / Float
Days to Cover = Shares Shorted / Average Daily Volume
Short Interest Change = Current SI - 30 Days Ago SI
```

**Signals:**
- **High SI (>20%)**: Heavy short pressure, squeeze potential
- **Rising SI**: Increasing bearish bets
- **Falling SI**: Shorts covering (bullish)
- **High SI + Beat**: Potential short squeeze

**Pre-filing indicator:**
- Rising shorts before filing = bearish conviction
- Falling shorts = may know good news coming
- High SI at filing = squeeze potential if beats

**Most predictive:**
- **SI falling + beat** = massive upside (shorts covered early)
- **SI rising + miss** = everyone was right
- **High SI + beat** = short squeeze rally

---

### 6. Unusual Options Activity (UOA)

**What it measures:** Trades significantly larger than normal

**Criteria:**
```
Unusual if:
- Volume > 5x average daily volume
- Large single trades (>$100k premium)
- At-the-money or near-money strikes
- Near-term expiration
```

**Signals:**
- **Large call sweeps**: Bullish institutional bet
- **Large put purchases**: Bearish bet or hedge
- **Deep ITM calls**: Stock replacement (very bullish)
- **OTM call spreads**: Defined-risk bullish bet

**Pre-filing indicator:**
- UOA in 7-14 days before filing = potential information leakage
- Multiple UOA instances = high conviction

---

## Data Sources (Free & Paid)

### Free Sources

1. **Yahoo Finance** (via yfinance Python)
   - Basic options chain data
   - Volume, open interest
   - Limited historical data
   - No IV history

2. **CBOE (Chicago Board Options Exchange)**
   - Put/Call ratio data
   - VIX and volatility indices
   - Free delayed data
   - API available

3. **Finra Short Interest**
   - Short interest data (twice monthly)
   - Free but delayed 2 weeks
   - `http://finra-markets.morningstar.com/`

4. **SEC Form 4 Filings**
   - Insider buying/selling
   - Can detect insider options exercises
   - Free, real-time

### Paid Sources (Better Data)

1. **Unusual Whales** ($50-200/mo)
   - Real-time UOA detection
   - Historical options flow
   - Congress trading data
   - Dark pool activity

2. **FlowAlgo** ($200-500/mo)
   - Real-time options flow
   - Smart money detection
   - Multi-leg strategy detection

3. **CBOE Livevol** (Institutional)
   - Comprehensive IV data
   - Historical options data
   - Greeks and analytics

4. **Quandl/Nasdaq Data Link**
   - Historical options data
   - Short interest data
   - Some free datasets

---

## Implementation Strategy

### Phase 1: Test with Free Data (Recommended Start)

1. **Yahoo Finance Options Data**
   ```python
   import yfinance as yf

   ticker = yf.Ticker("AAPL")

   # Get options chain
   options = ticker.options  # Available expiration dates
   chain = ticker.option_chain('2025-01-17')

   # Call and put data
   calls = chain.calls
   puts = chain.puts

   # Calculate P/C ratio
   total_call_volume = calls['volume'].sum()
   total_put_volume = puts['volume'].sum()
   pc_ratio = total_put_volume / total_call_volume
   ```

2. **CBOE Put/Call Ratio**
   - Download historical P/C ratios
   - Compare individual stocks to market

3. **Finra Short Interest**
   - Scrape or API
   - Match to filing dates
   - Calculate SI changes

### Phase 2: Build Features

Extract these features for 30 days before each filing:

```python
FEATURES = [
    # Options volume
    'options_volume_30d_avg',
    'options_volume_spike_ratio',  # vs 90d baseline

    # Put/Call ratio
    'put_call_ratio_30d',
    'put_call_ratio_change',  # vs 90d baseline
    'put_call_ratio_trend',  # rising or falling

    # Open Interest
    'call_oi_change_30d',
    'put_oi_change_30d',
    'oi_bias',  # call OI change - put OI change

    # Short Interest
    'short_interest_pct',
    'short_interest_change_30d',
    'days_to_cover',

    # Unusual Activity
    'unusual_options_days',  # count of UOA days
    'max_unusual_volume_ratio',

    # Combined signals
    'falling_pc_ratio',  # bool: P/C falling (bullish)
    'high_short_interest',  # bool: SI > 15%
    'options_volume_surge',  # bool: volume > 2x baseline
]
```

### Phase 3: Model Integration

Test if options features improve the baseline model:

```python
BASELINE_FEATURES = [
    'epsSurprise',
    'surpriseMagnitude',
    'epsBeat',
    'epsMiss',
]

OPTIONS_FEATURES = [
    'put_call_ratio_change',
    'options_volume_spike_ratio',
    'short_interest_pct',
    'short_interest_change_30d',
    'falling_pc_ratio',
    'high_short_interest',
]

# Test: Baseline vs Baseline + Options
```

### Phase 4: Signal Combinations

Test high-conviction scenarios:

```python
SCENARIOS = {
    'short_squeeze': {
        'conditions': 'beat + high_short_interest + options_volume_surge',
        'expected_return': 'Very High (+50%+)',
        'thesis': 'Shorts forced to cover on good news'
    },

    'smart_money_calls': {
        'conditions': 'falling_pc_ratio + options_volume_surge + beat',
        'expected_return': 'High (+30%+)',
        'thesis': 'Call buying preceded good earnings'
    },

    'hedging_activity': {
        'conditions': 'rising_pc_ratio + miss',
        'expected_return': 'Negative (-20%)',
        'thesis': 'Institutions hedged before bad news'
    },

    'information_leakage': {
        'conditions': 'unusual_options_days > 3 + falling_pc_ratio',
        'expected_return': 'High (+40%+)',
        'thesis': 'Repeated UOA suggests insider knowledge'
    }
}
```

---

## Expected Results

### Most Predictive Combinations

Based on market research, these should be strongest signals:

1. **Short Squeeze Setup** (Very High Conviction)
   - High short interest (>20%)
   - Earnings beat
   - Options volume surge
   - Expected: +50% to +100% returns

2. **Smart Money Calls** (High Conviction)
   - P/C ratio falling 30d before filing
   - Options volume >2x baseline
   - Earnings beat
   - Expected: +30% to +50% returns

3. **Informed Put Buying** (Bearish)
   - P/C ratio rising sharply
   - Unusual put volume
   - Earnings miss
   - Expected: -20% to -40% returns

4. **Short Covering** (Bullish)
   - Short interest falling 30d before
   - Earnings beat
   - Expected: +40% returns (shorts knew early)

---

## Advantages Over Stock Volume

| Metric | Stock Volume | Options Data |
|--------|--------------|--------------|
| **Sophistication** | Retail + institutional | Mostly institutional |
| **Directional** | Ambiguous (buy or sell?) | Clear (calls = bullish) |
| **Conviction** | Low (easy to trade) | High (leverage + time decay) |
| **Leading** | Can lag news | Often precedes moves |
| **Noise** | High (HFT, arbitrage) | Lower (requires intent) |
| **Information leakage** | Hard to detect | Easier (UOA spikes) |

---

## Next Steps

1. **Start with free Yahoo Finance data**
   - Test if basic P/C ratio and options volume work
   - Low investment to validate concept

2. **Add Finra short interest**
   - Test short squeeze scenarios
   - Free data, just delayed 2 weeks

3. **If promising, upgrade to paid data**
   - Unusual Whales for UOA detection
   - Better historical data
   - Real-time signals

4. **Build and test features**
   - Extract for existing 4,792 filings
   - Train model: Baseline vs Baseline + Options
   - Measure improvement

5. **Deploy if successful**
   - Real-time monitoring of options flow
   - Alerts for suspicious activity
   - Integrate into prediction engine

---

## Expected Timeline

- **Week 1**: Fetch Yahoo Finance options data for sample
- **Week 2**: Build feature extraction pipeline
- **Week 3**: Train and evaluate models
- **Week 4**: If successful, upgrade to paid data
- **Month 2**: Production deployment with real-time monitoring

---

## Risk & Limitations

### Challenges

1. **Data availability**
   - Historical options data is expensive
   - Yahoo Finance has limited history
   - Short interest only twice monthly

2. **Data quality**
   - Options can be illiquid for small caps
   - P/C ratio can be noisy
   - Need sufficient options volume

3. **Overfitting risk**
   - Options data has many dimensions
   - Easy to find spurious correlations
   - Need large dataset to validate

4. **Market regime dependent**
   - Options patterns may change over time
   - Bull markets vs bear markets
   - Volatility regime shifts

### Mitigation

- Start with simple features (P/C ratio, SI%)
- Test on out-of-sample data
- Require minimum options volume for inclusion
- Monitor feature stability over time

---

## Conclusion

Options flow and short interest could be **significantly more predictive** than stock volume because:

✅ More sophisticated participants
✅ Clear directional signals
✅ Requires high conviction
✅ Less noise, more signal
✅ Can detect information leakage

**Recommendation:** Start with free Yahoo Finance data to test basic P/C ratio and short interest features. If promising, upgrade to paid sources for comprehensive coverage.

This could be the missing piece to improve model accuracy above the current 55-56% baseline.
