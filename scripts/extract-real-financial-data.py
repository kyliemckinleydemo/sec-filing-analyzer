#!/usr/bin/env python3
"""
Extract REAL financial metrics from SEC filings using XBRL

This script extracts actual reported financials (not simulated):
1. EPS (Earnings Per Share) - diluted
2. Revenue - total revenues
3. Net Income
4. Compare to prior period to calculate surprises

Uses SEC Company Facts API for structured XBRL data.
"""

import json
import requests
import time
from datetime import datetime, timedelta
import sys
from collections import defaultdict

# CIK mapping for our dataset
CIK_MAP = {
    "AAPL": "0000320193", "MSFT": "0000789019", "GOOGL": "0001652044", "AMZN": "0001018724",
    "NVDA": "0001045810", "META": "0001326801", "TSLA": "0001318605", "AVGO": "0001730168",
    "JPM": "0000019617", "V": "0001403161", "WMT": "0000104169", "MA": "0001141391",
    "COST": "0000909832", "HD": "0000354950", "PG": "0000080424", "NFLX": "0001065280",
    "DIS": "0001744489", "PYPL": "0001633917", "INTC": "0000050863", "AMD": "0000002488"
}

HEADERS = {"User-Agent": "SEC Filing Analyzer contact@example.com"}

print("=" * 80)
print("EXTRACTING REAL FINANCIAL DATA FROM SEC XBRL")
print("=" * 80)
print()

# Load dataset
with open('/tmp/dataset.json', 'r') as f:
    data = json.load(f)

filings = data['filings']

print(f"Total filings to process: {len(filings)}")
print()

def get_company_facts(ticker, cik):
    """Fetch company facts from SEC API"""
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"

    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f"  ⚠️  No company facts found for {ticker}", file=sys.stderr)
        else:
            print(f"  ⚠️  HTTP {e.response.status_code} for {ticker}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  ⚠️  Error fetching {ticker}: {e}", file=sys.stderr)
        return None

def find_metric_for_filing(facts_data, accession_num, metric_names, units='USD'):
    """
    Find a specific metric value for a filing

    Args:
        facts_data: Company facts JSON
        accession_num: Accession number (with or without dashes)
        metric_names: List of possible metric names to try
        units: Unit type (USD, USD/shares, etc.)
    """
    if not facts_data:
        return None

    # Normalize accession number
    clean_accn = accession_num.replace('-', '')

    us_gaap = facts_data.get('facts', {}).get('us-gaap', {})

    for metric_name in metric_names:
        if metric_name not in us_gaap:
            continue

        # Try different unit types
        unit_options = [units, f'{units}/shares'] if units == 'USD' else [units]

        for unit in unit_options:
            if unit not in us_gaap[metric_name].get('units', {}):
                continue

            for item in us_gaap[metric_name]['units'][unit]:
                item_accn = item.get('accn', '').replace('-', '')

                if item_accn == clean_accn:
                    val = item.get('val')
                    if val is not None:
                        return float(val)

    return None

def extract_financials(filing, company_facts):
    """Extract EPS, revenue, net income for a specific filing"""
    if not company_facts:
        return None

    accn = filing['accessionNumber']

    metrics = {
        'filingDate': filing['filingDate'],
        'filingType': filing['filingType'],
        'ticker': filing['ticker']
    }

    # Extract EPS (try multiple XBRL tags)
    eps_tags = [
        'EarningsPerShareDiluted',
        'EarningsPerShareBasic',
        'IncomeLossFromContinuingOperationsPerDilutedShare'
    ]
    eps = find_metric_for_filing(company_facts, accn, eps_tags, 'USD/shares')
    if eps:
        metrics['eps'] = round(eps, 2)

    # Extract Revenue (try multiple tags)
    revenue_tags = [
        'RevenueFromContractWithCustomerExcludingAssessedTax',
        'Revenues',
        'SalesRevenueNet',
        'RevenueFromContractWithCustomerIncludingAssessedTax'
    ]
    revenue = find_metric_for_filing(company_facts, accn, revenue_tags, 'USD')
    if revenue:
        metrics['revenue'] = round(revenue / 1_000_000, 2)  # Convert to millions

    # Extract Net Income
    ni_tags = [
        'NetIncomeLoss',
        'ProfitLoss',
        'NetIncomeLossAvailableToCommonStockholdersBasic'
    ]
    net_income = find_metric_for_filing(company_facts, accn, ni_tags, 'USD')
    if net_income:
        metrics['netIncome'] = round(net_income / 1_000_000, 2)  # Millions

    return metrics if any(k in metrics for k in ['eps', 'revenue', 'netIncome']) else None

# Process each ticker (cache company facts)
print("Processing filings by ticker...")
print("-" * 80)

ticker_cache = {}
enriched_filings = []
stats = {
    'total': len(filings),
    'withEPS': 0,
    'withRevenue': 0,
    'withNetIncome': 0,
    'failed': 0
}

