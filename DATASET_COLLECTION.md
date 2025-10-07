# Historical Dataset Collection

## Overview

Building a robust dataset of 200+ historical earnings filings from 2022-2025 to properly train and validate the stock price prediction model.

## Current Status

**Previous State:**
- Data points: 2-3 filings (AAPL, TSLA only)
- Problem: Completely insufficient for model training/validation
- Cannot reliably tune weights or measure accuracy

**New Approach:**
- **Tickers**: 20 mega-cap companies
- **Date Range**: 2022-01-01 to 2025-10-06 (3+ years)
- **Filing Types**: 10-Q (quarterly), 10-K (annual)
- **Target**: 200-300 filings with complete data

## Companies in Dataset

1. **AAPL** - Apple Inc.
2. **MSFT** - Microsoft Corporation
3. **GOOGL** - Alphabet Inc.
4. **AMZN** - Amazon.com Inc.
5. **NVDA** - NVIDIA Corporation
6. **META** - Meta Platforms Inc.
7. **TSLA** - Tesla Inc.
8. **AVGO** - Broadcom Inc.
9. **JPM** - JPMorgan Chase & Co.
10. **V** - Visa Inc.
11. **WMT** - Walmart Inc.
12. **MA** - Mastercard Inc.
13. **COST** - Costco Wholesale Corp.
14. **HD** - The Home Depot Inc.
15. **PG** - Procter & Gamble Co.
16. **NFLX** - Netflix Inc.
17. **DIS** - The Walt Disney Company
18. **PYPL** - PayPal Holdings Inc.
19. **INTC** - Intel Corporation
20. **AMD** - Advanced Micro Devices Inc.

## Data Collection Process

### 1. SEC Filing Collection (`collect-full-dataset.py`)

- Queries SEC EDGAR API for each company (via CIK)
- Filters for 10-Q and 10-K filings since 2022-01-01
- Extracts accession numbers, filing dates, filing types
- **Output**: ~15 filings per company = ~300 total filings

### 2. Stock Return Calculation

For each filing:
- Fetches historical stock prices from Yahoo Finance
- Calculates 7-day return: `(price_7d_later - price_filing_day) / price_filing_day * 100`
- Handles weekends/holidays by using trading days
- **Output**: Actual 7-day returns for backtesting

### 3. Market Regime Classification

For each filing date:
- Fetches SPY momentum (30-day return)
- Classifies as bull (>5%), flat (-2% to 5%), or bear (<-2%)
- Calculates volatility for flight-to-quality detection
- **Output**: Market context for each filing

### 4. Macro Economic Indicators

For each filing date:
- DXY dollar index (30-day change)
- Dollar strength classification (weak/neutral/strong)
- GDP proxy (60-day SPY trend)
- **Output**: Macro context for predictions

## Expected Dataset Size

**Per Ticker**: ~15 filings (12 quarterly 10-Qs + 3 annual 10-Ks over 3 years)

**Total Dataset**: 20 tickers × 15 filings = **~300 filings**

**Market Conditions**:
- **Bull Market**: Q1 2023 - Q1 2024 (~80 filings)
- **Bear Market**: Q2 2022 - Q4 2022 (~60 filings)
- **Flat Market**: Q1 2022, 2024-2025 (~160 filings)

This ensures the model learns from diverse market environments.

## Data Quality

Each filing will have:

✅ **Accession Number** - Unique SEC identifier
✅ **Filing Type** - 10-Q or 10-K
✅ **Filing Date** - When filed with SEC
✅ **Ticker** - Stock symbol
✅ **Actual 7-Day Return** - Ground truth for backtesting
✅ **Market Regime** - Bull/flat/bear classification
✅ **Market Volatility** - For flight-to-quality detection
✅ **Dollar Strength** - Weak/neutral/strong
✅ **GDP Proxy** - Economic sentiment

## Next Steps

1. ✅ **Collect Filings** - Fetch 300+ filings from SEC EDGAR
2. ⏳ **Calculate Returns** - Get 7-day returns for each filing
3. ⏳ **Store in Database** - Save all filings with metadata
4. ⏳ **Analyze Filings** - Extract financial metrics (EPS, revenue, guidance)
5. ⏳ **Generate Predictions** - Run prediction engine on each filing
6. ⏳ **Comprehensive Backtest** - Test model across all 300 filings
7. ⏳ **Optimize Weights** - Tune model based on backtest results

## Files

- `scripts/collect-full-dataset.py` - Main collection script
- `scripts/test-collection.py` - Small test (3 tickers)
- `scripts/process-historical-batch.ts` - Process filings through analysis pipeline
- `/tmp/full-collection.log` - Collection progress log

## Usage

```bash
# Collect full dataset (takes ~5-10 minutes)
python3 scripts/collect-full-dataset.py > dataset.json 2>&1

# Process through analysis pipeline
cat dataset.json | npx ts-node scripts/process-historical-batch.ts

# Run backtest
curl http://localhost:3000/api/backtest?limit=300
```

## Expected Results

With 300 filings across 20 companies and 3+ years:

- **Statistical Significance**: Large enough for reliable model validation
- **Diverse Conditions**: Bull, bear, and flat markets represented
- **Multiple Sectors**: Tech, finance, retail, healthcare
- **Multiple Cap Sizes**: Mega caps ($1T+) to large caps ($200B+)
- **Ground Truth**: Actual returns for measuring accuracy

This will enable proper model optimization and weight tuning based on empirical results rather than guesswork.
