import { prisma } from './prisma';
import yahooFinance from 'yahoo-finance2';

/**
 * Paper Trading Engine
 *
 * Executes theoretical trades based on ML model predictions
 * - Opens positions when new filings are analyzed
 * - Closes positions after 7-day hold period
 * - Tracks performance metrics
 */

export interface TradeSignal {
  ticker: string;
  filingId: string;
  predictedReturn: number;
  confidence: number;
  direction: 'LONG' | 'SHORT';
  marketCap?: number;
}

export interface TradeExecutionResult {
  success: boolean;
  tradeId?: string;
  reason?: string;
  details?: any;
}

export class PaperTradingEngine {
  private portfolioId: string;

  constructor(portfolioId: string) {
    this.portfolioId = portfolioId;
  }

  /**
   * Evaluate if we should trade based on model prediction
   */
  async evaluateTradeSignal(signal: TradeSignal): Promise<boolean> {
    const portfolio = await prisma.paperPortfolio.findUnique({
      where: { id: this.portfolioId }
    });

    if (!portfolio || !portfolio.isActive) {
      return false;
    }

    // Check confidence threshold
    if (signal.confidence < portfolio.minConfidence) {
      console.log(`[Paper Trading] Signal rejected: confidence ${signal.confidence} < ${portfolio.minConfidence}`);
      return false;
    }

    // Check if we already have a position in this ticker
    const existingPosition = await prisma.paperTrade.findFirst({
      where: {
        portfolioId: this.portfolioId,
        ticker: signal.ticker,
        status: 'OPEN'
      }
    });

    if (existingPosition) {
      console.log(`[Paper Trading] Signal rejected: already have open position in ${signal.ticker}`);
      return false;
    }

    // Check predicted return magnitude
    // Only trade if predicted return > 2% (worthwhile vs transaction costs)
    if (Math.abs(signal.predictedReturn) < 2.0) {
      console.log(`[Paper Trading] Signal rejected: predicted return ${signal.predictedReturn}% too small`);
      return false;
    }

    return true;
  }