for i, filing in enumerate(filings):
    ticker = filing['ticker']
    cik = CIK_MAP.get(ticker)

    if not cik:
        print(f"[{i+1}/{len(filings)}] {ticker}: No CIK mapping")
        enriched_filings.append(filing)
        stats['failed'] += 1
        continue

    # Cache company facts
    if ticker not in ticker_cache:
        print(f"[{i+1}/{len(filings)}] {ticker}: Fetching company facts...")
        company_facts = get_company_facts(ticker, cik)
        ticker_cache[ticker] = company_facts
        time.sleep(0.12)  # SEC rate limit: 10 req/sec
    else:
        company_facts = ticker_cache[ticker]

    # Extract metrics
    metrics = extract_financials(filing, company_facts)

    enriched_filing = filing.copy()
    if metrics:
        enriched_filing['realFinancials'] = metrics

        # Update stats
        if 'eps' in metrics:
            stats['withEPS'] += 1
        if 'revenue' in metrics:
            stats['withRevenue'] += 1
        if 'netIncome' in metrics:
            stats['withNetIncome'] += 1

        print(f"  ✅ {filing['filingType']} {filing['filingDate']}: " +
              f"EPS={metrics.get('eps', 'N/A')}, Rev={metrics.get('revenue', 'N/A')}M")
    else:
        stats['failed'] += 1
        print(f"  ⚠️  {filing['filingType']} {filing['filingDate']}: No data found")

    enriched_filings.append(enriched_filing)

print()
print("=" * 80)
print("CALCULATING SURPRISES")
print("=" * 80)

# Group by ticker and sort by date
by_ticker = defaultdict(list)
for filing in enriched_filings:
    by_ticker[filing['ticker']].append(filing)

for ticker in by_ticker:
    by_ticker[ticker].sort(key=lambda x: x['filingDate'])

# Calculate surprises (compare to prior period)
surprise_stats = {'beats': 0, 'misses': 0, 'inline': 0}

for ticker, ticker_filings in by_ticker.items():
    for i, filing in enumerate(ticker_filings):
        real_financials = filing.get('realFinancials')
        if not real_financials or 'eps' not in real_financials:
            continue

        # Find prior period
        prior_filing = None
        if filing['filingType'] == '10-Q':
            # Compare to same quarter last year (4 quarters back)
            if i >= 4:
                prior_filing = ticker_filings[i-4]
        elif filing['filingType'] == '10-K':
            # Find prior 10-K
            for j in range(i-1, -1, -1):
                if ticker_filings[j]['filingType'] == '10-K':
                    prior_filing = ticker_filings[j]
                    break

        if prior_filing:
            prior_financials = prior_filing.get('realFinancials', {})

            # Calculate EPS surprise
            if 'eps' in prior_financials:
                prior_eps = prior_financials['eps']
                current_eps = real_financials['eps']

                if prior_eps != 0:
                    eps_growth = ((current_eps - prior_eps) / abs(prior_eps)) * 100

                    # Classify
                    if eps_growth > 5:
                        real_financials['epsSurprise'] = 'beat'
                        surprise_stats['beats'] += 1
                    elif eps_growth < -5:
                        real_financials['epsSurprise'] = 'miss'
                        surprise_stats['misses'] += 1
                    else:
                        real_financials['epsSurprise'] = 'inline'
                        surprise_stats['inline'] += 1

                    real_financials['epsSurpriseMagnitude'] = round(eps_growth, 2)

            # Calculate Revenue surprise
            if 'revenue' in real_financials and 'revenue' in prior_financials:
                prior_rev = prior_financials['revenue']
                current_rev = real_financials['revenue']

                if prior_rev != 0:
                    rev_growth = ((current_rev - prior_rev) / abs(prior_rev)) * 100

                    if rev_growth > 5:
                        real_financials['revenueSurprise'] = 'beat'
                    elif rev_growth < -5:
                        real_financials['revenueSurprise'] = 'miss'
                    else:
                        real_financials['revenueSurprise'] = 'inline'

                    real_financials['revenueSurpriseMagnitude'] = round(rev_growth, 2)

print()
print("=" * 80)
print("EXTRACTION SUMMARY")
print("=" * 80)
print(f"Total filings: {stats['total']}")
print(f"With EPS: {stats['withEPS']} ({stats['withEPS']/stats['total']*100:.1f}%)")
print(f"With Revenue: {stats['withRevenue']} ({stats['withRevenue']/stats['total']*100:.1f}%)")
print(f"With Net Income: {stats['withNetIncome']} ({stats['withNetIncome']/stats['total']*100:.1f}%)")
print(f"Failed: {stats['failed']} ({stats['failed']/stats['total']*100:.1f}%)")
print()

if surprise_stats['beats'] + surprise_stats['misses'] + surprise_stats['inline'] > 0:
    total_surprises = sum(surprise_stats.values())
    print("EPS SURPRISE DISTRIBUTION:")
    print(f"  Beats: {surprise_stats['beats']} ({surprise_stats['beats']/total_surprises*100:.1f}%)")
    print(f"  Misses: {surprise_stats['misses']} ({surprise_stats['misses']/total_surprises*100:.1f}%)")
    print(f"  Inline: {surprise_stats['inline']} ({surprise_stats['inline']/total_surprises*100:.1f}%)")
    print()

# Save enriched dataset
output_file = '/tmp/dataset-real-financials.json'
with open(output_file, 'w') as f:
    json.dump({
        'status': 'success',
        'method': 'SEC XBRL API',
        'collected': len(enriched_filings),
        'withFinancials': stats['withEPS'],
        'withSurprises': sum(surprise_stats.values()),
        'filings': enriched_filings,
        'stats': stats,
        'surpriseDistribution': surprise_stats
    }, f, indent=2)

print(f"✅ Saved dataset with real financials to: {output_file}")
print()
print("=" * 80)
print("NEXT STEPS")
print("=" * 80)
print("1. Run backtest with real financial data")
print("2. Compare accuracy to simulated features (65.1%)")
print("3. Expected: 65-70% direction accuracy with real data")
print("=" * 80)
