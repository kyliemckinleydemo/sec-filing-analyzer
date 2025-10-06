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

    // Need at least 7 trading days (usually ~10 calendar days)
    if (daysElapsed < 10) {
      return {
        hasData: false,
        daysElapsed,
        predicted7dReturn,
        message: `Need to wait ${10 - daysElapsed} more days for actual results`,
      };
    }

    try {
      // Get stock price at filing date and 7 trading days later
      const prices = await yahooFinanceClient.getHistoricalPrices(ticker, '3mo');

      if (!prices || prices.length === 0) {
        return {
          hasData: false,
          daysElapsed,
          predicted7dReturn,
          message: 'Unable to fetch historical price data',
        };
      }

      // Find price closest to filing date
      const filingPrice = this.findPriceForDate(prices, filingTime);

      // Find price 7 trading days later (approximately 10 calendar days)
      const targetDate = new Date(filingTime);
      targetDate.setDate(targetDate.getDate() + 10);
      const laterPrice = this.findPriceForDate(prices, targetDate);

      if (!filingPrice || !laterPrice) {
        return {
          hasData: false,
          daysElapsed,
          predicted7dReturn,
          message: 'Price data not available for comparison period',
        };
      }

      // Calculate actual return
      const actual7dReturn =
        ((laterPrice - filingPrice) / filingPrice) * 100;

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
