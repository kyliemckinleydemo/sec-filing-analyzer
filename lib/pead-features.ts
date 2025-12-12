/**
 * PEAD (Post-Earnings Announcement Drift) Feature Engineering
 *
 * Implements the quantitative features for predicting 7-day post-earnings returns:
 * - SUE (Standardized Unexpected Earnings)
 * - Guidance Delta
 * - Analyst Revision Momentum
 * - Relative Strength vs Sector
 * - Moving Average Proximity
 * - Interest Rate Sensitivity
 * - Beta-Adjusted Returns
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface PEADFeatures {
  // Core Earnings Surprise
  sue: number | null; // Standardized Unexpected Earnings
  epsActual: number | null;
  epsConsensus: number | null;
  epsBeat: number | null; // Raw beat amount

  // Guidance
  guidanceDelta: number | null; // % change in guidance midpoint
  guidanceShift: number; // -1 (lowered), 0 (maintained), 1 (raised)

  // Analyst Activity
  analystRevision30d: number | null; // % change in consensus over 30d
  consensusDispersion: number | null; // Std dev of estimates (uncertainty)
  analystUpgrade30d: number; // Net upgrades in last 30d

  // Relative Strength
  relativeStrength90d: number | null; // Stock vs sector performance (90d)
  sectorReturn90d: number | null;

  // Technical Indicators
  priceToMA50: number | null; // Distance from 50-day MA
  priceToMA200: number | null; // Distance from 200-day MA
  rsi14: number | null; // 14-day RSI

  // Macro Context
  interestRateSensitivity: number | null; // Correlation to 10Y Treasury
  yieldCurve: number | null; // 10Y - 2Y spread
  vix: number | null; // VIX level
  spxReturn7d: number | null; // Market momentum

  // Company Fundamentals
  marketCap: number | null;
  beta: number | null;
  peRatio: number | null;

  // Target Variable
  abnormalReturn7d: number | null; // Beta-adjusted 7-day return
  rawReturn7d: number | null; // Raw 7-day return
  marketReturn7d: number | null; // S&P 500 7-day return
}

export class PEADFeatureEngine {
  /**
   * Calculate SUE (Standardized Unexpected Earnings)
   *
   * Formula: SUE = (Actual EPS - Consensus EPS) / StdDev(Analyst Estimates)
   *
   * A SUE of +2.0 means the earnings beat was 2 standard deviations above expectations
   */
  async calculateSUE(
    ticker: string,
    earningsDate: Date,
    actualEPS: number
  ): Promise<{ sue: number | null; epsConsensus: number | null; consensusDispersion: number | null }> {
    // Get analyst estimates from the snapshot taken 1 day before earnings
    const snapshot = await prisma.companySnapshot.findFirst({
      where: {
        company: { ticker },
        snapshotDate: {
          gte: new Date(earningsDate.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days before
          lte: new Date(earningsDate.getTime() - 0 * 24 * 60 * 60 * 1000), // Day of
        },
      },
      orderBy: {
        snapshotDate: 'desc',
      },
    });

    if (!snapshot || !snapshot.epsEstimateCurrentQ) {
      return { sue: null, epsConsensus: null, consensusDispersion: null };
    }

    const epsConsensus = snapshot.epsEstimateCurrentQ;
    const epsSurprise = actualEPS - epsConsensus;

    // Calculate standard deviation from analyst ratings distribution
    // Estimate dispersion from analyst count and rating spread
    const totalAnalysts = snapshot.analystRatingCount || 0;
    const buyCount = snapshot.analystBuyCount || 0;
    const holdCount = snapshot.analystHoldCount || 0;
    const sellCount = snapshot.analystSellCount || 0;

    // Rough estimate of consensus variance
    // Higher disagreement = higher dispersion
    const ratingVariance = totalAnalysts > 0
      ? Math.sqrt(
          (Math.pow(buyCount / totalAnalysts - 0.33, 2) +
           Math.pow(holdCount / totalAnalysts - 0.33, 2) +
           Math.pow(sellCount / totalAnalysts - 0.33, 2)) /
            3
        )
      : 0.1;

    // Estimate EPS dispersion (typically 5-15% of consensus for large caps)
    const consensusDispersion = Math.abs(epsConsensus) * (0.05 + ratingVariance * 0.10);

    const sue = consensusDispersion > 0 ? epsSurprise / consensusDispersion : null;

    return {
      sue,
      epsConsensus,
      consensusDispersion,
    };
  }

  /**
   * Calculate Guidance Delta
   *
   * Formula: (New Guidance Midpoint - Old Consensus) / Old Consensus
   */
  async calculateGuidanceDelta(
    newGuidanceLow: number | null,
    newGuidanceHigh: number | null,
    oldConsensus: number
  ): Promise<number | null> {
    if (!newGuidanceLow || !newGuidanceHigh || !oldConsensus) {
      return null;
    }

    const newMidpoint = (newGuidanceLow + newGuidanceHigh) / 2;
    return ((newMidpoint - oldConsensus) / oldConsensus) * 100; // Return as percentage
  }

  /**
   * Calculate Analyst Revision Momentum
   *
   * Formula: (Consensus at T-1 - Consensus at T-30) / Price
   */
  async calculateAnalystRevisionMomentum(
    ticker: string,
    earningsDate: Date
  ): Promise<number | null> {
    const date30DaysAgo = new Date(earningsDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const date1DayAgo = new Date(earningsDate.getTime() - 1 * 24 * 60 * 60 * 1000);

    // Get snapshots at T-30 and T-1
    const snapshot30d = await prisma.companySnapshot.findFirst({
      where: {
        company: { ticker },
        snapshotDate: {
          gte: new Date(date30DaysAgo.getTime() - 3 * 24 * 60 * 60 * 1000),
          lte: new Date(date30DaysAgo.getTime() + 3 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: {
        snapshotDate: 'desc',
      },
    });

    const snapshot1d = await prisma.companySnapshot.findFirst({
      where: {
        company: { ticker },
        snapshotDate: {
          gte: new Date(date1DayAgo.getTime() - 1 * 24 * 60 * 60 * 1000),
          lte: new Date(date1DayAgo.getTime() + 1 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: {
        snapshotDate: 'desc',
      },
    });

    if (!snapshot30d?.epsEstimateCurrentQ || !snapshot1d?.epsEstimateCurrentQ || !snapshot1d?.currentPrice) {
      return null;
    }

    const revisionChange = snapshot1d.epsEstimateCurrentQ - snapshot30d.epsEstimateCurrentQ;
    return (revisionChange / snapshot1d.currentPrice) * 100; // As percentage of price
  }

  /**
   * Calculate Relative Strength (Stock vs Sector)
   */
  async calculateRelativeStrength(
    ticker: string,
    sector: string,
    earningsDate: Date,
    window: number = 90
  ): Promise<{ relativeStrength: number | null; sectorReturn: number | null }> {
    const date90DaysAgo = new Date(earningsDate.getTime() - window * 24 * 60 * 60 * 1000);

    // Get stock technical indicators
    const stockData = await prisma.technicalIndicators.findFirst({
      where: {
        ticker,
        date: {
          gte: new Date(earningsDate.getTime() - 2 * 24 * 60 * 60 * 1000),
          lte: earningsDate,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    if (!stockData?.return90d) {
      return { relativeStrength: null, sectorReturn: null };
    }

    // Get sector return from macro indicators
    const macro = await prisma.macroIndicators.findFirst({
      where: {
        date: {
          gte: new Date(earningsDate.getTime() - 2 * 24 * 60 * 60 * 1000),
          lte: earningsDate,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    const sectorFieldMap: Record<string, string> = {
      Technology: 'techSectorReturn30d',
      'Financial Services': 'financialSectorReturn30d',
      Energy: 'energySectorReturn30d',
      Healthcare: 'healthcareSectorReturn30d',
    };

    const sectorField = sectorFieldMap[sector];
    const sectorReturn = sectorField && macro ? (macro[sectorField as keyof typeof macro] as number | null) : null;

    if (sectorReturn === null) {
      return { relativeStrength: null, sectorReturn: null };
    }

    // Relative strength = Stock return - Sector return
    const relativeStrength = stockData.return90d - sectorReturn;

    return {
      relativeStrength,
      sectorReturn,
    };
  }

  /**
   * Calculate Moving Average Proximity
   */
  async calculateMAProximity(
    ticker: string,
    earningsDate: Date
  ): Promise<{ priceToMA50: number | null; priceToMA200: number | null }> {
    const technical = await prisma.technicalIndicators.findFirst({
      where: {
        ticker,
        date: {
          gte: new Date(earningsDate.getTime() - 2 * 24 * 60 * 60 * 1000),
          lte: earningsDate,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    return {
      priceToMA50: technical?.priceToMA50 || null,
      priceToMA200: technical?.priceToMA200 || null,
    };
  }

  /**
   * Calculate Interest Rate Sensitivity
   *
   * Correlation of stock to 10-Year Treasury Yield over last 90 days
   */
  async calculateInterestRateSensitivity(
    ticker: string,
    earningsDate: Date
  ): Promise<number | null> {
    const date90DaysAgo = new Date(earningsDate.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get stock prices
    const stockPrices = await prisma.stockPrice.findMany({
      where: {
        ticker,
        date: {
          gte: date90DaysAgo,
          lte: earningsDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Get treasury yields
    const treasuryData = await prisma.macroIndicators.findMany({
      where: {
        date: {
          gte: date90DaysAgo,
          lte: earningsDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    if (stockPrices.length < 30 || treasuryData.length < 30) {
      return null;
    }

    // Calculate daily returns
    const stockReturns: number[] = [];
    for (let i = 1; i < stockPrices.length; i++) {
      const ret = (stockPrices[i].close - stockPrices[i - 1].close) / stockPrices[i - 1].close;
      stockReturns.push(ret);
    }

    // Calculate treasury yield changes
    const yieldChanges: number[] = [];
    for (let i = 1; i < treasuryData.length; i++) {
      if (treasuryData[i].treasury10y && treasuryData[i - 1].treasury10y) {
        const change = treasuryData[i].treasury10y! - treasuryData[i - 1].treasury10y!;
        yieldChanges.push(change);
      }
    }

    if (stockReturns.length < 30 || yieldChanges.length < 30) {
      return null;
    }

    // Calculate Pearson correlation
    const correlation = this.pearsonCorrelation(
      stockReturns.slice(0, Math.min(stockReturns.length, yieldChanges.length)),
      yieldChanges.slice(0, Math.min(stockReturns.length, yieldChanges.length))
    );

    return correlation;
  }

  /**
   * Calculate Abnormal Return (Beta-Adjusted)
   *
   * Formula: Stock Return - (Beta × Market Return)
   */
  async calculateAbnormalReturn(
    stockReturn: number,
    marketReturn: number,
    beta: number
  ): Promise<number> {
    return stockReturn - beta * marketReturn;
  }

  /**
   * Get all PEAD features for a filing
   */
  async extractAllFeatures(
    ticker: string,
    earningsDate: Date,
    actualEPS: number,
    actualGuidanceLow: number | null,
    actualGuidanceHigh: number | null
  ): Promise<PEADFeatures> {
    // Get company data
    const company = await prisma.company.findUnique({
      where: { ticker },
    });

    // Get snapshot at earnings date
    const snapshot = await prisma.companySnapshot.findFirst({
      where: {
        company: { ticker },
        snapshotDate: {
          gte: new Date(earningsDate.getTime() - 2 * 24 * 60 * 60 * 1000),
          lte: earningsDate,
        },
      },
      orderBy: {
        snapshotDate: 'desc',
      },
    });

    // Get technical indicators
    const technical = await prisma.technicalIndicators.findFirst({
      where: {
        ticker,
        date: {
          gte: new Date(earningsDate.getTime() - 2 * 24 * 60 * 60 * 1000),
          lte: earningsDate,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    // Get macro indicators
    const macro = await prisma.macroIndicators.findFirst({
      where: {
        date: {
          gte: new Date(earningsDate.getTime() - 2 * 24 * 60 * 60 * 1000),
          lte: earningsDate,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    // Calculate SUE
    const { sue, epsConsensus, consensusDispersion } = await this.calculateSUE(ticker, earningsDate, actualEPS);

    // Calculate guidance delta
    const guidanceDelta = await this.calculateGuidanceDelta(
      actualGuidanceLow,
      actualGuidanceHigh,
      snapshot?.epsEstimateCurrentQ || 0
    );

    // Calculate analyst revision momentum
    const analystRevision30d = await this.calculateAnalystRevisionMomentum(ticker, earningsDate);

    // Calculate relative strength
    const { relativeStrength, sectorReturn } = await this.calculateRelativeStrength(
      ticker,
      company?.sector || 'Unknown',
      earningsDate
    );

    // Calculate MA proximity
    const { priceToMA50, priceToMA200 } = await this.calculateMAProximity(ticker, earningsDate);

    // Calculate interest rate sensitivity
    const interestRateSensitivity = await this.calculateInterestRateSensitivity(ticker, earningsDate);

    // Get 7-day forward returns
    const date7DaysLater = new Date(earningsDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const priceAtEarnings = snapshot?.currentPrice || null;
    const price7dLater = await this.getStockPrice(ticker, date7DaysLater);
    const rawReturn7d =
      priceAtEarnings && price7dLater ? ((price7dLater - priceAtEarnings) / priceAtEarnings) * 100 : null;

    // Get market return
    const marketReturn7d = macro?.spxReturn7d || null;

    // Calculate abnormal return
    const beta = company?.beta || 1.0;
    const abnormalReturn7d =
      rawReturn7d !== null && marketReturn7d !== null
        ? await this.calculateAbnormalReturn(rawReturn7d, marketReturn7d, beta)
        : null;

    // Net analyst upgrades (placeholder - needs AnalystActivity table populated)
    const analystUpgrade30d = 0; // TODO: Calculate from AnalystActivity table

    return {
      // Core Earnings
      sue,
      epsActual: actualEPS,
      epsConsensus,
      epsBeat: epsConsensus ? actualEPS - epsConsensus : null,

      // Guidance
      guidanceDelta,
      guidanceShift: guidanceDelta ? (guidanceDelta > 1 ? 1 : guidanceDelta < -1 ? -1 : 0) : 0,

      // Analyst
      analystRevision30d,
      consensusDispersion,
      analystUpgrade30d,

      // Relative Strength
      relativeStrength90d: relativeStrength,
      sectorReturn90d: sectorReturn,

      // Technical
      priceToMA50,
      priceToMA200,
      rsi14: technical?.rsi14 || null,

      // Macro
      interestRateSensitivity,
      yieldCurve: macro?.yieldCurve2y10y || null,
      vix: macro?.vixClose || null,
      spxReturn7d: macro?.spxReturn7d || null,

      // Fundamentals
      marketCap: company?.marketCap || null,
      beta,
      peRatio: company?.peRatio || null,

      // Target
      abnormalReturn7d,
      rawReturn7d,
      marketReturn7d,
    };
  }

  /**
   * Helper: Get stock price on a specific date (or nearest)
   */
  private async getStockPrice(ticker: string, date: Date): Promise<number | null> {
    const price = await prisma.stockPrice.findFirst({
      where: {
        ticker,
        date: {
          gte: new Date(date.getTime() - 3 * 24 * 60 * 60 * 1000),
          lte: new Date(date.getTime() + 3 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    return price?.close || null;
  }

  /**
   * Helper: Calculate Pearson correlation coefficient
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }
}

export const peadFeatureEngine = new PEADFeatureEngine();
