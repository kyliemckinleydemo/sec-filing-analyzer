#!/usr/bin/env python3
"""
Fetch earnings history (with surprises) from Yahoo Finance
Usage: python fetch-earnings-yfinance.py TICKER
Output: JSON with earnings data
"""

import sys
import json
import yfinance as yf
import pandas as pd
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

def fetch_earnings(ticker):
    """Fetch earnings history with actual vs estimated EPS."""
    try:
        ticker_obj = yf.Ticker(ticker)
        earnings = ticker_obj.earnings_history

        if earnings is None or earnings.empty:
            return {
                "ticker": ticker,
                "success": False,
                "error": "No earnings data available",
                "data": []
            }

        # Convert to records
        records = []
        for idx, row in earnings.iterrows():
            # Convert timestamp to ISO string
            if isinstance(idx, pd.Timestamp):
                date_str = idx.isoformat()
            else:
                date_str = str(idx)

            record = {
                "date": date_str,
                "epsEstimate": float(row.get('epsEstimate', 0)) if pd.notna(row.get('epsEstimate')) else None,
                "epsActual": float(row.get('epsActual', 0)) if pd.notna(row.get('epsActual')) else None,
                "epsSurprise": float(row.get('surprisePercent', 0)) if pd.notna(row.get('surprisePercent')) else None,
                "revenueEstimate": float(row.get('revenueEstimate', 0)) if pd.notna(row.get('revenueEstimate')) else None,
                "revenueActual": float(row.get('revenueActual', 0)) if pd.notna(row.get('revenueActual')) else None,
            }

            # Calculate revenue surprise if we have both values
            if record["revenueActual"] and record["revenueEstimate"] and record["revenueEstimate"] != 0:
                record["revenueSurprise"] = ((record["revenueActual"] - record["revenueEstimate"]) / abs(record["revenueEstimate"])) * 100
            else:
                record["revenueSurprise"] = None

            records.append(record)

        return {
            "ticker": ticker,
            "success": True,
            "count": len(records),
            "data": records
        }

    except Exception as e:
        return {
            "ticker": ticker,
            "success": False,
            "error": str(e),
            "data": []
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: python fetch-earnings-yfinance.py TICKER"
        }))
        sys.exit(1)

    ticker = sys.argv[1].upper()
    result = fetch_earnings(ticker)
    print(json.dumps(result, indent=2))
