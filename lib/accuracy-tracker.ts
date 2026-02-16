/**
 * Accuracy Tracker
 *
 * Compares predicted vs actual stock returns.
 * Updated for Alpha Model v1.0: tracks 30-day alpha (stock return minus S&P 500)
 * in addition to legacy 7-day return tracking.
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

export interface AlphaModelStats {
  totalPredictions: number;
  predictionsWithActuals: number;
  directionalAccuracy: number;        // % of LONG/SHORT signals correct
  highConfDirectionalAccuracy: number; // % of high-conf signals correct
  longShortSpread: number;            // avg LONG alpha - avg SHORT alpha (pp)
  avgLongAlpha: number;
  avgShortAlpha: number;
}

export class AccuracyTracker {
  /**
   * Check if enough time has passed and calculate actual vs predicted (legacy 7-day)
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

      console.log(`[Accuracy Tracker] Actual 7d return: ${actual7dReturn.toFixed(2)}%, predicted: ${predicted7dReturn.toFixed(2)}%`);

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
   * Check 30-day alpha accuracy for a filing.
   * Requires 35+ calendar days to have passed since filing.
   */
  async checkAlphaAccuracy(
    ticker: string,
    filingDate: Date,
    predicted30dAlpha: number
  ): Promise<{
    hasData: boolean;
    actual30dReturn?: number;
    actual30dAlpha?: number;
    spxReturn30d?: number;
    signalCorrect?: boolean;
    message?: string;
  }> {
    const now = new Date();
    const filingTime = new Date(filingDate);
    const daysElapsed = Math.floor(
      (now.getTime() - filingTime.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysElapsed < 35) {
      return {
        hasData: false,
        message: `Need to wait ${35 - daysElapsed} more days for 30-day alpha results`,
      };
    }

    try {
      // Fetch stock prices
      const prices = await yahooFinanceClient.getHistoricalPrices(ticker, '3mo');
      if (!prices || prices.length === 0) {
        return { hasData: false, message: 'Unable to fetch historical price data' };
      }

      const filingPrice = this.findPriceForDate(prices, filingTime);
      const filingPriceDate = this.findDateForDate(prices, filingTime);

      if (!filingPrice || !filingPriceDate) {
        return { hasData: false, message: 'Price data not available at filing date' };
      }

      // Find price 21 business days (approximately 30 calendar days) later
      const laterPrice = this.findPriceNBusinessDaysLater(prices, filingPriceDate, 21);
      if (!laterPrice) {
        return { hasData: false, message: 'Price data not available for 30 days after filing' };
      }

      const actual30dReturn = ((laterPrice - filingPrice) / filingPrice) * 100;

      // Fetch S&P 500 return for the same period
      let spxReturn30d = 0;
      try {
        const spxPrices = await yahooFinanceClient.getHistoricalPrices('SPY', '3mo');
        if (spxPrices && spxPrices.length > 0) {
          const spxFilingPrice = this.findPriceForDate(spxPrices, filingTime);
          const spxFilingDate = this.findDateForDate(spxPrices, filingTime);
          if (spxFilingPrice && spxFilingDate) {
            const spxLaterPrice = this.findPriceNBusinessDaysLater(spxPrices, spxFilingDate, 21);
            if (spxLaterPrice) {
              spxReturn30d = ((spxLaterPrice - spxFilingPrice) / spxFilingPrice) * 100;
            }
          }
        }
      } catch (spxError) {
        console.error('Error fetching SPX data for alpha calculation:', spxError);
      }

      const actual30dAlpha = actual30dReturn - spxReturn30d;

      // Check directional accuracy
      const predictedDirection = predicted30dAlpha > 0 ? 'LONG' : 'SHORT';
      const signalCorrect =
        (predictedDirection === 'LONG' && actual30dAlpha > 0) ||
        (predictedDirection === 'SHORT' && actual30dAlpha < 0);

      console.log(`[Accuracy Tracker] 30d alpha: actual=${actual30dAlpha.toFixed(2)}%, predicted=${predicted30dAlpha.toFixed(2)}%, correct=${signalCorrect}`);

      return {
        hasData: true,
        actual30dReturn,
        actual30dAlpha,
        spxReturn30d,
        signalCorrect,
      };
    } catch (error) {
      console.error('Error calculating alpha accuracy:', error);
      return { hasData: false, message: 'Error fetching price data' };
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

    const sorted = prices.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

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

    const sorted = prices.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

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

    const sorted = prices.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const startTime = startDate.getTime();
    const pricesAfterStart = sorted.filter(
      (p) => new Date(p.date).getTime() >= startTime
    );

    if (pricesAfterStart.length < businessDays + 1) {
      return null;
    }

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
   * Update filing with actual 30-day alpha
   */
  async updateActual30dAlpha(
    accessionNumber: string,
    actual30dReturn: number,
    actual30dAlpha: number
  ): Promise<void> {
    try {
      await prisma.filing.update({
        where: { accessionNumber },
        data: { actual30dReturn, actual30dAlpha },
      });
    } catch (error) {
      console.error('Error updating actual 30d alpha:', error);
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
   * Get overall model accuracy statistics (legacy 7-day)
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

  /**
   * Get alpha model accuracy statistics (30-day directional accuracy)
   */
  async getAlphaModelStats(): Promise<AlphaModelStats> {
    try {
      const filings = await prisma.filing.findMany({
        where: {
          predicted30dAlpha: { not: null },
          actual30dAlpha: { not: null },
        },
        select: {
          predicted30dAlpha: true,
          actual30dAlpha: true,
          predictionConfidence: true,
        },
      });

      const totalPredictions = await prisma.filing.count({
        where: { predicted30dAlpha: { not: null } },
      });

      const predictionsWithActuals = filings.length;

      if (predictionsWithActuals === 0) {
        return {
          totalPredictions,
          predictionsWithActuals: 0,
          directionalAccuracy: 0,
          highConfDirectionalAccuracy: 0,
          longShortSpread: 0,
          avgLongAlpha: 0,
          avgShortAlpha: 0,
        };
      }

      // Directional accuracy (all signals)
      const nonNeutral = filings.filter(f =>
        (f as any).predicted30dAlpha !== 0
      );

      let correctAll = 0;
      for (const f of nonNeutral) {
        const pred = (f as any).predicted30dAlpha;
        const actual = (f as any).actual30dAlpha;
        if ((pred > 0 && actual > 0) || (pred < 0 && actual < 0)) {
          correctAll++;
        }
      }

      // High confidence only (predictionConfidence >= 0.80)
      const highConf = nonNeutral.filter(f => f.predictionConfidence && f.predictionConfidence >= 0.80);
      let correctHighConf = 0;
      for (const f of highConf) {
        const pred = (f as any).predicted30dAlpha;
        const actual = (f as any).actual30dAlpha;
        if ((pred > 0 && actual > 0) || (pred < 0 && actual < 0)) {
          correctHighConf++;
        }
      }

      // Long/short alpha averages
      const longs = filings.filter(f => (f as any).predicted30dAlpha > 0);
      const shorts = filings.filter(f => (f as any).predicted30dAlpha < 0);

      const avgLongAlpha = longs.length > 0
        ? longs.reduce((sum, f) => sum + ((f as any).actual30dAlpha || 0), 0) / longs.length
        : 0;

      const avgShortAlpha = shorts.length > 0
        ? shorts.reduce((sum, f) => sum + ((f as any).actual30dAlpha || 0), 0) / shorts.length
        : 0;

      return {
        totalPredictions,
        predictionsWithActuals,
        directionalAccuracy: nonNeutral.length > 0 ? (correctAll / nonNeutral.length) * 100 : 0,
        highConfDirectionalAccuracy: highConf.length > 0 ? (correctHighConf / highConf.length) * 100 : 0,
        longShortSpread: avgLongAlpha - avgShortAlpha,
        avgLongAlpha,
        avgShortAlpha,
      };
    } catch (error) {
      console.error('Error getting alpha model stats:', error);
      return {
        totalPredictions: 0,
        predictionsWithActuals: 0,
        directionalAccuracy: 0,
        highConfDirectionalAccuracy: 0,
        longShortSpread: 0,
        avgLongAlpha: 0,
        avgShortAlpha: 0,
      };
    }
  }
}

// Export singleton
export const accuracyTracker = new AccuracyTracker();