  /**
   * Execute a trade (open new position)
   */
  async executeTrade(signal: TradeSignal): Promise<TradeExecutionResult> {
    try {
      const portfolio = await prisma.paperPortfolio.findUnique({
        where: { id: this.portfolioId }
      });

      if (!portfolio) {
        return { success: false, reason: 'Portfolio not found' };
      }

      // Get the filing to determine filing date
      const filing = await prisma.filing.findUnique({
        where: { id: signal.filingId }
      });

      if (!filing) {
        return { success: false, reason: 'Filing not found' };
      }

      // Calculate next trading day after filing (filing usually happens after market close)
      const filingDate = new Date(filing.filingDate);
      const nextTradingDay = new Date(filingDate);
      nextTradingDay.setDate(nextTradingDay.getDate() + 1);

      // If filing was on Friday, next trading day is Monday (+3 days)
      if (nextTradingDay.getDay() === 6) { // Saturday
        nextTradingDay.setDate(nextTradingDay.getDate() + 2);
      } else if (nextTradingDay.getDay() === 0) { // Sunday
        nextTradingDay.setDate(nextTradingDay.getDate() + 1);
      }

      // Get opening price from the next trading day
      // Try to fetch historical price first, fall back to current price for recent filings
      let entryPrice: number | null = null;

      try {
        // For historical filings, fetch the actual opening price from that day
        const startDate = new Date(nextTradingDay);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(nextTradingDay);
        endDate.setHours(23, 59, 59, 999);

        const historicalData = await yahooFinance.chart(signal.ticker, {
          period1: startDate,
          period2: endDate,
          interval: '1d'
        });

        if (historicalData.quotes && historicalData.quotes.length > 0) {
          entryPrice = historicalData.quotes[0].open || null;
          console.log(`[Paper Trading] Using historical opening price for ${signal.ticker} on ${nextTradingDay.toDateString()}: $${entryPrice}`);
        }
      } catch (error) {
        console.log(`[Paper Trading] Could not fetch historical price, falling back to current price`);
      }

      // If historical price not available, use current price (for recent filings)
      if (!entryPrice) {
        const quote = await yahooFinance.quote(signal.ticker);
        entryPrice = quote.regularMarketPrice || null;
        console.log(`[Paper Trading] Using current market price for ${signal.ticker}: $${entryPrice}`);
      }

      if (!entryPrice) {
        return { success: false, reason: 'Could not fetch entry price' };
      }

      // Calculate position size
      // Use Kelly Criterion simplified: size = confidence * predictedReturn / 100
      // But cap at maxPositionSize (default 10% of portfolio)
      const kellySize = (signal.confidence * Math.abs(signal.predictedReturn)) / 100;
      const positionSize = Math.min(kellySize, portfolio.maxPositionSize);
      const positionValue = portfolio.totalValue * positionSize;

      // Check if we have enough cash
      if (positionValue > portfolio.currentCash) {
        return { success: false, reason: 'Insufficient cash' };
      }

      // Calculate shares (round down to whole shares)
      const shares = Math.floor(positionValue / entryPrice);
      const actualPositionValue = shares * entryPrice;

      // Realistic commission: $1 per trade (or free with some brokers)
      const commission = 1.00;

      // Create trade record
      const trade = await prisma.paperTrade.create({
        data: {
          portfolioId: this.portfolioId,
          ticker: signal.ticker,
          filingId: signal.filingId,
          direction: signal.direction,
          entryDate: nextTradingDay, // Entry date is next trading day after filing
          entryPrice: entryPrice,
          shares: shares,
          entryValue: actualPositionValue,
          predictedReturn: signal.predictedReturn,
          confidence: signal.confidence,
          status: 'OPEN',
          entryCommission: commission,
          notes: `Opened at market open on ${nextTradingDay.toDateString()} (day after filing ${filing.filingDate.toDateString()}) based on ${signal.predictedReturn > 0 ? 'positive' : 'negative'} prediction (${signal.predictedReturn.toFixed(2)}%) with ${(signal.confidence * 100).toFixed(1)}% confidence`
        }
      });

      // Update portfolio cash
      await prisma.paperPortfolio.update({
        where: { id: this.portfolioId },
        data: {
          currentCash: portfolio.currentCash - actualPositionValue - commission,
          totalTrades: portfolio.totalTrades + 1
        }
      });

      console.log(`[Paper Trading] Opened ${signal.direction} position: ${shares} shares of ${signal.ticker} @ $${entryPrice.toFixed(2)} (market open ${nextTradingDay.toDateString()})`);

      return {
        success: true,
        tradeId: trade.id,
        details: {
          ticker: signal.ticker,
          shares,
          entryPrice: entryPrice,
          entryDate: nextTradingDay,
          positionValue: actualPositionValue,
          commission
        }
      };

    } catch (error: any) {
      console.error('[Paper Trading] Error executing trade:', error);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Close a trade (exit position)
   */
  async closeTrade(tradeId: string, reason: string = '7-day hold period complete'): Promise<TradeExecutionResult> {
    try {
      const trade = await prisma.paperTrade.findUnique({
        where: { id: tradeId }
      });

      if (!trade || trade.status !== 'OPEN') {
        return { success: false, reason: 'Trade not found or already closed' };
      }

      // Get current price
      const quote = await yahooFinance.quote(trade.ticker);
      const currentPrice = quote.regularMarketPrice;

      if (!currentPrice) {
        return { success: false, reason: 'Could not fetch current price' };
      }

      const exitValue = trade.shares * currentPrice;
      const commission = 1.00;

      // Calculate P&L (account for direction)
      let realizedPnL: number;
      if (trade.direction === 'LONG') {
        realizedPnL = exitValue - trade.entryValue - trade.entryCommission - commission;
      } else {
        // SHORT: profit when price goes down
        realizedPnL = trade.entryValue - exitValue - trade.entryCommission - commission;
      }

      const realizedPnLPct = (realizedPnL / trade.entryValue) * 100;

      // Calculate actual return (for comparison to prediction)
      const actualReturn = trade.direction === 'LONG'
        ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;

      // Update trade record
      await prisma.paperTrade.update({
        where: { id: tradeId },
        data: {
          exitDate: new Date(),
          exitPrice: currentPrice,
          exitValue: exitValue,
          realizedPnL: realizedPnL,
          realizedPnLPct: realizedPnLPct,
          actualReturn: actualReturn,
          exitCommission: commission,
          status: 'CLOSED',
          notes: trade.notes + ` | Closed: ${reason}. Predicted: ${trade.predictedReturn.toFixed(2)}%, Actual: ${actualReturn.toFixed(2)}%`
        }
      });

      // Update portfolio
      const portfolio = await prisma.paperPortfolio.findUnique({
        where: { id: this.portfolioId }
      });

      if (portfolio) {
        const newCash = portfolio.currentCash + exitValue - commission;
        const isWin = realizedPnL > 0;

        await prisma.paperPortfolio.update({
          where: { id: this.portfolioId },
          data: {
            currentCash: newCash,
            winningTrades: isWin ? portfolio.winningTrades + 1 : portfolio.winningTrades,
            losingTrades: isWin ? portfolio.losingTrades : portfolio.losingTrades + 1
          }
        });
      }

      console.log(`[Paper Trading] Closed ${trade.direction} position: ${trade.shares} shares of ${trade.ticker} @ $${currentPrice.toFixed(2)}`);
      console.log(`[Paper Trading] P&L: $${realizedPnL.toFixed(2)} (${realizedPnLPct.toFixed(2)}%) | Predicted: ${trade.predictedReturn.toFixed(2)}% | Actual: ${actualReturn.toFixed(2)}%`);

      return {
        success: true,
        details: {
          ticker: trade.ticker,
          entryPrice: trade.entryPrice,
          exitPrice: currentPrice,
          realizedPnL,
          realizedPnLPct,
          predictedReturn: trade.predictedReturn,
          actualReturn
        }
      };

    } catch (error: any) {
      console.error('[Paper Trading] Error closing trade:', error);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Close all positions that have been open for 7+ days
   */
  async closeExpiredPositions(): Promise<number> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const expiredTrades = await prisma.paperTrade.findMany({
      where: {
        portfolioId: this.portfolioId,
        status: 'OPEN',
        entryDate: {
          lte: sevenDaysAgo
        }
      }
    });

    console.log(`[Paper Trading] Found ${expiredTrades.length} positions to close (7-day hold complete)`);

    let closed = 0;
    for (const trade of expiredTrades) {
      const result = await this.closeTrade(trade.id, '7-day hold period complete');
      if (result.success) {
        closed++;
      }
    }

    return closed;
  }

  /**
   * Update portfolio metrics
   */
  async updatePortfolioMetrics(): Promise<void> {
    const portfolio = await prisma.paperPortfolio.findUnique({
      where: { id: this.portfolioId },
      include: {
        trades: {
          where: { status: 'OPEN' }
        }
      }
    });

    if (!portfolio) return;

    // Calculate current value of open positions
    let openPositionsValue = 0;
    for (const trade of portfolio.trades) {
      try {
        const quote = await yahooFinance.quote(trade.ticker);
        const currentPrice = quote.regularMarketPrice;
        if (currentPrice) {
          openPositionsValue += trade.shares * currentPrice;
        }
      } catch (error) {
        // If we can't get price, use entry value
        openPositionsValue += trade.entryValue;
      }
    }

    const totalValue = portfolio.currentCash + openPositionsValue;
    const totalReturn = ((totalValue - portfolio.startingCapital) / portfolio.startingCapital) * 100;

    // Calculate win rate
    const completedTrades = portfolio.winningTrades + portfolio.losingTrades;
    const winRate = completedTrades > 0
      ? (portfolio.winningTrades / completedTrades) * 100
      : 0;

    // Update portfolio
    await prisma.paperPortfolio.update({
      where: { id: this.portfolioId },
      data: {
        totalValue,
        totalReturn,
        winRate
      }
    });

    // Create daily snapshot
    await prisma.portfolioSnapshot.upsert({
      where: {
        portfolioId_date: {
          portfolioId: this.portfolioId,
          date: new Date(new Date().setHours(0, 0, 0, 0))
        }
      },
      create: {
        portfolioId: this.portfolioId,
        date: new Date(new Date().setHours(0, 0, 0, 0)),
        totalValue,
        cashBalance: portfolio.currentCash,
        positionsValue: openPositionsValue,
        cumulativeReturn: totalReturn,
        cumulativePnL: totalValue - portfolio.startingCapital,
        openPositions: portfolio.trades.length
      },
      update: {
        totalValue,
        cashBalance: portfolio.currentCash,
        positionsValue: openPositionsValue,
        cumulativeReturn: totalReturn,
        cumulativePnL: totalValue - portfolio.startingCapital,
        openPositions: portfolio.trades.length
      }
    });
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary() {
    const portfolio = await prisma.paperPortfolio.findUnique({
      where: { id: this.portfolioId },
      include: {
        trades: {
          where: { status: 'OPEN' },
          orderBy: { entryDate: 'desc' }
        }
      }
    });

    if (!portfolio) return null;

    // Get open positions with current prices
    const openPositions = await Promise.all(
      portfolio.trades.map(async (trade) => {
        try {
          const quote = await yahooFinance.quote(trade.ticker);
          const currentPrice = quote.regularMarketPrice || trade.entryPrice;
          const currentValue = trade.shares * currentPrice;
          const unrealizedPnL = trade.direction === 'LONG'
            ? currentValue - trade.entryValue
            : trade.entryValue - currentValue;
          const unrealizedPnLPct = (unrealizedPnL / trade.entryValue) * 100;

          return {
            ...trade,
            currentPrice,
            currentValue,
            unrealizedPnL,
            unrealizedPnLPct,
            daysHeld: Math.floor((Date.now() - trade.entryDate.getTime()) / (1000 * 60 * 60 * 24))
          };
        } catch (error) {
          return {
            ...trade,
            currentPrice: trade.entryPrice,
            currentValue: trade.entryValue,
            unrealizedPnL: 0,
            unrealizedPnLPct: 0,
            daysHeld: Math.floor((Date.now() - trade.entryDate.getTime()) / (1000 * 60 * 60 * 24))
          };
        }
      })
    );

    // Get recent closed trades
    const recentTrades = await prisma.paperTrade.findMany({
      where: {
        portfolioId: this.portfolioId,
        status: 'CLOSED'
      },
      orderBy: { exitDate: 'desc' },
      take: 10
    });

    return {
      portfolio,
      openPositions,
      recentTrades
    };
  }
}

/**
 * Initialize a new paper trading portfolio
 */
export async function createPaperPortfolio(
  name: string = 'Main Portfolio',
  startingCapital: number = 100000.00,
  settings?: {
    maxPositionSize?: number;
    minConfidence?: number;
  }
): Promise<string> {
  const portfolio = await prisma.paperPortfolio.create({
    data: {
      name,
      startingCapital,
      currentCash: startingCapital,
      totalValue: startingCapital,
      maxPositionSize: settings?.maxPositionSize || 0.10,
      minConfidence: settings?.minConfidence || 0.60
    }
  });

  console.log(`[Paper Trading] Created portfolio "${name}" with $${startingCapital.toLocaleString()}`);

  return portfolio.id;
}
