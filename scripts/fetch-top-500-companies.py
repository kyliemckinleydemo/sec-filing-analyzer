#!/usr/bin/env python3
"""
Fetch top 500 US companies by market cap and create a configuration file

Uses Financial Modeling Prep API (free tier) to get market cap data
Falls back to hardcoded list of S&P 500 if API unavailable
"""

import json
import requests
from datetime import datetime

# Hardcoded S&P 500 top companies (backup if API fails)
SP500_TOP_500 = [
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "BRK.B", "AVGO",
    "V", "JPM", "WMT", "LLY", "MA", "UNH", "XOM", "JNJ", "ORCL", "COST",
    "HD", "PG", "NFLX", "BAC", "ABBV", "CRM", "CVX", "KO", "MRK", "AMD",
    "TMO", "ADBE", "PEP", "ACN", "CSCO", "LIN", "MCD", "ABT", "WFC", "DHR",
    "GE", "INTU", "QCOM", "IBM", "VZ", "TXN", "AMGN", "CAT", "CMCSA", "NEE",
    "PM", "NOW", "AXP", "COP", "ISRG", "HON", "RTX", "UBER", "PFE", "SPGI",
    "UNP", "LOW", "AMAT", "GS", "T", "BA", "BLK", "SYK", "ELV", "MS",
    "BKNG", "DE", "TJX", "PGR", "BMY", "GILD", "VRTX", "C", "SCHW", "MDT",
    "BX", "ADI", "LMT", "MMC", "LRCX", "ADP", "REGN", "SBUX", "CB", "PLD",
    "TMUS", "CI", "ETN", "AMT", "FI", "SLB", "MO", "SO", "PANW", "APH",
    "DUK", "BSX", "MDLZ", "EQIX", "ZTS", "ITW", "PYPL", "SNPS", "WM", "CDNS",
    "CEG", "MCK", "PH", "EOG", "MAR", "CME", "CSX", "APD", "KLAC", "USB",
    "MSI", "NOC", "HCA", "ICE", "CL", "SHW", "TT", "EMR", "CMG", "MCO",
    "PNC", "ECL", "GD", "AON", "WMB", "WELL", "PSA", "DLR", "MET", "COF",
    "ROP", "MMM", "CARR", "OXY", "NSC", "NXPI", "AJG", "AZO", "AFL", "MPC",
    "TGT", "PSX", "SRE", "SPG", "TRV", "ADSK", "HLT", "FTNT", "AIG", "FICO",
    "AMP", "PCAR", "KMI", "DHI", "MSCI", "ALL", "TEL", "BK", "FCX", "PAYX",
    "RSG", "JCI", "VLO", "CCI", "ORLY", "GM", "NEM", "KMB", "ANET", "GWW",
    "AEP", "MCHP", "SYY", "CMI", "FAST", "O", "CTVA", "CVS", "URI", "PRU",
    "KHC", "HES", "MNST", "DD", "F", "EW", "VST", "CPRT", "IT", "CTAS",
    "LEN", "HWM", "ODFL", "D", "CHTR", "DFS", "AME", "BKR", "GLW", "HSY",
    "IQV", "EXC", "ROST", "YUM", "KDP", "PCG", "COR", "DAL", "ACGL", "VMC",
    "GIS", "HPQ", "LULU", "IDXX", "OTIS", "EXR", "ANSS", "A", "ON", "XEL",
    "MLM", "VRSK", "EFX", "NDAQ", "RMD", "VICI", "PPG", "ED", "GEHC", "MTD",
    "STZ", "CTSH", "EA", "CDW", "DXCM", "WEC", "CBRE", "MPWR", "DOV", "WAB",
    "EBAY", "ROK", "KEYS", "FTV", "AWK", "BR", "FITB", "FANG", "SBAC", "AVB",
    "IR", "ZBH", "STT", "TTWO", "WBD", "ETR", "BIIB", "TSCO", "HIG", "PPL",
    "IFF", "AEE", "WDC", "EIX", "DTE", "DG", "XYL", "ALGN", "DRI", "BALL",
    "INVH", "MTB", "HPE", "RJF", "APTV", "TDY", "FE", "ES", "CSGP", "WTW",
    "HAL", "VTR", "HBAN", "TYL", "STE", "MOH", "CLX", "CPAY", "K", "TER",
    "CFG", "RF", "EXPE", "WAT", "CHD", "ARE", "DLTR", "NTRS", "LH", "BBY",
    "TSN", "ENPH", "EPAM", "CCL", "LVS", "HOLX", "ULTA", "TROW", "WY", "PODD",
    "IRM", "CAH", "IP", "ESS", "TRGP", "STLD", "MKC", "DPZ", "CINF", "SYF",
    "J", "MAA", "CBOE", "NTAP", "ZBRA", "LUV", "SWKS", "COO", "GPN", "CF",
    "CNC", "BAX", "CAG", "NVR", "PKG", "AKAM", "MTCH", "BLDR", "TFX", "LYB",
    "EQR", "VRSN", "NRG", "PKI", "POOL", "JBHT", "DOC", "CNP", "JKHY", "PTC",
    "PAYC", "UAL", "INCY", "PEG", "TECH", "L", "LDOS", "UDR", "SNA", "GPC",
    "AES", "CPT", "NI", "BXP", "MOS", "LNT", "NDSN", "BRO", "RVTY", "KIM",
    "EMN", "APA", "EXPD", "ALB", "KMX", "AMCR", "HST", "EVRG", "FDS", "CPB",
    "CMS", "SWK", "CHRW", "JNPR", "REG", "CTLT", "FFIV", "GL", "TXT", "FRT",
    "LKQ", "MKTX", "AIZ", "VTRS", "BG", "UHS", "IEX", "CE", "TAP", "AAL",
    "HII", "FOXA", "WHR", "TPR", "HAS", "RL", "BEN", "NWSA", "SEE", "ZION",
    "PNW", "HSIC", "HRL", "BBWI", "AOS", "BWA", "PARA", "NWS", "DVA", "DISH"
]

