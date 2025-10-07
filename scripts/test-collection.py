#!/usr/bin/env python3
"""Quick test of data collection for 3 tickers"""

import sys
import json
import requests
import time
from datetime import datetime, timedelta
import yfinance as yf

TICKERS = ['AAPL', 'MSFT', 'NVDA']
CIK_MAP = {
    "AAPL": "0000320193",
    "MSFT": "0000789019",
    "NVDA": "0001045810",
}

HEADERS = {"User-Agent": "SEC Filing Analyzer research@example.com"}

def fetch_filings(ticker, cik):
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    data = response.json()

    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    dates = recent.get("filingDate", [])

    filings = []
    for i in range(len(forms)):
        if forms[i] in ["10-Q", "10-K"]:
            filing_date = datetime.fromisoformat(dates[i])
            if filing_date >= datetime(2024, 1, 1):
                filings.append({
                    "ticker": ticker,
                    "filingType": forms[i],
                    "accessionNumber": accessions[i],
                    "filingDate": dates[i]
                })

    return filings[:3]  # Limit to 3

def calc_return(ticker, filing_date):
    try:
        dt = datetime.fromisoformat(filing_date)
        stock = yf.Ticker(ticker)
        hist = stock.history(start=dt, end=dt + timedelta(days=14))
        if len(hist) >= 2:
            return ((hist['Close'].iloc[min(7, len(hist)-1)] - hist['Close'].iloc[0]) / hist['Close'].iloc[0]) * 100
    except:
        pass
    return None

all_filings = []
for ticker in TICKERS:
    print(f"[{ticker}] Fetching...", file=sys.stderr)
    cik = CIK_MAP[ticker]
    filings = fetch_filings(ticker, cik)

    for filing in filings:
        filing["actual7dReturn"] = calc_return(ticker, filing["filingDate"])
        if filing["actual7dReturn"]:
            print(f"[{ticker}] {filing['filingType']} {filing['filingDate']}: {filing['actual7dReturn']:.2f}%", file=sys.stderr)

    all_filings.extend(filings)
    time.sleep(0.2)

print(json.dumps({"status": "success", "filings": all_filings}, indent=2))
