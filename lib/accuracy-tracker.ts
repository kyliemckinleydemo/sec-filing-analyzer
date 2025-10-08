/**
 * Accuracy Tracker
 *
 * Compares predicted vs actual stock returns after 7 days
 */

import { yahooFinanceClient } from './yahoo-finance-client';
import { prisma } from './prisma';

interface AccuracyResult {
  hasData: boolean;
  daysElapsed: number;
  predicted7dReturn: number;
  actual7dReturn?: number;
  error?: number;
  errorPercent?: number;
  accuracy?: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  message?: string;
}

export class AccuracyTracker {
  /**
   * Check if enough time has passed and calculate actual vs predicted
   */
  async checkAccuracy(
    ticker: string,
    filingDate: Date,
    predicted7dReturn: number
  ): Promise<AccuracyResult> {
    const now = new Date();
    const filingTime = new Date(filingDate);
    const daysElapsed = Math.floor(
      (now.getTime() - filingTime.getTime()) / (1000 * 60 * 60 * 24)
    );

    console.log(`[Accuracy Tracker] Checking accuracy for ${ticker}, filing ${filingDate.toISOString().split('T')[0]}, ${daysElapsed} days elapsed`);

    // Need at least 7 trading days (usually ~10 calendar days)
    if (daysElapsed < 10) {
      console.log(`[Accuracy Tracker] Not enough time passed (${daysElapsed}/10 days)`);
      return {
        hasData: false,
        daysElapsed,
        predicted7dReturn,
        message: `Need to wait ${10 - daysElapsed} more days for actual results`,
      };
    }

    try {
      // Get stock price at filing date and 7 trading days later
      console.log(`[Accuracy Tracker] Fetching historical prices for ${ticker}...`);
      const prices = await yahooFinanceClient.getHistoricalPrices(ticker, '3mo');

      if (!prices || prices.length === 0) {
        console.log(`[Accuracy Tracker] No price data returned`);
        return {
          hasData: false,
          daysElapsed,
          predicted7dReturn,
          message: 'Unable to fetch historical price data',
        };
      }

      console.log(`[Accuracy Tracker] Got ${prices.length} price data points`);

      // Find price closest to filing date
      const filingPrice = this.findPriceForDate(prices, filingTime);
      const filingPriceDate = this.findDateForDate(prices, filingTime);

      console.log(`[Accuracy Tracker] Filing price: $${filingPrice}, date: ${filingPriceDate?.toISOString().split('T')[0]}`);

      if (!filingPrice || !filingPriceDate) {
        console.log(`[Accuracy Tracker] Missing filing price or date`);
        return {
          hasData: false,
          daysElapsed,
          predicted7dReturn,
          message: 'Price data not available at filing date',
        };
      }

      // Find price exactly 7 business days after filing date
      const laterPrice = this.findPriceNBusinessDaysLater(
        prices,
        filingPriceDate,
        7
      );

      console.log(`[Accuracy Tracker] 7BD later price: $${laterPrice}`);

      if (!laterPrice) {
        console.log(`[Accuracy Tracker] Missing 7-business-day price`);
        return {
          hasData: false,
          daysElapsed,
          predicted7dReturn,
          message: 'Price data not available for 7 business days after filing',
        };
      }

      // Calculate actual return
      const actual7dReturn =
        ((laterPrice - filingPrice) / filingPrice) * 100;

      console.log(`[Accuracy Tracker] ✅ Actual 7d return: ${actual7dReturn.toFixed(2)}%, predicted: ${predicted7dReturn.toFixed(2)}%`);

      // Calculate error
      const error = Math.abs(actual7dReturn - predicted7dReturn);
      const errorPercent = (error / Math.abs(actual7dReturn || 1)) * 100;

      // Determine accuracy level
      let accuracy: 'Excellent' | 'Good' | 'Fair' | 'Poor';
      if (error < 1) {
        accuracy = 'Excellent';
      } else if (error < 2) {
        accuracy = 'Good';
      } else if (error < 4) {
        accuracy = 'Fair';
      } else {
        accuracy = 'Poor';
      }

      return {
        hasData: true,
        daysElapsed,
        predicted7dReturn,
        actual7dReturn,
        error,
        errorPercent,
        accuracy,
        message: `Prediction was ${accuracy.toLowerCase()} (${error.toFixed(2)}% error)`,
      };
    } catch (error) {
      console.error('Error calculating accuracy:', error);
      return {
        hasData: false,
        daysElapsed,
        predicted7dReturn,
        message: 'Error fetching price data',
      };
    }
  }

