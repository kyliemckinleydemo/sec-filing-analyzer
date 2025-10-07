#!/usr/bin/env python3
"""
Fetch analyst consensus estimates and valuation data from Yahoo Finance
This is a free alternative to paid APIs like FMP
"""

import sys
import json
import yfinance as yf
from datetime import datetime, timedelta

def fetch_consensus(ticker: str, filing_date_str: str = None):
    """
    Fetch analyst consensus estimates for a ticker

    Args:
        ticker: Stock ticker symbol
        filing_date_str: Filing date in ISO format (YYYY-MM-DD) - used to find closest estimates
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info

        # Get earnings dates with estimates
        earnings_dates = stock.earnings_dates

        # Find the closest earnings date to filing date
        closest_eps_estimate = None
        closest_revenue_estimate = None

        if filing_date_str and earnings_dates is not None:
            filing_date = datetime.fromisoformat(filing_date_str)

            # Make filing_date timezone-aware if needed
            if filing_date.tzinfo is None:
                import pytz
                filing_date = pytz.UTC.localize(filing_date)

            # Look for estimates within 90 days of filing
            for date, row in earnings_dates.iterrows():
                # Convert date to timezone-aware if needed
                if date.tzinfo is None:
                    import pytz
                    date = pytz.UTC.localize(date)
                date_diff = abs((date - filing_date).days)
                if date_diff <= 90:
                    if 'EPS Estimate' in row and row['EPS Estimate']:
                        closest_eps_estimate = row['EPS Estimate']
                    if 'Revenue Estimate' in row and row['Revenue Estimate']:
                        closest_revenue_estimate = row['Revenue Estimate']
                    if closest_eps_estimate:
                        break

        result = {
            "ticker": ticker,
            "success": True,

            # Consensus Estimates
            "consensusEPS": closest_eps_estimate or info.get("forwardEps"),
            "consensusRevenue": closest_revenue_estimate,

            # Valuation Metrics
            "peRatio": info.get("trailingPE") or info.get("forwardPE"),
            "marketCap": info.get("marketCap"),  # in dollars
            "marketCapB": info.get("marketCap") / 1e9 if info.get("marketCap") else None,  # in billions

            # Additional Context
            "analystCount": info.get("numberOfAnalystOpinions"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),

            # Current Price
            "currentPrice": info.get("currentPrice") or info.get("regularMarketPrice"),
        }

        return result

    except Exception as e:
        return {
            "ticker": ticker,
            "error": str(e),
            "success": False
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: fetch-consensus.py TICKER [FILING_DATE]"}))
        sys.exit(1)

    ticker = sys.argv[1].upper()
    filing_date = sys.argv[2] if len(sys.argv) > 2 else None
    result = fetch_consensus(ticker, filing_date)
    print(json.dumps(result, indent=2, default=str))
