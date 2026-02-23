/**
 * @module lib/paper-trading
 * @description Executes simulated trades based on ML model predictions with 7-day hold periods and performance tracking against S&P 500 benchmark
 *
 * PURPOSE:
 * - Opens LONG/SHORT positions at next trading day open price after 10-K/10-Q filing analysis
 * - Validates signals against confidence threshold (default >minConfidence), predicted return magnitude (>0.5%), and prevents duplicate ticker positions
 * - Calculates position sizing using Kelly Criterion (confidence * predictedReturn / 100) capped at maxPositionSize portfolio percentage
 * - Fetches historical opening prices from Yahoo Finance with fallbacks to recent close prices or pending status when market closed
 * - Closes positions after hold period comparing actualReturn to predictedReturn for model validation
 *
 * DEPENDENCIES:
 * - ./prisma - Accesses paperPortfolio, paperTrade, and filing tables for position tracking and performance metrics
 * - yahoo-finance2 - Fetches historical opening prices via chart() API and current quotes via quote() for trade execution
 *
 * EXPORTS:
 * - TradeSignal (interface) - Input shape with ticker, filingId, predictedReturn percentage, confidence score, LONG/SHORT direction, and optional marketCap
 * - TradeExecutionResult (interface) - Response shape with success boolean, optional tradeId string, reason string, and details object
 * - PaperTradingEngine (class) - Core engine managing trade lifecycle from signal evaluation through position closure with P&L calculation
 * - createPaperPortfolio (function) - Factory function initializing new paper trading portfolio with starting cash and risk parameters
 *
 * PATTERNS:
 * - Instantiate with portfolioId: const engine = new PaperTradingEngine(portfolioId)
 * - Validate signal: const shouldTrade = await engine.evaluateTradeSignal({ ticker, filingId, predictedReturn, confidence, direction })
 * - Execute if valid: const result = await engine.executeTrade(signal); check result.success and handle result.tradeId
 * - Close after 7 days: await engine.closeTrade(tradeId, 'hold period complete'); updates realizedPnL and actualReturn fields
 *
 * CLAUDE NOTES:
 * - Trade entry happens at next trading day OPEN after filing (adjusts for weekends: Friday filing executes Monday)
 * - Creates PENDING status trades when market closed, requiring separate execution job to fill entryPrice/shares at market open
 * - Uses Kelly Criterion for position sizing but CAPS at maxPositionSize to prevent over-concentration (default 10% portfolio)
 * - SHORT positions calculate P&L inversely: profit = entryValue - exitValue (gains when price drops)
 * - Tracks both realizedPnLPct (actual profit including commissions) and actualReturn (raw price movement) separately for ML model validation
 * - $1.00 commission applied on both entry and exit to simulate realistic trading costs
 */
