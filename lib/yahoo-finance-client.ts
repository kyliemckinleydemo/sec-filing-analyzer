/**
 * Yahoo Finance Stock Price Client
 *
 * Uses Yahoo Finance API v8 (unofficial but widely used)
 * No rate limits, free to use
 * More reliable than Alpha Vantage for high-volume apps
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

export interface CompanyFinancials {
  ticker: string;
  marketCap?: number;
  peRatio?: number;
  forwardPE?: number;
  currentPrice?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  analystTargetPrice?: number;
  earningsDate?: Date;
  additionalData?: any;
}

class YahooFinanceClient {
  private baseUrl = 'https://query1.finance.yahoo.com/v8/finance';

  /**
   * Get historical daily prices
   */
  async getHistoricalPrices(
    ticker: string,
    range: '1mo' | '3mo' | '6mo' | '1y' | '2y' = '3mo'
  ): Promise<StockPrice[]> {
    try {
      const period1 = Math.floor(Date.now() / 1000) - this.getRangeSeconds(range);
      const period2 = Math.floor(Date.now() / 1000);

      const url = `${this.baseUrl}/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Yahoo Finance API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.chart?.result?.[0]) {
        throw new Error(`No data found for ticker: ${ticker}`);
      }

      const result = data.chart.result[0];
      const timestamps = result.timestamp;
      const quotes = result.indicators.quote[0];

      if (!timestamps || !quotes) {
        throw new Error(`Invalid data structure for ticker: ${ticker}`);
      }

      const prices: StockPrice[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        // Skip if any required data is null
        if (quotes.close[i] === null || quotes.open[i] === null) {
          continue;
        }

        prices.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          open: quotes.open[i],
          high: quotes.high[i],
          low: quotes.low[i],
          close: quotes.close[i],
          volume: quotes.volume[i],
        });
      }

      // Sort by date descending (most recent first)
      prices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return prices;
    } catch (error) {
      console.error('Error fetching historical prices from Yahoo Finance:', error);
      throw error;
    }
  }

  /**
   * Get current quote
   */
  async getCurrentQuote(ticker: string): Promise<CurrentQuote> {
    try {
      const url = `${this.baseUrl}/quote?symbols=${ticker}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Yahoo Finance API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.quoteResponse?.result?.[0]) {
        throw new Error(`No quote data found for ticker: ${ticker}`);
      }

      const quote = data.quoteResponse.result[0];

      return {
        symbol: quote.symbol,
        price: quote.regularMarketPrice,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        timestamp: new Date(quote.regularMarketTime * 1000).toISOString(),
      };
    } catch (error) {
      console.error('Error fetching current quote from Yahoo Finance:', error);
      throw error;
    }
  }

  /**
   * Get company financials and key metrics using yahoo-finance2 library
   */
  async getCompanyFinancials(ticker: string): Promise<CompanyFinancials | null> {
    try {
      console.log(`[Yahoo Finance] Fetching company data for ${ticker}`);

      // Use yahoo-finance2 library (more reliable than raw API)
      const yahooFinance = (await import('yahoo-finance2')).default;
      const quote = await yahooFinance.quote(ticker);

      if (!quote) {
        console.log(`[Yahoo Finance] No data found for ${ticker}`);
        return null;
      }

      const financials: CompanyFinancials = {
        ticker,
        marketCap: quote.marketCap,
        currentPrice: quote.regularMarketPrice,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        peRatio: quote.trailingPE,
        forwardPE: quote.forwardPE,
        analystTargetPrice: (quote as any).targetMeanPrice, // Not in types but exists in API
        earningsDate: quote.earningsTimestamp ? new Date(quote.earningsTimestamp * 1000) : undefined,
        additionalData: {
          shortName: quote.shortName,
          longName: quote.longName,
          regularMarketVolume: quote.regularMarketVolume,
          averageVolume: quote.averageDailyVolume10Day,
          beta: quote.beta,
          dividendYield: quote.dividendYield,
          trailingAnnualDividendRate: quote.trailingAnnualDividendRate,
          epsTrailingTwelveMonths: quote.epsTrailingTwelveMonths,
          epsForward: quote.epsForward,
        }
      };

      console.log(`[Yahoo Finance] Successfully fetched data for ${ticker}`);
      return financials;

    } catch (error: any) {
      console.error(`[Yahoo Finance] Error fetching data for ${ticker}:`, error.message);
      return null;
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

  private getRangeSeconds(range: string): number {
    const ranges: Record<string, number> = {
      '1mo': 30 * 24 * 60 * 60,
      '3mo': 90 * 24 * 60 * 60,
      '6mo': 180 * 24 * 60 * 60,
      '1y': 365 * 24 * 60 * 60,
      '2y': 730 * 24 * 60 * 60,
    };
    return ranges[range] || ranges['3mo'];
  }
}

// Export singleton
export const yahooFinanceClient = new YahooFinanceClient();
