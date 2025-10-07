#!/usr/bin/env python3
"""
Automated Historical Data Collection Pipeline

Fetches earnings filings (10-Q, 10-K) from SEC EDGAR for multiple tickers
over 3 years (2022-2025), then processes them through the analysis pipeline.

This creates a robust dataset of 100-300 filings for model training.
"""

import sys
import json
import requests
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import yfinance as yf

# Top 20 mega-cap companies for comprehensive testing
TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO",
    "JPM", "V", "WMT", "MA", "COST", "HD", "PG", "NFLX", "DIS", "PYPL", "INTC", "AMD"
]

# SEC EDGAR API base URL
SEC_BASE_URL = "https://data.sec.gov"
SEC_SUBMISSIONS_URL = f"{SEC_BASE_URL}/submissions"

# User agent required by SEC
HEADERS = {
    "User-Agent": "SEC Filing Analyzer research@example.com"
}

def get_company_cik(ticker: str) -> Optional[str]:
    """Get CIK (Central Index Key) for a ticker"""

    # Hardcoded CIKs for top 20 companies (faster and more reliable)
    CIK_MAP = {
        "AAPL": "0000320193",
        "MSFT": "0000789019",
        "GOOGL": "0001652044",
        "AMZN": "0001018724",
        "NVDA": "0001045810",
        "META": "0001326801",
        "TSLA": "0001318605",
        "AVGO": "0001730168",
        "JPM": "0000019617",
        "V": "0001403161",
        "WMT": "0000104169",
        "MA": "0001141391",
        "COST": "0000909832",
        "HD": "0000354950",
        "PG": "0000080424",
        "NFLX": "0001065280",
        "DIS": "0001744489",
        "PYPL": "0001633917",
        "INTC": "0000050863",
        "AMD": "0000002488",
    }

    return CIK_MAP.get(ticker.upper())

def fetch_company_filings(ticker: str, cik: str, start_date: str = "2022-01-01") -> List[Dict]:
    """Fetch earnings filings (10-Q, 10-K) for a company"""
    try:
        print(f"[{ticker}] Fetching filings from SEC EDGAR...", file=sys.stderr)

        # Get company submissions
        response = requests.get(
            f"{SEC_SUBMISSIONS_URL}/CIK{cik}.json",
            headers=HEADERS
        )
        response.raise_for_status()

        data = response.json()
        recent_filings = data.get("filings", {}).get("recent", {})

        # Extract 10-Q and 10-K filings
        filings = []
        forms = recent_filings.get("form", [])
        accession_numbers = recent_filings.get("accessionNumber", [])
        filing_dates = recent_filings.get("filingDate", [])
        primary_documents = recent_filings.get("primaryDocument", [])

        start_dt = datetime.fromisoformat(start_date)

        for i in range(len(forms)):
            form = forms[i]
            if form not in ["10-Q", "10-K"]:
                continue

            filing_date = datetime.fromisoformat(filing_dates[i])
            if filing_date < start_dt:
                continue

            # SEC accession numbers have dashes, need to remove for URL
            accession = accession_numbers[i].replace("-", "")
            primary_doc = primary_documents[i]

            filings.append({
                "ticker": ticker,
                "filingType": form,
                "accessionNumber": accession_numbers[i],
                "filingDate": filing_dates[i],
                "url": f"https://www.sec.gov/cgi-bin/viewer?action=view&cik={cik}&accession_number={accession_numbers[i]}&xbrl_type=v",
                "primaryDocument": primary_doc
            })

        print(f"[{ticker}] Found {len(filings)} filings since {start_date}", file=sys.stderr)
        return filings

    except Exception as e:
        print(f"[{ticker}] Error fetching filings: {e}", file=sys.stderr)
        return []

def calculate_stock_return(ticker: str, filing_date: str, days: int = 7) -> Optional[float]:
    """Calculate stock return N days after filing"""
    try:
        filing_dt = datetime.fromisoformat(filing_date)
        start_date = filing_dt
        end_date = filing_dt + timedelta(days=days + 5)  # Buffer for weekends

        stock = yf.Ticker(ticker)
        hist = stock.history(start=start_date, end=end_date)

        if len(hist) < 2:
            return None

        # Get price on filing date (or next trading day)
        start_price = hist['Close'].iloc[0]

        # Get price N trading days later
        if len(hist) >= days + 1:
            end_price = hist['Close'].iloc[days]
        else:
            end_price = hist['Close'].iloc[-1]

        return_pct = ((end_price - start_price) / start_price) * 100
        return float(return_pct)

    except Exception as e:
        print(f"[{ticker}] Error calculating return: {e}", file=sys.stderr)
        return None

def main():
    """Main data collection pipeline"""

    print("=" * 80, file=sys.stderr)
    print("AUTOMATED HISTORICAL DATA COLLECTION", file=sys.stderr)
    print("=" * 80, file=sys.stderr)
    print(f"Tickers: {len(TICKERS)}", file=sys.stderr)
    print(f"Date range: 2022-01-01 to present", file=sys.stderr)
    print(f"Filing types: 10-Q, 10-K (earnings filings)", file=sys.stderr)
    print("=" * 80, file=sys.stderr)

    all_filings = []

    for ticker in TICKERS:
        print(f"\n[{ticker}] Starting collection...", file=sys.stderr)

        # Get CIK
        cik = get_company_cik(ticker)
        if not cik:
            print(f"[{ticker}] Could not find CIK, skipping", file=sys.stderr)
            continue

        print(f"[{ticker}] CIK: {cik}", file=sys.stderr)

        # Fetch filings
        filings = fetch_company_filings(ticker, cik, "2022-01-01")

        # Calculate returns for each filing
        for filing in filings:
            filing["actual7dReturn"] = calculate_stock_return(
                ticker,
                filing["filingDate"],
                days=7
            )

            if filing["actual7dReturn"] is not None:
                print(f"[{ticker}] {filing['filingType']} on {filing['filingDate']}: "
                      f"+{filing['actual7dReturn']:.2f}% after 7 days", file=sys.stderr)

        all_filings.extend(filings)

        # Rate limiting (SEC recommends max 10 requests/second)
        time.sleep(0.2)

    print("\n" + "=" * 80, file=sys.stderr)
    print(f"COLLECTION COMPLETE", file=sys.stderr)
    print(f"Total filings collected: {len(all_filings)}", file=sys.stderr)

    filings_with_returns = [f for f in all_filings if f.get("actual7dReturn") is not None]
    print(f"Filings with calculated returns: {len(filings_with_returns)}", file=sys.stderr)
    print("=" * 80, file=sys.stderr)

    # Output as JSON
    result = {
        "status": "success",
        "collected": len(all_filings),
        "withReturns": len(filings_with_returns),
        "filings": all_filings
    }

    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
