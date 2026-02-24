/**
 * @module lib/stock-client
 * @description HTTP client for Alpha Vantage stock market API providing historical price data, current quotes, and return calculations with rate limit handling
 *
 * PURPOSE:
 * - Fetch daily historical OHLCV (open/high/low/close/volume) stock prices via TIME_SERIES_DAILY_ADJUSTED endpoint
 * - Retrieve real-time stock quotes with price, change, and percent change via GLOBAL_QUOTE endpoint
 * - Calculate 7-day return percentage from a specific date using sorted historical prices
 * - Handle Alpha Vantage API errors including rate limits (25 calls/day free tier, 5 calls/minute)
 *
 * EXPORTS:
 * - StockPrice (interface) - Daily stock data shape with date, OHLCV values, and volume
 * - CurrentQuote (interface) - Real-time quote shape with symbol, price, change, changePercent, and timestamp
 * - stockClient (const) - Singleton StockClient instance configured with ALPHA_VANTAGE_API_KEY from environment
 *
 * PATTERNS:
 * - Import singleton: import { stockClient } from '@/lib/stock-client'
 * - Fetch recent prices: const prices = await stockClient.getHistoricalPrices('AAPL', 'compact') // last 100 days
 * - Get current quote: const quote = await stockClient.getCurrentQuote('AAPL')
 * - Calculate return: const return7d = stockClient.calculate7DayReturn(prices, '2024-01-01')
 * - Handle rate limits: Wrap calls in try/catch to detect 'API rate limit exceeded' errors
 *
 * CLAUDE NOTES:
 * - Uses 'demo' API key as fallback if ALPHA_VANTAGE_API_KEY environment variable missing
 * - Historical prices automatically sorted descending (most recent first) after fetching
 * - Returns adjusted close price (field '5. adjusted close') which accounts for splits and dividends
 * - calculate7DayReturn returns null when insufficient data exists 7 days after specified date
 * - API responses checked for three error states: HTTP status, 'Error Message' field, and 'Note' field for rate limits
 */
/**
 * Stock Price Client using Alpha Vantage API
 *
 * Free tier: 25 API calls/day, 5 calls/minute
 * Premium tier: 75-1200 calls/minute depending on plan
 *
 * Reference: https://www.alphavantage.co/documentation/
 */

export interface StockPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CurrentQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

class StockClient {
  private baseUrl = 'https://www.alphavantage.co/query';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
  }

  private async makeRequest(params: Record<string, string>): Promise<any> {
    const url = new URL(this.baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    url.searchParams.append('apikey', this.apiKey);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status}`);
    }

    const data = await response.json();

    // Check for API errors
    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }

    if (data['Note']) {
      // Rate limit message
      throw new Error('API rate limit exceeded. Please try again later.');
    }

    return data;
  }

  async getHistoricalPrices(
    ticker: string,
    outputSize: 'compact' | 'full' = 'compact'
  ): Promise<StockPrice[]> {
    try {
      const data = await this.makeRequest({
        function: 'TIME_SERIES_DAILY_ADJUSTED',
        symbol: ticker,
        outputsize: outputSize, // compact = last 100 days, full = 20+ years
      });

      const timeSeries = data['Time Series (Daily)'];

      if (!timeSeries) {
        throw new Error(`No data found for ticker: ${ticker}`);
      }

      const timeSeriesEntries = Object.entries<any>(timeSeries);
      const prices: StockPrice[] = timeSeriesEntries.map(([date, values]) => ({
        date,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['5. adjusted close']),
        volume: parseInt(values['6. volume']),
      }));

      // Sort by date descending (most recent first)
      prices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return prices;
    } catch (error) {
      console.error('Error fetching historical prices:', error);
      throw error;
    }
  }

  async getCurrentQuote(ticker: string): Promise<CurrentQuote> {
    try {
      const data = await this.makeRequest({
        function: 'GLOBAL_QUOTE',
        symbol: ticker,
      });

      const quote = data['Global Quote'];

      if (!quote || !quote['05. price']) {
        throw new Error(`No quote data found for ticker: ${ticker}`);
      }

      return {
        symbol: quote['01. symbol'],
        price: parseFloat(quote['05. price']),
        change: parseFloat(quote['09. change']),
        changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
        timestamp: quote['07. latest trading day'],
      };
    } catch (error) {
      console.error('Error fetching current quote:', error);
      throw error;
    }
  }

  /**
   * Calculate 7-day return after a specific date
   */
  calculate7DayReturn(prices: StockPrice[], afterDate: string): number | null {
    const sortedPrices = [...prices].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const startIndex = sortedPrices.findIndex(
      p => new Date(p.date) >= new Date(afterDate)
    );

    if (startIndex === -1 || startIndex + 7 >= sortedPrices.length) {
      return null; // Not enough data
    }

    const startPrice = sortedPrices[startIndex].close;
    const endPrice = sortedPrices[startIndex + 7].close;

    return ((endPrice - startPrice) / startPrice) * 100;
  }
}

// Export singleton
export const stockClient = new StockClient();