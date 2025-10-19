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