import { prisma } from './prisma';
import yahooFinance from './yahoo-finance-singleton';

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

    // Only trade if predicted return magnitude is meaningful
    // For alpha model: >0.5% expected alpha (30-day horizon captures more signal)
    if (Math.abs(signal.predictedReturn) < 0.5) {
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

      // If historical price not available, try to get the most recent available price
      if (!entryPrice) {
        try {
          // Try to get any recent price data (last 7 days)
          const recentData = await yahooFinance.chart(signal.ticker, {
            period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            period2: new Date(),
            interval: '1d'
          });

          if (recentData.quotes && recentData.quotes.length > 0) {
            // Use the most recent available closing price
            const latestQuote = recentData.quotes[recentData.quotes.length - 1];
            entryPrice = latestQuote.close || latestQuote.open || null;
            console.log(`[Paper Trading] Using most recent price for ${signal.ticker}: $${entryPrice}`);
          }
        } catch (error) {
          console.error(`[Paper Trading] Error fetching recent price:`, error);
        }
      }

      // Last resort: try current quote (only works during market hours)
      if (!entryPrice) {
        try {
          const quote = await yahooFinance.quote(signal.ticker);
          entryPrice = quote.regularMarketPrice || quote.regularMarketPreviousClose || null;
          console.log(`[Paper Trading] Using current/previous close price for ${signal.ticker}: $${entryPrice}`);
        } catch (error) {
          console.error(`[Paper Trading] Error fetching current quote:`, error);
        }
      }

      // If we can't get a price (market closed), create a PENDING trade
      if (!entryPrice) {
        console.log(`[Paper Trading] Market closed - creating PENDING trade for ${signal.ticker}`);

        const pendingTrade = await prisma.paperTrade.create({
          data: {
            portfolioId: this.portfolioId,
            ticker: signal.ticker,
            filingId: signal.filingId,
            direction: signal.direction,
            predictedReturn: signal.predictedReturn,
            confidence: signal.confidence,
            status: 'PENDING',
            // Entry fields will be filled when trade is executed at market open
            entryDate: null,
            entryPrice: null,
            shares: null,
            entryValue: null,
            notes: 'Queued for execution at next market open'
          }
        });

        return {
          success: true,
          tradeId: pendingTrade.id,
          reason: 'Trade queued - will execute at next market open',
          details: {
            ticker: signal.ticker,
            status: 'PENDING',
            predictedReturn: signal.predictedReturn,
            confidence: signal.confidence
          }
        };
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

      // Ensure trade has been executed (not pending)
      if (!trade.entryPrice || !trade.shares || !trade.entryValue) {
        return { success: false, reason: 'Cannot close pending trade - not yet executed' };
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
   * Close all positions that have been open for 30+ days (alpha model targets 30-day horizon)
   */
  async closeExpiredPositions(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const expiredTrades = await prisma.paperTrade.findMany({
      where: {
        portfolioId: this.portfolioId,
        status: 'OPEN',
        entryDate: {
          lte: thirtyDaysAgo
        }
      }
    });

    console.log(`[Paper Trading] Found ${expiredTrades.length} positions to close (30-day hold complete)`);

    let closed = 0;
    for (const trade of expiredTrades) {
      const result = await this.closeTrade(trade.id, '30-day hold period complete');
      if (result.success) {
        closed++;
      }
    }

    return closed;
  }

  /**
   * Execute all PENDING trades at market open
   * Should be called during morning cron job (after market opens at 9:30am ET)
   */
  async executePendingTrades(): Promise<number> {
    const pendingTrades = await prisma.paperTrade.findMany({
      where: {
        portfolioId: this.portfolioId,
        status: 'PENDING'
      }
    });

    if (pendingTrades.length === 0) {
      console.log(`[Paper Trading] No pending trades to execute`);
      return 0;
    }

    console.log(`[Paper Trading] Found ${pendingTrades.length} pending trades to execute at market open`);

    const portfolio = await prisma.paperPortfolio.findUnique({
      where: { id: this.portfolioId }
    });

    if (!portfolio) {
      console.error(`[Paper Trading] Portfolio not found`);
      return 0;
    }

    let executed = 0;
    for (const trade of pendingTrades) {
      try {
        // Get current opening price
        let entryPrice: number | null = null;

        try {
          // Try to get the opening price from today
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const endOfDay = new Date(today);
          endOfDay.setHours(23, 59, 59, 999);

          const quote = await yahooFinance.quote(trade.ticker);
          entryPrice = quote.regularMarketPrice || quote.regularMarketOpen || null;

          if (!entryPrice) {
            // Fallback: try chart data for today
            const chartData = await yahooFinance.chart(trade.ticker, {
              period1: today,
              period2: endOfDay,
              interval: '1d'
            });

            if (chartData.quotes && chartData.quotes.length > 0) {
              entryPrice = chartData.quotes[0].open || chartData.quotes[0].close || null;
            }
          }
        } catch (error) {
          console.error(`[Paper Trading] Error fetching opening price for ${trade.ticker}:`, error);
        }

        // If we still can't get a price, skip this trade (market might not be open yet)
        if (!entryPrice) {
          console.log(`[Paper Trading] Skipping ${trade.ticker} - no price available yet (market may not be open)`);
          continue;
        }

        // Calculate position size using the same logic as executeTrade
        const kellySize = (trade.confidence * Math.abs(trade.predictedReturn)) / 100;
        const positionSize = Math.min(kellySize, portfolio.maxPositionSize);
        const positionValue = portfolio.totalValue * positionSize;

        // Check if we have enough cash
        if (positionValue > portfolio.currentCash) {
          console.log(`[Paper Trading] Insufficient cash for ${trade.ticker} - cancelling trade`);
          await prisma.paperTrade.update({
            where: { id: trade.id },
            data: {
              status: 'CANCELLED',
              notes: `Cancelled - insufficient cash (needed $${positionValue.toFixed(2)}, had $${portfolio.currentCash.toFixed(2)})`
            }
          });
          continue;
        }

        // Calculate shares
        const shares = Math.floor(positionValue / entryPrice);
        const actualPositionValue = shares * entryPrice;
        const commission = 1.00;

        // Update the pending trade to OPEN
        await prisma.paperTrade.update({
          where: { id: trade.id },
          data: {
            status: 'OPEN',
            entryDate: new Date(),
            entryPrice: entryPrice,
            shares: shares,
            entryValue: actualPositionValue,
            entryCommission: commission,
            notes: `Executed at market open: ${shares} shares @ $${entryPrice.toFixed(2)} (was PENDING, now OPEN)`
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

        // Update our local portfolio reference
        portfolio.currentCash -= actualPositionValue + commission;
        portfolio.totalTrades += 1;

        console.log(`[Paper Trading] ✅ Executed PENDING trade: ${shares} shares of ${trade.ticker} @ $${entryPrice.toFixed(2)} (${trade.direction})`);
        executed++;

      } catch (error: any) {
        console.error(`[Paper Trading] Error executing pending trade for ${trade.ticker}:`, error);
        // Don't cancel the trade on error - leave it PENDING for next attempt
      }
    }

    console.log(`[Paper Trading] Executed ${executed}/${pendingTrades.length} pending trades`);
    return executed;
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
      // Skip pending trades that haven't been executed yet
      if (!trade.shares || !trade.entryValue) {
        continue;
      }

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
        // Skip if trade hasn't been executed yet (shouldn't happen for OPEN status, but be safe)
        if (!trade.entryPrice || !trade.shares || !trade.entryValue || !trade.entryDate) {
          return {
            ...trade,
            currentPrice: null,
            currentValue: null,
            unrealizedPnL: null,
            unrealizedPnLPct: null,
            daysHeld: 0
          };
        }

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
