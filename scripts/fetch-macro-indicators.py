#!/usr/bin/env python3
"""
Fetch macro economic indicators (DXY dollar index, GDP trends)

Key indicators:
- DXY (US Dollar Index): Weak dollar = capital flows into equities
- GDP growth trends: Strong GDP = bullish for stocks
"""

import sys
import json
import yfinance as yf
import numpy as np
from datetime import datetime, timedelta

def fetch_macro_indicators(filing_date_str: str):
    """
    Fetch macro indicators for filing date

    Returns:
    - dollarTrend: 30-day DXY change (negative = dollar weakening = bullish for stocks)
    - dollarStrength: Current DXY level vs 1-year average (weak/neutral/strong)
    - gdpProxy: Use SPY/bonds ratio as GDP sentiment proxy
    """
    try:
        filing_date = datetime.fromisoformat(filing_date_str)

        # Fetch DXY (US Dollar Index) data
        # DXY tracks USD vs basket of currencies (EUR, JPY, GBP, CAD, SEK, CHF)
        start_date = filing_date - timedelta(days=400)  # Get 13 months of data
        end_date = filing_date

        # Fetch DXY
        dxy = yf.Ticker("DX-Y.NYB")  # US Dollar Index
        dxy_hist = dxy.history(start=start_date, end=end_date)

        if dxy_hist.empty or len(dxy_hist) < 30:
            return {
                "success": False,
                "error": "Insufficient DXY data"
            }

        # Calculate 30-day dollar trend
        end_price = dxy_hist['Close'].iloc[-1]
        if len(dxy_hist) >= 30:
            start_price = dxy_hist['Close'].iloc[-30]
        else:
            start_price = dxy_hist['Close'].iloc[0]

        dollar_30d_change = ((end_price - start_price) / start_price) * 100

        # Calculate 1-year average for strength classification
        year_avg = dxy_hist['Close'].mean()
        dollar_vs_avg = ((end_price - year_avg) / year_avg) * 100

        # Classify dollar strength
        if dollar_vs_avg > 3:
            dollar_strength = "strong"  # Strong dollar = bearish for stocks (capital stays in USD)
        elif dollar_vs_avg < -3:
            dollar_strength = "weak"    # Weak dollar = bullish for stocks (flight to equities)
        else:
            dollar_strength = "neutral"

        # GDP Proxy: We don't have real-time GDP, so use SPY momentum as GDP sentiment proxy
        # Strong SPY momentum correlates with GDP optimism
        spy = yf.Ticker("SPY")
        spy_hist = spy.history(start=start_date, end=end_date)

        gdp_proxy_trend = "neutral"
        if not spy_hist.empty and len(spy_hist) >= 60:
            # 60-day SPY trend as GDP proxy
            spy_60d_change = ((spy_hist['Close'].iloc[-1] - spy_hist['Close'].iloc[-60]) / spy_hist['Close'].iloc[-60]) * 100

            if spy_60d_change > 8:
                gdp_proxy_trend = "strong"   # Strong equity market = GDP optimism
            elif spy_60d_change < -5:
                gdp_proxy_trend = "weak"     # Weak equity market = GDP pessimism

        result = {
            "success": True,
            "filingDate": filing_date_str,

            # Dollar metrics
            "dollarIndex": float(end_price),
            "dollar30dChange": float(dollar_30d_change),  # % change (negative = weakening)
            "dollarVsYearAvg": float(dollar_vs_avg),
            "dollarStrength": dollar_strength,  # weak/neutral/strong

            # GDP proxy
            "gdpProxyTrend": gdp_proxy_trend,  # weak/neutral/strong

            # Interpretation
            "equityFlowBias": "bullish" if dollar_strength == "weak" else
                             "bearish" if dollar_strength == "strong" else "neutral"
        }

        return result

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: fetch-macro-indicators.py FILING_DATE"}))
        sys.exit(1)

    filing_date = sys.argv[1]
    result = fetch_macro_indicators(filing_date)
    print(json.dumps(result, indent=2, default=str))
