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

  // Analyst ratings
  analystRatingCount?: number;
  analystBuyCount?: number;
  analystHoldCount?: number;
  analystSellCount?: number;

  // EPS estimates
  epsActual?: number;
  epsEstimateCurrentQ?: number;
  epsEstimateNextQ?: number;
  epsEstimateCurrentY?: number;
  epsEstimateNextY?: number;

  // Revenue estimates
  revenueEstimateCurrentQ?: number;
  revenueEstimateCurrentY?: number;

  // Additional metrics
  dividendYield?: number;
  beta?: number;
  volume?: number;
  averageVolume?: number;

  additionalData?: any;
}

export interface AnalystAction {
  date: Date;
  firm: string;
  actionType: string; // 'upgrade', 'downgrade', 'initiate', 'reiterate'
  fromGrade: string | null;
  toGrade: string | null;
  action: string | null;
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

      // Fetch additional data from quoteSummary (not available in basic quote)
      let beta: number | undefined = undefined;
      let targetMeanPrice: number | undefined = undefined;
      try {
        const summary = await yahooFinance.quoteSummary(ticker, {
          modules: ['summaryDetail', 'financialData']
        });
        beta = (summary.summaryDetail as any)?.beta;
        targetMeanPrice = (summary.financialData as any)?.targetMeanPrice;
      } catch (error: any) {
        console.log(`[Yahoo Finance] Could not fetch quoteSummary for ${ticker}: ${error.message}`);
      }

      // Validate earnings date is reasonable (between 1970 and 2100)
      let validEarningsDate: Date | undefined = undefined;
      if ((quote as any).earningsTimestamp) {
        const timestamp = (quote as any).earningsTimestamp;
        const date = new Date(timestamp * 1000);
        const year = date.getFullYear();
        if (year >= 1970 && year <= 2100) {
          validEarningsDate = date;
        } else {
          console.log(`[Yahoo Finance] Invalid earnings date for ${ticker}: ${date.toISOString()} (year ${year})`);
        }
      }

      const financials: CompanyFinancials = {
        ticker,
        marketCap: quote.marketCap,
        currentPrice: quote.regularMarketPrice,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        peRatio: quote.trailingPE,
        forwardPE: quote.forwardPE,
        analystTargetPrice: targetMeanPrice,
        earningsDate: validEarningsDate,

        // Analyst ratings
        analystRatingCount: (quote as any).averageAnalystRating ?
          ((quote as any).numberOfAnalystOpinions || 0) : undefined,
        analystBuyCount: undefined,  // Not directly available in quote endpoint
        analystHoldCount: undefined,
        analystSellCount: undefined,

        // EPS data
        epsActual: (quote as any).epsTrailingTwelveMonths,
        epsEstimateCurrentQ: (quote as any).epsCurrentYear,  // Best approximation available
        epsEstimateNextQ: undefined,  // Would need quoteSummary endpoint
        epsEstimateCurrentY: (quote as any).epsCurrentYear,
        epsEstimateNextY: (quote as any).epsForward,

        // Revenue estimates (not in basic quote endpoint)
        revenueEstimateCurrentQ: undefined,
        revenueEstimateCurrentY: undefined,

        // Additional metrics
        dividendYield: (quote as any).dividendYield,
        beta: beta,  // Fetched from quoteSummary
        volume: quote.regularMarketVolume,
        averageVolume: quote.averageDailyVolume10Day,

        additionalData: {
          shortName: quote.shortName,
          longName: quote.longName,
          trailingAnnualDividendRate: (quote as any).trailingAnnualDividendRate,
          averageAnalystRating: (quote as any).averageAnalystRating,
          numberOfAnalystOpinions: (quote as any).numberOfAnalystOpinions,
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

  /**
   * Get analyst upgrade/downgrade history
   * Returns recent analyst rating changes for a given ticker
   */
  async getAnalystActivity(ticker: string): Promise<AnalystAction[]> {
    try {
      console.log(`[Yahoo Finance] Fetching analyst activity for ${ticker}`);

      const yahooFinance = (await import('yahoo-finance2')).default;

      // Fetch upgrade/downgrade history using quoteSummary
      const summary = await yahooFinance.quoteSummary(ticker, {
        modules: ['upgradeDowngradeHistory']
      });

      const history = (summary as any).upgradeDowngradeHistory?.history || [];

      if (!history || history.length === 0) {
        console.log(`[Yahoo Finance] No analyst activity found for ${ticker}`);
        return [];
      }

      // Parse and normalize the analyst actions
      const actions: AnalystAction[] = history.map((item: any) => {
        // Determine action type from rating changes
        let actionType = 'reiterate';
        if (item.fromGrade && item.toGrade) {
          const fromGrade = this.normalizeRating(item.fromGrade);
          const toGrade = this.normalizeRating(item.toGrade);

          if (toGrade > fromGrade) {
            actionType = 'upgrade';
          } else if (toGrade < fromGrade) {
            actionType = 'downgrade';
          }
        } else if (item.toGrade && !item.fromGrade) {
          actionType = 'initiate';
        }

        // Handle date - yahoo-finance2 might already convert to Date object
        let date: Date;
        if (item.epochGradeDate instanceof Date) {
          date = item.epochGradeDate;
        } else if (typeof item.epochGradeDate === 'number') {
          // Assume seconds if number
          date = new Date(item.epochGradeDate * 1000);
        } else {
          // Fallback to current date
          date = new Date();
        }

        return {
          date,
          firm: item.firm || 'Unknown',
          actionType,
          fromGrade: item.fromGrade || null,
          toGrade: item.toGrade || null,
          action: item.action || null,
        };
      });

      console.log(`[Yahoo Finance] Found ${actions.length} analyst actions for ${ticker}`);
      return actions;

    } catch (error: any) {
      console.error(`[Yahoo Finance] Error fetching analyst activity for ${ticker}:`, error.message);
      return [];
    }
  }

  /**
   * Normalize analyst ratings to a numerical scale for comparison
   * Higher number = more bullish
   */
  private normalizeRating(rating: string): number {
    const normalized = rating.toLowerCase();

    // Strong Buy / Buy variations
    if (normalized.includes('strong buy') || normalized.includes('outperform') || normalized.includes('overweight')) {
      return 5;
    }
    if (normalized.includes('buy') || normalized.includes('positive')) {
      return 4;
    }
    // Hold / Neutral variations
    if (normalized.includes('hold') || normalized.includes('neutral') || normalized.includes('equal')) {
      return 3;
    }
    // Sell variations
    if (normalized.includes('underperform') || normalized.includes('underweight')) {
      return 2;
    }
    if (normalized.includes('sell') || normalized.includes('reduce')) {
      return 1;
    }

    // Default to neutral if can't parse
    return 3;
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
