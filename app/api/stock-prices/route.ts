import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Fetch stock price data for a given ticker around a filing date
 * Returns daily prices from 30 days before to 30 days after the filing
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const filingDate = searchParams.get('filingDate');

    if (!ticker || !filingDate) {
      return NextResponse.json(
        { error: 'Missing ticker or filingDate parameter' },
        { status: 400 }
      );
    }

    console.log(`[Stock Prices API] Fetching data for ${ticker} around ${filingDate}`);

    // Calculate date range (30 days before/after filing)
    const filing = new Date(filingDate);
    const startDate = new Date(filing);
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date(filing);
    endDate.setDate(endDate.getDate() + 30);

    // Format dates for yfinance (YYYY-MM-DD)
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const filingStr = filing.toISOString().split('T')[0];

    console.log(`[Stock Prices API] Date range: ${startStr} to ${endStr}`);

    // Create Python script to fetch stock data
    const pythonScript = `
import yfinance as yf
import json
from datetime import datetime, timedelta

ticker = "${ticker}"
spy_ticker = "SPY"
start_date = "${startStr}"
end_date = "${endStr}"
filing_date = "${filingStr}"

# Fetch stock data
stock = yf.Ticker(ticker)
stock_data = stock.history(start=start_date, end=end_date)

# Fetch SPY (S&P 500) data for comparison
spy = yf.Ticker(spy_ticker)
spy_data = spy.history(start=start_date, end=end_date)

# Find filing date price for normalization
filing_datetime = datetime.strptime(filing_date, '%Y-%m-%d')

# Get closest price to filing date
stock_filing_price = None
spy_filing_price = None

for date_str in stock_data.index:
    date = date_str.to_pydatetime().replace(tzinfo=None)
    if date <= filing_datetime and (stock_filing_price is None or date > filing_datetime):
        stock_filing_price = stock_data.loc[date_str]['Close']

for date_str in spy_data.index:
    date = date_str.to_pydatetime().replace(tzinfo=None)
    if date <= filing_datetime and (spy_filing_price is None or date > filing_datetime):
        spy_filing_price = spy_data.loc[date_str]['Close']

# Build result
result = {
    "ticker": ticker,
    "filingDate": filing_date,
    "prices": []
}

# Combine stock and SPY data
for date_str in stock_data.index:
    date = date_str.to_pydatetime().replace(tzinfo=None)
    date_formatted = date.strftime('%Y-%m-%d')

    stock_price = float(stock_data.loc[date_str]['Close'])

    # Calculate percentage change from filing date
    stock_pct_change = ((stock_price - stock_filing_price) / stock_filing_price * 100) if stock_filing_price else 0

    # Get SPY data for this date if available
    spy_pct_change = 0
    if date_str in spy_data.index and spy_filing_price:
        spy_price = float(spy_data.loc[date_str]['Close'])
        spy_pct_change = ((spy_price - spy_filing_price) / spy_filing_price * 100)

    result["prices"].append({
        "date": date_formatted,
        "price": round(stock_price, 2),
        "pctChange": round(stock_pct_change, 2),
        "spyPctChange": round(spy_pct_change, 2),
        "isFilingDate": date_formatted == filing_date
    })

print(json.dumps(result))
`;

    // Execute Python script
    const { stdout, stderr } = await execAsync(
      `python3 -c ${JSON.stringify(pythonScript)}`,
      { timeout: 30000 }
    );

    if (stderr && !stderr.includes('FutureWarning')) {
      console.error(`[Stock Prices API] Python stderr:`, stderr);
    }

    const result = JSON.parse(stdout);
    console.log(`[Stock Prices API] Fetched ${result.prices.length} data points`);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Stock Prices API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stock prices' },
      { status: 500 }
    );
  }
}
