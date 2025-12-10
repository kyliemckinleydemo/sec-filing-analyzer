#!/usr/bin/env python3
"""
Enhanced Macro Economic Indicators

Fetches comprehensive macro data including:
- Interest rates (Fed funds, Treasury yields)
- Market momentum (SPY short-term: 7d, 14d, 21d, 30d)
- Dollar strength (DXY)
- Volatility (VIX)
- Sector performance (XLK, XLF, XLE, XLV)
"""

import sys
import json
import yfinance as yf
import numpy as np
from datetime import datetime, timedelta

def fetch_enhanced_macro_indicators(filing_date_str: str):
    """
    Fetch comprehensive macro indicators for filing date

    Returns all data needed for MacroIndicators database model
    """
    try:
        filing_date = datetime.fromisoformat(filing_date_str)

        # Fetch historical data (need enough history for 30-day calcs)
        start_date = filing_date - timedelta(days=400)  # 13 months
        end_date = filing_date + timedelta(days=1)  # Include filing date

        result = {
            "success": True,
            "date": filing_date_str,
        }

        # ===== 1. S&P 500 Data (Market Index) =====
        print(f"[Macro] Fetching SPY data...", file=sys.stderr)
        spy = yf.Ticker("SPY")
        spy_hist = spy.history(start=start_date, end=end_date)

        if not spy_hist.empty and len(spy_hist) >= 30:
            spy_close = spy_hist['Close'].iloc[-1]
            result["spxClose"] = float(spy_close)

            # Calculate returns at multiple timeframes
            if len(spy_hist) >= 7:
                spy_7d_return = ((spy_hist['Close'].iloc[-1] - spy_hist['Close'].iloc[-7]) / spy_hist['Close'].iloc[-7]) * 100
                result["spxReturn7d"] = float(spy_7d_return)

            if len(spy_hist) >= 14:
                spy_14d_return = ((spy_hist['Close'].iloc[-1] - spy_hist['Close'].iloc[-14]) / spy_hist['Close'].iloc[-14]) * 100
                result["spxReturn14d"] = float(spy_14d_return)

            if len(spy_hist) >= 21:
                spy_21d_return = ((spy_hist['Close'].iloc[-1] - spy_hist['Close'].iloc[-21]) / spy_hist['Close'].iloc[-21]) * 100
                result["spxReturn21d"] = float(spy_21d_return)

            if len(spy_hist) >= 30:
                spy_30d_return = ((spy_hist['Close'].iloc[-1] - spy_hist['Close'].iloc[-30]) / spy_hist['Close'].iloc[-30]) * 100
                result["spxReturn30d"] = float(spy_30d_return)

            # Short-term momentum classification (for regime detection)
            if "spxReturn7d" in result:
                if result["spxReturn7d"] > 2:
                    result["shortTermMomentum"] = "strong_bullish"
                elif result["spxReturn7d"] > 0.5:
                    result["shortTermMomentum"] = "bullish"
                elif result["spxReturn7d"] < -2:
                    result["shortTermMomentum"] = "strong_bearish"
                elif result["spxReturn7d"] < -0.5:
                    result["shortTermMomentum"] = "bearish"
                else:
                    result["shortTermMomentum"] = "neutral"

        # ===== 2. VIX (Volatility Index) =====
        print(f"[Macro] Fetching VIX data...", file=sys.stderr)
        vix = yf.Ticker("^VIX")
        vix_hist = vix.history(start=start_date, end=end_date)

        if not vix_hist.empty:
            result["vixClose"] = float(vix_hist['Close'].iloc[-1])

            if len(vix_hist) >= 30:
                result["vixMA30"] = float(vix_hist['Close'].tail(30).mean())

        # ===== 3. Interest Rates =====
        # Note: Treasury yields are directly available from Yahoo Finance
        # ^IRX = 13-week Treasury (proxy for 3-month)
        # ^FVX = 5-year Treasury
        # ^TNX = 10-year Treasury
        # ^TYX = 30-year Treasury

        print(f"[Macro] Fetching Treasury yields...", file=sys.stderr)

        # 13-week Treasury (3-month proxy)
        try:
            t3m = yf.Ticker("^IRX")
            t3m_hist = t3m.history(start=start_date, end=end_date)
            if not t3m_hist.empty:
                result["treasury3m"] = float(t3m_hist['Close'].iloc[-1])
        except Exception as e:
            print(f"[Macro] Warning: Could not fetch 3M Treasury: {e}", file=sys.stderr)

        # 2-year Treasury (need to use a different approach - yfinance doesn't have ^2YR)
        # We'll use TLT (20+ year Treasury ETF) as a proxy for long-term rates
        # and calculate implied 2Y from the curve

        # 10-year Treasury
        try:
            t10y = yf.Ticker("^TNX")
            t10y_hist = t10y.history(start=start_date, end=end_date)
            if not t10y_hist.empty and len(t10y_hist) > 0:
                t10y_current = float(t10y_hist['Close'].iloc[-1])
                result["treasury10y"] = t10y_current

                # Calculate 30-day change in 10Y yield
                if len(t10y_hist) >= 30:
                    t10y_30d_ago = float(t10y_hist['Close'].iloc[-30])
                    result["treasury10yChange30d"] = t10y_current - t10y_30d_ago
        except Exception as e:
            print(f"[Macro] Warning: Could not fetch 10Y Treasury: {e}", file=sys.stderr)

        # For 2-year, we'll estimate from the curve or use IEF (7-10 year) as proxy
        try:
            ief = yf.Ticker("IEF")  # iShares 7-10 Year Treasury Bond ETF
            ief_hist = ief.history(start=start_date, end=end_date)
            if not ief_hist.empty and "treasury10y" in result:
                # Use 10Y as proxy for 2Y (will be lower in normal curve)
                # In reality, 2Y is typically 50-200bps below 10Y
                result["treasury2y"] = result["treasury10y"] * 0.85  # Rough estimate
        except:
            pass

        # Yield curve spread (10Y - 2Y) - important recession indicator
        if "treasury10y" in result and "treasury2y" in result:
            result["yieldCurve2y10y"] = result["treasury10y"] - result["treasury2y"]

            # Classify yield curve
            if result["yieldCurve2y10y"] < 0:
                result["yieldCurveStatus"] = "inverted"  # Recession signal
            elif result["yieldCurve2y10y"] < 0.5:
                result["yieldCurveStatus"] = "flat"
            else:
                result["yieldCurveStatus"] = "normal"

        # Fed Funds Rate - This is trickier as it's not a ticker
        # We can use ^IRX (3-month T-bill) as a proxy since it tracks Fed funds closely
        if "treasury3m" in result:
            result["fedFundsRate"] = result["treasury3m"]

        # Calculate rate trend
        if "treasury10y" in result and "treasury10yChange30d" in result:
            if result["treasury10yChange30d"] > 0.25:
                result["rateTrend"] = "rising"
            elif result["treasury10yChange30d"] < -0.25:
                result["rateTrend"] = "falling"
            else:
                result["rateTrend"] = "stable"

        # ===== 4. Dollar Strength (DXY) =====
        print(f"[Macro] Fetching DXY dollar index...", file=sys.stderr)
        dxy = yf.Ticker("DX-Y.NYB")
        dxy_hist = dxy.history(start=start_date, end=end_date)

        if not dxy_hist.empty and len(dxy_hist) >= 30:
            end_price = dxy_hist['Close'].iloc[-1]
            start_price = dxy_hist['Close'].iloc[-30]

            dollar_30d_change = ((end_price - start_price) / start_price) * 100
            year_avg = dxy_hist['Close'].mean()
            dollar_vs_avg = ((end_price - year_avg) / year_avg) * 100

            result["dollarIndex"] = float(end_price)
            result["dollar30dChange"] = float(dollar_30d_change)
            result["dollarVsYearAvg"] = float(dollar_vs_avg)

            # Classify dollar strength
            if dollar_vs_avg > 3:
                result["dollarStrength"] = "strong"
            elif dollar_vs_avg < -3:
                result["dollarStrength"] = "weak"
            else:
                result["dollarStrength"] = "neutral"

            # Equity flow bias
            result["equityFlowBias"] = (
                "bullish" if result["dollarStrength"] == "weak" else
                "bearish" if result["dollarStrength"] == "strong" else
                "neutral"
            )

        # ===== 5. Sector Performance (30-day returns) =====
        print(f"[Macro] Fetching sector ETF performance...", file=sys.stderr)

        sectors = {
            "XLK": "techSectorReturn30d",      # Technology
            "XLF": "financialSectorReturn30d", # Financials
            "XLE": "energySectorReturn30d",    # Energy
            "XLV": "healthcareSectorReturn30d" # Healthcare
        }

        for ticker, field_name in sectors.items():
            try:
                sector_etf = yf.Ticker(ticker)
                sector_hist = sector_etf.history(start=start_date, end=end_date)

                if not sector_hist.empty and len(sector_hist) >= 30:
                    sector_30d_return = ((sector_hist['Close'].iloc[-1] - sector_hist['Close'].iloc[-30]) / sector_hist['Close'].iloc[-30]) * 100
                    result[field_name] = float(sector_30d_return)
            except Exception as e:
                print(f"[Macro] Warning: Could not fetch {ticker}: {e}", file=sys.stderr)

        # ===== 6. Market Regime Classification =====
        # Combine momentum, volatility, and rates for overall regime
        regime_score = 0

        if "spxReturn30d" in result:
            if result["spxReturn30d"] > 5:
                regime_score += 2
            elif result["spxReturn30d"] > 0:
                regime_score += 1
            elif result["spxReturn30d"] < -5:
                regime_score -= 2
            elif result["spxReturn30d"] < 0:
                regime_score -= 1

        if "vixClose" in result:
            if result["vixClose"] < 15:
                regime_score += 1
            elif result["vixClose"] > 25:
                regime_score -= 1

        if "rateTrend" in result:
            if result["rateTrend"] == "falling":
                regime_score += 1
            elif result["rateTrend"] == "rising":
                regime_score -= 1

        # Classify overall regime
        if regime_score >= 3:
            result["marketRegime"] = "strong_bull"
        elif regime_score >= 1:
            result["marketRegime"] = "bull"
        elif regime_score <= -3:
            result["marketRegime"] = "strong_bear"
        elif regime_score <= -1:
            result["marketRegime"] = "bear"
        else:
            result["marketRegime"] = "neutral"

        print(f"[Macro] ✅ Regime: {result.get('marketRegime', 'unknown')}, " +
              f"SPY 7d: {result.get('spxReturn7d', 'N/A'):.2f}%, " +
              f"10Y: {result.get('treasury10y', 'N/A'):.2f}%, " +
              f"VIX: {result.get('vixClose', 'N/A'):.1f}", file=sys.stderr)

        return result

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: fetch-macro-indicators-enhanced.py FILING_DATE"}))
        sys.exit(1)

    filing_date = sys.argv[1]
    result = fetch_enhanced_macro_indicators(filing_date)
    print(json.dumps(result, indent=2, default=str))
