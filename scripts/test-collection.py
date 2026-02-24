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

def calc_returns_batch(ticker, filing_dates):
    """Calculate returns for multiple filing dates in batch"""
    if not filing_dates:
        return {}
    
    try:
        dt_min = min(datetime.fromisoformat(d) for d in filing_dates)
        dt_max = max(datetime.fromisoformat(d) for d in filing_dates) + timedelta(days=14)
        
        stock = yf.Ticker(ticker)
        hist = stock.history(start=dt_min, end=dt_max)
        
        returns = {}
        for filing_date in filing_dates:
            dt = datetime.fromisoformat(filing_date)
            end_dt = dt + timedelta(days=14)
            
            filing_hist = hist[(hist.index >= dt) & (hist.index <= end_dt)]
            if len(filing_hist) >= 2:
                returns[filing_date] = ((filing_hist['Close'].iloc[min(7, len(filing_hist)-1)] - filing_hist['Close'].iloc[0]) / filing_hist['Close'].iloc[0]) * 100
            else:
                returns[filing_date] = None
        
        return returns
    except:
        return {date: None for date in filing_dates}

all_filings = []
for ticker in TICKERS:
    print(f"[{ticker}] Fetching...", file=sys.stderr)
    cik = CIK_MAP[ticker]
    filings = fetch_filings(ticker, cik)

    filing_dates = [filing["filingDate"] for filing in filings]
    returns = calc_returns_batch(ticker, filing_dates)
    
    for filing in filings:
        filing["actual7dReturn"] = returns.get(filing["filingDate"])
        if filing["actual7dReturn"]:
            print(f"[{ticker}] {filing['filingType']} {filing['filingDate']}: {filing['actual7dReturn']:.2f}%", file=sys.stderr)

    all_filings.extend(filings)
    time.sleep(0.2)

print(json.dumps({"status": "success", "filings": all_filings}, indent=2))