CIK_MAP = {
    "AAPL": "0000320193", "MSFT": "0000789019", "GOOGL": "0001652044", "GOOG": "0001652044",
    "AMZN": "0001018724", "NVDA": "0001045810", "META": "0001326801", "TSLA": "0001318605",
    "BRK.B": "0001067983", "AVGO": "0001730168", "V": "0001403161", "JPM": "0000019617",
    "WMT": "0000104169", "MA": "0001141391", "XOM": "0000034088", "JNJ": "0000200406",
    "COST": "0000909832", "HD": "0000354950", "PG": "0000080424", "NFLX": "0001065280",
    "DIS": "0001744489", "PYPL": "0001633917", "INTC": "0000050863", "AMD": "0000002488",
    "IBM": "0000051143", "ORCL": "0001341439", "CSCO": "0000858877", "ADBE": "0000796343",
    "CRM": "0001108524", "QCOM": "0000804328", "TXN": "0000097476", "INTU": "0000896878"
}

print("=" * 80)
print("FETCHING TOP 500 US COMPANIES BY MARKET CAP")
print("=" * 80)
print()

# Try Financial Modeling Prep API (free tier)
print("Attempting to fetch from Financial Modeling Prep API...")
FMP_API_KEY = "demo"  # Free demo key (limited to 250 requests/day)

try:
    url = f"https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=1000000000&limit=500&apikey={FMP_API_KEY}"
    response = requests.get(url, timeout=10)

    if response.status_code == 200:
        data = response.json()

        # Filter US companies only
        us_companies = [
            company for company in data
            if company.get('exchangeShortName') in ['NASDAQ', 'NYSE', 'AMEX']
        ]

        # Sort by market cap
        us_companies.sort(key=lambda x: x.get('marketCap', 0), reverse=True)

        # Take top 500
        top_500 = us_companies[:500]

        tickers = [company['symbol'] for company in top_500]

        print(f"✅ Successfully fetched {len(tickers)} companies from API")
        print()
    else:
        print(f"⚠️  API returned status {response.status_code}, using S&P 500 backup")
        tickers = SP500_TOP_500

except Exception as e:
    print(f"⚠️  API fetch failed: {e}")
    print("Using S&P 500 backup list")
    tickers = SP500_TOP_500

# Create configuration
config = {
    "lastUpdated": datetime.now().isoformat(),
    "source": "Financial Modeling Prep API" if len(tickers) != len(SP500_TOP_500) else "S&P 500 List",
    "count": len(tickers),
    "tickers": tickers,
    "cikMap": CIK_MAP
}

# Save to config file
output_file = "config/top-500-companies.json"
with open(output_file, 'w') as f:
    json.dump(config, f, indent=2)

print(f"✅ Saved top {len(tickers)} companies to: {output_file}")
print()

# Print sample
print("Sample companies:")
for i, ticker in enumerate(tickers[:20]):
    print(f"  {i+1:3d}. {ticker}")

print(f"  ... and {len(tickers) - 20} more")
print()

print("=" * 80)
print("CONFIGURATION READY")
print("=" * 80)
print(f"Total companies: {len(tickers)}")
print(f"CIK mappings: {len(CIK_MAP)}")
print()
print("Next steps:")
print("1. Update data collection scripts to use this config")
print("2. Build latest filings view page")
print("=" * 80)