  /**
   * Find the price closest to a given date
   */
  private findPriceForDate(
    prices: Array<{ date: string; close: number }>,
    targetDate: Date
  ): number | null {
    if (prices.length === 0) return null;

    // Sort by date
    const sorted = prices.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Find closest date
    let closest = sorted[0];
    let minDiff = Math.abs(
      new Date(sorted[0].date).getTime() - targetDate.getTime()
    );

    for (const price of sorted) {
      const diff = Math.abs(
        new Date(price.date).getTime() - targetDate.getTime()
      );
      if (diff < minDiff) {
        minDiff = diff;
        closest = price;
      }
    }

    return closest.close;
  }

  /**
   * Find the date closest to a given date
   */
  private findDateForDate(
    prices: Array<{ date: string; close: number }>,
    targetDate: Date
  ): Date | null {
    if (prices.length === 0) return null;

    // Sort by date
    const sorted = prices.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Find closest date
    let closest = sorted[0];
    let minDiff = Math.abs(
      new Date(sorted[0].date).getTime() - targetDate.getTime()
    );

    for (const price of sorted) {
      const diff = Math.abs(
        new Date(price.date).getTime() - targetDate.getTime()
      );
      if (diff < minDiff) {
        minDiff = diff;
        closest = price;
      }
    }

    return new Date(closest.date);
  }

  /**
   * Find price N business days after a given date
   */
  private findPriceNBusinessDaysLater(
    prices: Array<{ date: string; close: number }>,
    startDate: Date,
    businessDays: number
  ): number | null {
    if (prices.length === 0) return null;

    // Sort by date ascending
    const sorted = prices.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Find the starting point
    const startTime = startDate.getTime();
    const pricesAfterStart = sorted.filter(
      (p) => new Date(p.date).getTime() >= startTime
    );

    if (pricesAfterStart.length < businessDays + 1) {
      return null; // Not enough data
    }

    // The Nth business day is just the Nth entry after the start date
    // (Yahoo Finance only returns business days)
    return pricesAfterStart[businessDays].close;
  }

  /**
   * Update filing with actual return after 7 days
   */
  async updateActualReturn(
    accessionNumber: string,
    actual7dReturn: number
  ): Promise<void> {
    try {
      await prisma.filing.update({
        where: { accessionNumber },
        data: { actual7dReturn },
      });
    } catch (error) {
      console.error('Error updating actual return:', error);
    }
  }

  /**
   * Get accuracy label from error percentage
   */
  getAccuracyLabel(errorPercent: number): 'Excellent' | 'Good' | 'Fair' | 'Poor' {
    if (errorPercent < 5) return 'Excellent';
    if (errorPercent < 15) return 'Good';
    if (errorPercent < 30) return 'Fair';
    return 'Poor';
  }

  /**
   * Get overall model accuracy statistics
   */
  async getModelStats(): Promise<{
    totalPredictions: number;
    predictionsWithActuals: number;
    averageError: number;
    accuracy: { excellent: number; good: number; fair: number; poor: number };
  }> {
    try {
      const filings = await prisma.filing.findMany({
        where: {
          predicted7dReturn: { not: null },
        },
        select: {
          predicted7dReturn: true,
          actual7dReturn: true,
        },
      });

      const totalPredictions = filings.length;
      const withActuals = filings.filter((f) => f.actual7dReturn !== null);
      const predictionsWithActuals = withActuals.length;

      if (predictionsWithActuals === 0) {
        return {
          totalPredictions,
          predictionsWithActuals: 0,
          averageError: 0,
          accuracy: { excellent: 0, good: 0, fair: 0, poor: 0 },
        };
      }

      let totalError = 0;
      const accuracy = { excellent: 0, good: 0, fair: 0, poor: 0 };

      for (const filing of withActuals) {
        const error = Math.abs(
          (filing.actual7dReturn || 0) - (filing.predicted7dReturn || 0)
        );
        totalError += error;

        if (error < 1) accuracy.excellent++;
        else if (error < 2) accuracy.good++;
        else if (error < 4) accuracy.fair++;
        else accuracy.poor++;
      }

      return {
        totalPredictions,
        predictionsWithActuals,
        averageError: totalError / predictionsWithActuals,
        accuracy,
      };
    } catch (error) {
      console.error('Error getting model stats:', error);
      return {
        totalPredictions: 0,
        predictionsWithActuals: 0,
        averageError: 0,
        accuracy: { excellent: 0, good: 0, fair: 0, poor: 0 },
      };
    }
  }
}

// Export singleton
export const accuracyTracker = new AccuracyTracker();
