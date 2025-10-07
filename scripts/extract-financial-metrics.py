#!/usr/bin/env python3
"""
Extract financial metrics (EPS, revenue, guidance) from 278 filings

Uses:
1. SEC Company Facts API - for structured financial data
2. SEC XBRL data - for earnings per share
3. Financial Modeling Prep API - for consensus estimates (to calculate surprises)

This is the CRITICAL step to push model accuracy from 54.7% to 65%+
"""

import json
import requests
import time
from datetime import datetime
import sys

# CIK mapping
CIK_MAP = {
    "AAPL": "0000320193", "MSFT": "0000789019", "GOOGL": "0001652044", "AMZN": "0001018724",
    "NVDA": "0001045810", "META": "0001326801", "TSLA": "0001318605", "AVGO": "0001730168",
    "JPM": "0000019617", "V": "0001403161", "WMT": "0000104169", "MA": "0001141391",
    "COST": "0000909832", "HD": "0000354950", "PG": "0000080424", "NFLX": "0001065280",
    "DIS": "0001744489", "PYPL": "0001633917", "INTC": "0000050863", "AMD": "0000002488"
}

HEADERS = {"User-Agent": "SEC Filing Analyzer research@example.com"}

# Load dataset
with open('/tmp/dataset.json', 'r') as f:
    data = json.load(f)

filings = data['filings']

print("=" * 80)
print("EXTRACTING FINANCIAL METRICS FROM 278 FILINGS")
print("=" * 80)
print(f"Total filings: {len(filings)}")
print()
print("This will extract:")
print("1. EPS (Earnings Per Share) - actual reported")
print("2. Revenue - actual reported")
print("3. Net Income - actual reported")
print()
print("Note: Consensus estimates require paid API access.")
print("      For now, we'll use historical comparison to estimate surprises.")
print()

def get_company_facts(ticker, cik):
    """
    Fetch company facts from SEC Company Facts API
    Returns structured financial data
    """
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"

    try:
        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"  ⚠️  Error fetching facts: {e}", file=sys.stderr)
        return None

def extract_metrics_for_filing(filing, company_facts):
    """
    Extract EPS, revenue, net income for a specific filing
    """
    if not company_facts:
        return None

    filing_date = filing['filingDate']
    filing_year = datetime.fromisoformat(filing_date).year
    filing_quarter = (datetime.fromisoformat(filing_date).month - 1) // 3 + 1

    metrics = {
        'eps': None,
        'revenue': None,
        'netIncome': None,
        'filingDate': filing_date,
        'filingType': filing['filingType']
    }

    try:
        # Get US-GAAP facts
        us_gaap = company_facts.get('facts', {}).get('us-gaap', {})

        # Extract EPS (EarningsPerShareDiluted)
        if 'EarningsPerShareDiluted' in us_gaap:
            eps_data = us_gaap['EarningsPerShareDiluted']['units'].get('USD/shares', [])
            for item in eps_data:
                # Find the filing that matches our accession number
                if item.get('accn') == filing['accessionNumber'].replace('-', ''):
                    metrics['eps'] = float(item.get('val', 0))
                    break

        # Extract Revenue (Revenues or RevenueFromContractWithCustomerExcludingAssessedTax)
        revenue_keys = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax']
        for key in revenue_keys:
            if key in us_gaap:
                revenue_data = us_gaap[key]['units'].get('USD', [])
                for item in revenue_data:
                    if item.get('accn') == filing['accessionNumber'].replace('-', ''):
                        metrics['revenue'] = float(item.get('val', 0)) / 1_000_000  # Convert to millions
                        break
                if metrics['revenue']:
                    break

        # Extract Net Income
        if 'NetIncomeLoss' in us_gaap:
            ni_data = us_gaap['NetIncomeLoss']['units'].get('USD', [])
            for item in ni_data:
                if item.get('accn') == filing['accessionNumber'].replace('-', ''):
                    metrics['netIncome'] = float(item.get('val', 0)) / 1_000_000  # Convert to millions
                    break

    except Exception as e:
        print(f"  ⚠️  Error extracting metrics: {e}", file=sys.stderr)

    return metrics

# Process each unique ticker
print("Processing filings by ticker...")
print("-" * 80)

enriched_filings = []
ticker_cache = {}  # Cache company facts to avoid repeated API calls

for i, filing in enumerate(filings):
    ticker = filing['ticker']
    cik = CIK_MAP.get(ticker)

    if not cik:
        print(f"[{i+1}/{len(filings)}] {ticker}: No CIK found", file=sys.stderr)
        enriched_filings.append(filing)
        continue

    # Use cached company facts if available
    if ticker not in ticker_cache:
        print(f"[{i+1}/{len(filings)}] {ticker}: Fetching company facts...")
        company_facts = get_company_facts(ticker, cik)
        ticker_cache[ticker] = company_facts
        time.sleep(0.15)  # Rate limit
    else:
        company_facts = ticker_cache[ticker]

    # Extract metrics
    metrics = extract_metrics_for_filing(filing, company_facts)

    # Add metrics to filing
    enriched_filing = filing.copy()
    if metrics:
        enriched_filing['financialMetrics'] = metrics
        if metrics['eps'] or metrics['revenue']:
            print(f"  ✅ {filing['filingType']} {filing['filingDate']}: EPS=${metrics['eps']}, Revenue=${metrics['revenue']:.0f}M")
        else:
            print(f"  ⚠️  {filing['filingType']} {filing['filingDate']}: No metrics found")
    else:
        print(f"  ⚠️  {filing['filingType']} {filing['filingDate']}: Failed to extract")

    enriched_filings.append(enriched_filing)

