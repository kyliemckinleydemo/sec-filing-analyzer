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

      const prices: StockPrice[] = [];

      for (const [date, values] of Object.entries<any>(timeSeries)) {
        prices.push({
          date,
          open: parseFloat(values['1. open']),
          high: parseFloat(values['2. high']),
          low: parseFloat(values['3. low']),
          close: parseFloat(values['5. adjusted close']),
          volume: parseInt(values['6. volume']),
        });
      }

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
