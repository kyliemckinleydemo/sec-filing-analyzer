"""
@module collect-full-dataset
@description Collects comprehensive historical SEC filing dataset (10-Q/10-K) from 2022-2025 
             for 20 major tech and financial tickers with corresponding 7-day return calculations.

PURPOSE:
    - Gather 200+ SEC filings (10-Q and 10-K forms) from January 2022 to present
    - Fetch filing metadata (accession numbers, dates, types) from SEC EDGAR API
    - Calculate actual 7-day post-filing stock returns using Yahoo Finance
    - Generate training/validation dataset for ML-based return prediction models
    - Support backtesting and analysis of filing-based trading strategies

EXPORTS:
    - JSON output to stdout containing:
        * status: Collection status ("success" or error)
        * collected: Total number of filings retrieved
        * withReturns: Count of filings with valid return calculations
        * filings: Array of filing objects with structure:
            - ticker: Stock symbol
            - filingType: "10-Q" or "10-K"
            - accessionNumber: SEC accession identifier
            - filingDate: ISO format date (YYYY-MM-DD)
            - actual7dReturn: Percentage return 7 days post-filing (or null)

CLAUDE NOTES:
    - Implements batch return calculation for efficiency (single yfinance API call per ticker)
    - Respects SEC rate limits with 0.15s delays between ticker requests
    - Hardcoded CIK mapping for 20 major tickers (AAPL, MSFT, GOOGL, etc.)
    - Filters filings by date range (2022-01-01 onwards) and form type (10-Q/10-K only)
    - Returns may be null if insufficient price data available (recent filings, delisted stocks)
    - Progress information logged to stderr, final dataset to stdout for pipeline integration
    - User-Agent header required by SEC API compliance guidelines
"""

#!/usr/bin/env python3
"""
Collect full historical dataset: 200+ filings from 2022-2025
"""

import sys
import json
import requests
import time
from datetime import datetime, timedelta
import yfinance as yf

TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO",
    "JPM", "V", "WMT", "MA", "COST", "HD", "PG", "NFLX", "DIS", "PYPL", "INTC", "AMD"
]

CIK_MAP = {
    "AAPL": "0000320193", "MSFT": "0000789019", "GOOGL": "0001652044", "AMZN": "0001018724",
    "NVDA": "0001045810", "META": "0001326801", "TSLA": "0001318605", "AVGO": "0001730168",
    "JPM": "0000019617", "V": "0001403161", "WMT": "0000104169", "MA": "0001141391",
    "COST": "0000909832", "HD": "0000354950", "PG": "0000080424", "NFLX": "0001065280",
    "DIS": "0001744489", "PYPL": "0001633917", "INTC": "0000050863", "AMD": "0000002488"
}

HEADERS = {"User-Agent": "SEC Filing Analyzer research@example.com"}

def fetch_filings(ticker, cik, start_date="2022-01-01"):
    """Fetch all 10-Q and 10-K filings since start_date"""
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"

    try:
        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        data = response.json()

        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        accessions = recent.get("accessionNumber", [])
        dates = recent.get("filingDate", [])

        start_dt = datetime.fromisoformat(start_date)
        filings = []

        for i in range(len(forms)):
            if forms[i] not in ["10-Q", "10-K"]:
                continue

            filing_date = datetime.fromisoformat(dates[i])
            if filing_date < start_dt:
                continue

            filings.append({
                "ticker": ticker,
                "filingType": forms[i],
                "accessionNumber": accessions[i],
                "filingDate": dates[i]
            })

        return filings
    except Exception as e:
        print(f"[{ticker}] Error: {e}", file=sys.stderr)
        return []

def calc_returns_batch(ticker, filing_dates, days=7):
    """Calculate returns for multiple filing dates in batch"""
    if not filing_dates:
        return {}
    
    try:
        # Find the earliest and latest dates to fetch all data in one call
        dates = [datetime.fromisoformat(d) for d in filing_dates]
        min_date = min(dates)
        max_date = max(dates) + timedelta(days=days+7)
        
        stock = yf.Ticker(ticker)
        hist = stock.history(start=min_date, end=max_date)
        
        if hist.empty:
            return {}
        
        returns = {}
        for filing_date in filing_dates:
            dt = datetime.fromisoformat(filing_date)
            # Filter history for this specific filing window
            window = hist[hist.index >= dt]
            
            if len(window) < 2:
                returns[filing_date] = None
                continue
            
            start_price = window['Close'].iloc[0]
            end_idx = min(days, len(window) - 1)
            end_price = window['Close'].iloc[end_idx]
            
            returns[filing_date] = float(((end_price - start_price) / start_price) * 100)
        
        return returns
    except Exception as e:
        print(f"[{ticker}] Error calculating batch returns: {e}", file=sys.stderr)
        return {}

print("=" * 80, file=sys.stderr)
print("COLLECTING FULL HISTORICAL DATASET", file=sys.stderr)
print("=" * 80, file=sys.stderr)
print(f"Tickers: {len(TICKERS)}", file=sys.stderr)
print(f"Date range: 2022-01-01 to present", file=sys.stderr)
print(f"Filing types: 10-Q, 10-K", file=sys.stderr)
print("=" * 80, file=sys.stderr)

all_filings = []
for ticker in TICKERS:
    print(f"\n[{ticker}] Fetching filings...", file=sys.stderr)
    cik = CIK_MAP.get(ticker)

    if not cik:
        continue

    filings = fetch_filings(ticker, cik, "2022-01-01")
    print(f"[{ticker}] Found {len(filings)} filings", file=sys.stderr)

    # Calculate returns for all filings in batch
    filing_dates = [f["filingDate"] for f in filings]
    returns = calc_returns_batch(ticker, filing_dates)
    
    for filing in filings:
        filing["actual7dReturn"] = returns.get(filing["filingDate"])
        if filing["actual7dReturn"] is not None:
            print(f"  {filing['filingType']} {filing['filingDate']}: {filing['actual7dReturn']:+.2f}%", file=sys.stderr)

    all_filings.extend(filings)
    time.sleep(0.15)  # Rate limit

with_returns = [f for f in all_filings if f.get("actual7dReturn") is not None]

print("\n" + "=" * 80, file=sys.stderr)
print(f"COLLECTION COMPLETE", file=sys.stderr)
print(f"Total filings: {len(all_filings)}", file=sys.stderr)
print(f"With returns: {len(with_returns)}", file=sys.stderr)
print("=" * 80, file=sys.stderr)

print(json.dumps({"status": "success", "collected": len(all_filings), "withReturns": len(with_returns), "filings": all_filings}, indent=2))