print()
print("=" * 80)
print("CALCULATING HISTORICAL SURPRISES")
print("=" * 80)
print("Without consensus estimates, we'll calculate 'surprises' by comparing to:")
print("1. Prior quarter (for 10-Q)")
print("2. Prior year (for 10-K)")
print()

# Group by ticker for historical comparison
by_ticker = {}
for filing in enriched_filings:
    ticker = filing['ticker']
    if ticker not in by_ticker:
        by_ticker[ticker] = []
    by_ticker[ticker].append(filing)

# Sort each ticker's filings by date
for ticker in by_ticker:
    by_ticker[ticker].sort(key=lambda x: x['filingDate'])

# Calculate surprises
for ticker, ticker_filings in by_ticker.items():
    for i, filing in enumerate(ticker_filings):
        metrics = filing.get('financialMetrics')
        if not metrics or not metrics.get('eps') or not metrics.get('revenue'):
            continue

        # Find prior period filing
        prior_filing = None
        if filing['filingType'] == '10-Q':
            # Compare to quarter 1 year ago (4 quarters back)
            if i >= 4:
                prior_filing = ticker_filings[i-4]
        elif filing['filingType'] == '10-K':
            # Compare to prior year (1 year back, typically ~4 filings)
            # Find the prior 10-K
            for j in range(i-1, -1, -1):
                if ticker_filings[j]['filingType'] == '10-K':
                    prior_filing = ticker_filings[j]
                    break

        if prior_filing:
            prior_metrics = prior_filing.get('financialMetrics', {})

            # Calculate EPS surprise
            if metrics.get('eps') and prior_metrics.get('eps'):
                prior_eps = prior_metrics['eps']
                current_eps = metrics['eps']

                if prior_eps != 0:
                    eps_growth = ((current_eps - prior_eps) / abs(prior_eps)) * 100

                    # Classify surprise
                    if eps_growth > 5:
                        metrics['epsSurprise'] = 'beat'
                        metrics['epsSurpriseMagnitude'] = eps_growth
                    elif eps_growth < -5:
                        metrics['epsSurprise'] = 'miss'
                        metrics['epsSurpriseMagnitude'] = eps_growth
                    else:
                        metrics['epsSurprise'] = 'inline'
                        metrics['epsSurpriseMagnitude'] = eps_growth

            # Calculate Revenue surprise
            if metrics.get('revenue') and prior_metrics.get('revenue'):
                prior_rev = prior_metrics['revenue']
                current_rev = metrics['revenue']

                if prior_rev != 0:
                    rev_growth = ((current_rev - prior_rev) / abs(prior_rev)) * 100

                    # Classify surprise
                    if rev_growth > 5:
                        metrics['revenueSurprise'] = 'beat'
                        metrics['revenueSurpriseMagnitude'] = rev_growth
                    elif rev_growth < -5:
                        metrics['revenueSurprise'] = 'miss'
                        metrics['revenueSurpriseMagnitude'] = rev_growth
                    else:
                        metrics['revenueSurprise'] = 'inline'
                        metrics['revenueSurpriseMagnitude'] = rev_growth

print("Surprise calculation complete!")
print()

# Summary statistics
print("=" * 80)
print("EXTRACTION SUMMARY")
print("=" * 80)

total_with_eps = sum(1 for f in enriched_filings if f.get('financialMetrics', {}).get('eps'))
total_with_revenue = sum(1 for f in enriched_filings if f.get('financialMetrics', {}).get('revenue'))
total_with_eps_surprise = sum(1 for f in enriched_filings if f.get('financialMetrics', {}).get('epsSurprise'))
total_with_rev_surprise = sum(1 for f in enriched_filings if f.get('financialMetrics', {}).get('revenueSurprise'))

print(f"Total filings: {len(enriched_filings)}")
print(f"With EPS data: {total_with_eps} ({total_with_eps/len(enriched_filings)*100:.1f}%)")
print(f"With Revenue data: {total_with_revenue} ({total_with_revenue/len(enriched_filings)*100:.1f}%)")
print(f"With EPS surprise: {total_with_eps_surprise} ({total_with_eps_surprise/len(enriched_filings)*100:.1f}%)")
print(f"With Revenue surprise: {total_with_rev_surprise} ({total_with_rev_surprise/len(enriched_filings)*100:.1f}%)")
print()

# Surprise distribution
eps_beats = sum(1 for f in enriched_filings if f.get('financialMetrics', {}).get('epsSurprise') == 'beat')
eps_misses = sum(1 for f in enriched_filings if f.get('financialMetrics', {}).get('epsSurprise') == 'miss')
eps_inline = sum(1 for f in enriched_filings if f.get('financialMetrics', {}).get('epsSurprise') == 'inline')

if total_with_eps_surprise > 0:
    print("EPS SURPRISE DISTRIBUTION:")
    print(f"  Beats: {eps_beats} ({eps_beats/total_with_eps_surprise*100:.1f}%)")
    print(f"  Misses: {eps_misses} ({eps_misses/total_with_eps_surprise*100:.1f}%)")
    print(f"  Inline: {eps_inline} ({eps_inline/total_with_eps_surprise*100:.1f}%)")
    print()

# Save enriched dataset
output_file = '/tmp/dataset-enriched.json'
with open(output_file, 'w') as f:
    json.dump({
        'status': 'success',
        'collected': len(enriched_filings),
        'withFinancials': total_with_eps,
        'withSurprises': total_with_eps_surprise,
        'filings': enriched_filings
    }, f, indent=2)

print(f"✅ Saved enriched dataset to: {output_file}")
print()
print("=" * 80)
print("NEXT STEPS")
print("=" * 80)
print("1. Update prediction model to use EPS/revenue surprises")
print("2. Re-run backtest with full features")
print("3. Target: >60% direction accuracy")
print("=" * 80)
