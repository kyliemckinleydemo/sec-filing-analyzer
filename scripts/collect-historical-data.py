"""
Automated Historical Data Collection Pipeline for SEC Filings

@module collect-historical-data
@description Fetches historical earnings filings (10-Q, 10-K) from SEC EDGAR API
             for multiple tickers over a 3-year period (2022-2025) and calculates
             corresponding stock returns. Creates a comprehensive dataset of 100-300
             filings for training and validating financial analysis models.

PURPOSE:
    - Automate collection of SEC filings from EDGAR database for top 20 mega-cap companies
    - Retrieve 10-Q (quarterly) and 10-K (annual) earnings reports since 2022
    - Calculate actual 7-day stock returns following each filing date using yfinance
    - Generate structured JSON output containing filing metadata and performance metrics
    - Build robust training dataset for machine learning models analyzing SEC filings
    - Support batch processing with rate limiting to comply with SEC API guidelines

EXPORTS:
    - get_company_cik(ticker: str) -> Optional[str]
        Retrieves CIK (Central Index Key) for a given stock ticker
    
    - fetch_company_filings(ticker: str, cik: str, start_date: str) -> List[Dict]
        Fetches all 10-Q and 10-K filings for a company since specified date
    
    - calculate_stock_returns_batch(filings: List[Dict], days: int) -> Dict[str, Dict[str, Optional[float]]]
        Calculates stock returns for multiple filings efficiently in batch mode
    
    - main()
        Main pipeline orchestrating data collection, return calculation, and JSON output

CLAUDE NOTES:
    - SEC EDGAR API requires User-Agent header with contact information
    - Rate limiting enforced (0.2s delay between requests) per SEC guidelines (max 10/sec)
    - CIK values are hardcoded for top 20 companies for reliability and performance
    - Batch processing of stock returns minimizes yfinance API calls (one per ticker)
    - Returns calculated from filing date (or next trading day) plus N trading days
    - Output includes both raw filings and filings with successfully calculated returns
    - Error handling implemented per-ticker to prevent single failures from blocking pipeline
    - Accession numbers require dash removal for constructing SEC document URLs
    - Historical data range dynamically calculated per ticker to optimize yfinance queries
"""

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

def calculate_stock_returns_batch(filings: List[Dict], days: int = 7) -> Dict[str, Dict[str, Optional[float]]]:
    """Calculate stock returns for multiple filings in batch by ticker"""
    returns_map = {}
    
    # Group filings by ticker
    filings_by_ticker = {}
    for filing in filings:
        ticker = filing["ticker"]
        if ticker not in filings_by_ticker:
            filings_by_ticker[ticker] = []
        filings_by_ticker[ticker].append(filing)
    
    # Fetch historical data once per ticker
    for ticker, ticker_filings in filings_by_ticker.items():
        try:
            # Find the date range needed for all filings of this ticker
            filing_dates = [datetime.fromisoformat(f["filingDate"]) for f in ticker_filings]
            min_date = min(filing_dates)
            max_date = max(filing_dates) + timedelta(days=days + 5)
            
            # Fetch all historical data for this ticker at once
            stock = yf.Ticker(ticker)
            hist = stock.history(start=min_date, end=max_date)
            
            if len(hist) < 2:
                continue
            
            # Calculate returns for each filing using the cached historical data
            for filing in ticker_filings:
                filing_date = filing["filingDate"]
                filing_dt = datetime.fromisoformat(filing_date)
                
                # Find the filing date or next trading day in historical data
                hist_after_filing = hist[hist.index >= filing_dt]
                
                if len(hist_after_filing) < 2:
                    continue
                
                start_price = hist_after_filing['Close'].iloc[0]
                
                # Get price N trading days later
                if len(hist_after_filing) >= days + 1:
                    end_price = hist_after_filing['Close'].iloc[days]
                else:
                    end_price = hist_after_filing['Close'].iloc[-1]
                
                return_pct = ((end_price - start_price) / start_price) * 100
                
                if ticker not in returns_map:
                    returns_map[ticker] = {}
                returns_map[ticker][filing_date] = float(return_pct)
                
        except Exception as e:
            print(f"[{ticker}] Error calculating returns: {e}", file=sys.stderr)
            continue
    
    return returns_map

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
        all_filings.extend(filings)

        # Rate limiting (SEC recommends max 10 requests/second)
        time.sleep(0.2)

    # Calculate returns for all filings in batch
    print("\n" + "=" * 80, file=sys.stderr)
    print("Calculating stock returns in batch...", file=sys.stderr)
    returns_map = calculate_stock_returns_batch(all_filings, days=7)

    # Attach returns to filings
    for filing in all_filings:
        ticker = filing["ticker"]
        filing_date = filing["filingDate"]
        filing["actual7dReturn"] = returns_map.get(ticker, {}).get(filing_date)
        
        if filing["actual7dReturn"] is not None:
            print(f"[{ticker}] {filing['filingType']} on {filing['filingDate']}: "
                  f"+{filing['actual7dReturn']:.2f}% after 7 days", file=sys.stderr)

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