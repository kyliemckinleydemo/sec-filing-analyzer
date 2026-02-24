/**
 * @module app/api/paper-trading/portfolio/[portfolioId]/route
 * @description Next.js API route handler that retrieves comprehensive paper trading portfolio data including summary, positions, historical snapshots, and performance statistics
 *
 * PURPOSE:
 * - Fetch portfolio summary using PaperTradingEngine for given portfolioId
 * - Query last 90 days of portfolio snapshots from database for charting historical performance
 * - Retrieve all closed trades and calculate detailed performance metrics including win rate, profit factor, and model accuracy
 * - Return unified response with portfolio state, open positions, recent trades, snapshots, and statistical analysis
 *
 * DEPENDENCIES:
 * - @/lib/paper-trading - Provides PaperTradingEngine class for portfolio summary computation and position valuation
 * - @/lib/prisma - Database client for querying portfolioSnapshot and paperTrade records with filtering and ordering
 *
 * EXPORTS:
 * - dynamic (const) - Next.js config set to 'force-dynamic' to disable route caching and ensure fresh data
 * - GET (function) - Async handler returning portfolio summary, positions, trades, 90-day snapshots, and calculated stats or 404/500 errors
 * - calculatePortfolioStats (function) - Computes trading statistics from closed trades including win rate, profit factor, best/worst trades, average hold days, and ML model prediction accuracy
 *
 * PATTERNS:
 * - Call GET /api/paper-trading/portfolio/[portfolioId] to receive JSON with portfolio, openPositions, recentTrades, snapshots, and stats fields
 * - Use snapshots array (90 records) for rendering portfolio value charts over time
 * - Access stats.winRate for percentage, stats.profitFactor for gross profit/loss ratio, and stats.modelAccuracy for ML prediction correctness
 * - Handle 404 response when portfolioId doesn't exist or 500 for database/calculation errors
 *
 * CLAUDE NOTES:
 * - Forces dynamic rendering to prevent stale portfolio data in production builds
 * - Model accuracy calculation checks if predicted and actual returns have matching sign (both positive or both negative)
 * - Returns zero-filled stats object when portfolio has no closed trades yet to prevent division errors
 * - Profit factor is total wins divided by absolute total losses, common trading performance metric where >1 indicates profitability
 * - Average hold days calculated by summing millisecond differences between exit and entry dates then converting to days
 */
import { NextRequest, NextResponse } from 'next/server';
import { PaperTradingEngine } from '@/lib/paper-trading';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Get paper trading portfolio summary
 *
 * GET /api/paper-trading/portfolio/[portfolioId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ portfolioId: string }> }
) {
  try {
    const { portfolioId } = await params;

    const engine = new PaperTradingEngine(portfolioId);
    const summary = await engine.getPortfolioSummary();

    if (!summary) {
      return NextResponse.json(
        { error: 'Portfolio not found' },
        { status: 404 }
      );
    }

    // Get historical snapshots for charting
    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: { portfolioId },
      orderBy: { date: 'asc' },
      take: 90 // Last 90 days
    });

    // Get all closed trades for detailed stats
    const closedTrades = await prisma.paperTrade.findMany({
      where: {
        portfolioId,
        status: 'CLOSED'
      },
      orderBy: { exitDate: 'desc' }
    });

    // Calculate detailed stats
    const stats = calculatePortfolioStats(summary.portfolio, closedTrades);

    return NextResponse.json({
      portfolio: summary.portfolio,
      openPositions: summary.openPositions,
      recentTrades: summary.recentTrades,
      snapshots,
      stats
    });

  } catch (error: any) {
    console.error('[Paper Trading] Error fetching portfolio:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

function calculatePortfolioStats(portfolio: any, closedTrades: any[]) {
  if (closedTrades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      bestTrade: null,
      worstTrade: null,
      avgHoldDays: 7,
      modelAccuracy: 0
    };
  }

  const wins = closedTrades.filter(t => (t.realizedPnL || 0) > 0);
  const losses = closedTrades.filter(t => (t.realizedPnL || 0) <= 0);

  const avgWin = wins.length > 0
    ? wins.reduce((sum, t) => sum + (t.realizedPnLPct || 0), 0) / wins.length
    : 0;

  const avgLoss = losses.length > 0
    ? losses.reduce((sum, t) => sum + (t.realizedPnLPct || 0), 0) / losses.length
    : 0;

  const totalWins = wins.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
  const totalLosses = Math.abs(losses.reduce((sum, t) => sum + (t.realizedPnL || 0), 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

  const bestTrade = closedTrades.reduce((best, t) =>
    (!best || (t.realizedPnLPct || 0) > (best.realizedPnLPct || 0)) ? t : best
  , null);

  const worstTrade = closedTrades.reduce((worst, t) =>
    (!worst || (t.realizedPnLPct || 0) < (worst.realizedPnLPct || 0)) ? t : worst
  , null);

  // Calculate average hold days
  const avgHoldDays = closedTrades.reduce((sum, t) => {
    if (t.exitDate && t.entryDate) {
      const days = (t.exitDate.getTime() - t.entryDate.getTime()) / (1000 * 60 * 60 * 24);
      return sum + days;
    }
    return sum;
  }, 0) / closedTrades.length;

  // Calculate model accuracy (predicted direction vs actual direction)
  const correctPredictions = closedTrades.filter(t => {
    if (t.predictedReturn && t.actualReturn) {
      return (t.predictedReturn > 0 && t.actualReturn > 0) ||
             (t.predictedReturn < 0 && t.actualReturn < 0);
    }
    return false;
  }).length;

  const modelAccuracy = closedTrades.length > 0
    ? (correctPredictions / closedTrades.length) * 100
    : 0;

  return {
    totalTrades: closedTrades.length,
    winRate: (wins.length / closedTrades.length) * 100,
    avgWin,
    avgLoss,
    profitFactor,
    bestTrade,
    worstTrade,
    avgHoldDays,
    modelAccuracy
  };
}
