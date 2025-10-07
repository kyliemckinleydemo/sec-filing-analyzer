#!/usr/bin/env python3
"""
Fetch market momentum (SPY 30-day return) and regime classification prior to a filing date
"""

import sys
import json
import yfinance as yf
import numpy as np
from datetime import datetime, timedelta

def fetch_market_momentum(filing_date_str: str):
    """
    Fetch SPY 30-day return, volatility, and market regime classification

    Args:
        filing_date_str: Filing date in ISO format (YYYY-MM-DD)

    Returns market regime:
    - bull: SPY up >5% in 30d
    - flat: SPY -2% to +5% in 30d
    - bear: SPY down >2% in 30d

    Flight-to-quality indicator:
    - High volatility (>20% annualized) signals flight to quality
    - Mega caps (AAPL, MSFT, GOOGL) benefit
    - Small/mid caps suffer
    """
    try:
        filing_date = datetime.fromisoformat(filing_date_str)

        # Get 60 days of data to ensure we have enough trading days
        start_date = filing_date - timedelta(days=60)
        end_date = filing_date

        # Fetch SPY data
        spy = yf.Ticker("SPY")
        hist = spy.history(start=start_date, end=end_date)

        if hist.empty or len(hist) < 2:
            return {
                "success": False,
                "error": "Insufficient SPY data"
            }

        # Get prices 30 trading days apart (or closest available)
        end_price = hist['Close'].iloc[-1]

        # Try to get price from 30 trading days ago
        if len(hist) >= 30:
            start_price = hist['Close'].iloc[-30]
            vol_window = 30
        else:
            start_price = hist['Close'].iloc[0]
            vol_window = len(hist)

        # Calculate return
        momentum = ((end_price - start_price) / start_price) * 100

        # Calculate volatility (annualized standard deviation of daily returns)
        daily_returns = hist['Close'].pct_change().dropna()
        if len(daily_returns) > 1:
            volatility = float(daily_returns.iloc[-vol_window:].std() * np.sqrt(252) * 100)
        else:
            volatility = None

        # Classify market regime
        if momentum > 5:
            regime = "bull"
        elif momentum < -2:
            regime = "bear"
        else:
            regime = "flat"

        # Flight-to-quality indicator (high volatility = investors seek safety)
        flight_to_quality = False
        if volatility and volatility > 20:  # >20% annualized volatility
            flight_to_quality = True

        result = {
            "success": True,
            "marketMomentum": momentum,
            "spy30dReturn": momentum,
            "volatility": volatility,  # Annualized volatility %
            "regime": regime,  # bull, flat, or bear
            "flightToQuality": flight_to_quality,  # High volatility environment
            "filingDate": filing_date_str,
            "spyEndPrice": float(end_price),
            "spyStartPrice": float(start_price),
            "tradingDays": len(hist)
        }

        return result

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: fetch-market-momentum.py FILING_DATE"}))
        sys.exit(1)

    filing_date = sys.argv[1]
    result = fetch_market_momentum(filing_date)
    print(json.dumps(result, indent=2, default=str))
