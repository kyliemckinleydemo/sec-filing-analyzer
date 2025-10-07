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

def calc_return(ticker, filing_date, days=7):
    """Calculate return N days after filing"""
    try:
        dt = datetime.fromisoformat(filing_date)
        stock = yf.Ticker(ticker)
        hist = stock.history(start=dt, end=dt + timedelta(days=days+7))

        if len(hist) < 2:
            return None

        start_price = hist['Close'].iloc[0]
        end_idx = min(days, len(hist) - 1)
        end_price = hist['Close'].iloc[end_idx]

        return float(((end_price - start_price) / start_price) * 100)
    except:
        return None

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

    # Calculate returns for each
    for filing in filings:
        filing["actual7dReturn"] = calc_return(ticker, filing["filingDate"])
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
