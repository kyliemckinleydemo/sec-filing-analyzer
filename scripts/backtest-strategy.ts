/**
 * Comprehensive Strategy Backtest
 *
 * Simulates paper trading on historical filings with actual returns
 * Generates portfolio metrics: win rate, Sharpe ratio, max drawdown, alpha
 */

import { prisma } from '../lib/prisma';
import { predictionEngine } from '../lib/predictions';

interface BacktestTrade {
  ticker: string;
  filingDate: Date;
  filingType: string;
  predictedReturn: number;
  actualReturn: number;
  confidence: number;
  positionSize: number;
  pnl: number;
  direction: 'LONG' | 'SHORT';
}

interface BacktestResults {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalReturn: number;
  avgReturn: number;
  avgWin: number;
  avgLoss: number;
  sharpeRatio: number;
  maxDrawdown: number;
  alpha: number; // vs SPY
  profitFactor: number;
  trades: BacktestTrade[];
  monthlyReturns: { month: string; return: number }[];
}

const STARTING_CAPITAL = 100000;
const MAX_POSITION_SIZE = 0.10; // 10% max per position
const MIN_CONFIDENCE = 0.60; // 60% minimum confidence
const MIN_PREDICTED_RETURN = 1.0; // 1% minimum predicted return
const COMMISSION = 1.0; // $1 per trade

async function runBacktest(): Promise<BacktestResults> {
  console.log('🔬 COMPREHENSIVE STRATEGY BACKTEST\n');
  console.log('═'.repeat(80));
  console.log(`Starting Capital: $${STARTING_CAPITAL.toLocaleString()}`);
  console.log(`Max Position Size: ${(MAX_POSITION_SIZE * 100).toFixed(0)}%`);
  console.log(`Min Confidence: ${(MIN_CONFIDENCE * 100).toFixed(0)}%`);
  console.log(`Min Predicted Return: ${MIN_PREDICTED_RETURN}%`);
  console.log('═'.repeat(80));

  // Get all filings with actual returns
  const filings = await prisma.filing.findMany({
    where: {
      AND: [
        { filingType: { in: ['10-K', '10-Q'] } },
        { riskScore: { not: null } },
        { sentimentScore: { not: null } },
        { actual7dReturn: { not: null } }
      ]
    },
    include: {
      company: true
    },
    orderBy: {
      filingDate: 'asc'
    }
  });

  console.log(`\n📊 Dataset: ${filings.length} filings with actual returns\n`);

  const trades: BacktestTrade[] = [];
  let currentCash = STARTING_CAPITAL;
  let portfolioValue = STARTING_CAPITAL;
  let peakValue = STARTING_CAPITAL;
  let maxDrawdown = 0;
  const monthlyReturns: { month: string; return: number }[] = [];
  let lastMonth = '';

  for (const filing of filings) {
    try {
      // Skip if no ticker or no actual return
      if (!filing.company.ticker || !filing.actual7dReturn) {
        continue;
      }

      // Parse analysis data for enhanced features
      let eventType = undefined;
      let hasFinancialMetrics = false;
      let guidanceDirection = undefined;
      let guidanceChange = undefined;
      let epsSurprise = undefined;
      let revenueSurprise = undefined;

      if (filing.analysisData) {
        try {
          const analysis = JSON.parse(filing.analysisData);
          hasFinancialMetrics = !!analysis.financialMetrics;
          guidanceDirection = analysis.financialMetrics?.guidanceDirection;
          guidanceChange = analysis.financialMetrics?.guidanceComparison?.change;
          epsSurprise = analysis.financialMetrics?.structuredData?.epsSurprise;
          revenueSurprise = analysis.financialMetrics?.structuredData?.revenueSurprise;
        } catch (e) {
          // Skip
        }
      }

      // Calculate risk score delta
      let riskScoreDelta = 0;
      if (filing.analysisData) {
        try {
          const analysis = JSON.parse(filing.analysisData);
          if (analysis.risks?.riskScore !== undefined && analysis.risks?.priorRiskScore !== undefined) {
            riskScoreDelta = analysis.risks.riskScore - analysis.risks.priorRiskScore;
          }
        } catch (e) {
          // Use 0
        }
      }

      // Classify 8-K event type
      if (filing.filingType === '8-K' && filing.analysisData) {
        try {
          const analysis = JSON.parse(filing.analysisData);
          eventType = predictionEngine.classify8KEvent(analysis.filingContentSummary);
        } catch (e) {
          // Skip
        }
      }

      // Generate prediction
      const features = {
        riskScoreDelta,
        sentimentScore: filing.sentimentScore || 0,
        riskCountNew: 2,
        filingType: filing.filingType as '10-K' | '10-Q' | '8-K',
        eventType,
        hasFinancialMetrics,
        guidanceDirection,
        guidanceChange: guidanceChange as any,
        epsSurprise: epsSurprise as any,
        revenueSurprise: revenueSurprise as any,
        ticker: filing.company.ticker,
        avgHistoricalReturn: await predictionEngine.getHistoricalPattern(
          filing.company.ticker,
          filing.filingType
        )
      };

      const prediction = await predictionEngine.predict(features);

      // Evaluate trade signal
      if (prediction.confidence < MIN_CONFIDENCE) {
        continue; // Skip low confidence
      }

      if (Math.abs(prediction.predicted7dReturn) < MIN_PREDICTED_RETURN) {
        continue; // Skip small predictions
      }

      // Calculate position size using Kelly Criterion
      const kellySize = (prediction.confidence * Math.abs(prediction.predicted7dReturn)) / 100;
      const positionSize = Math.min(kellySize, MAX_POSITION_SIZE);
      const positionValue = portfolioValue * positionSize;

      // Check if we have enough cash
      if (positionValue > currentCash) {
        continue; // Skip if insufficient cash
      }

      // Determine direction
      const direction: 'LONG' | 'SHORT' = prediction.predicted7dReturn > 0 ? 'LONG' : 'SHORT';

      // Calculate actual P&L
      const actualReturn = filing.actual7dReturn; // Already in decimal form (0.05 = 5%)
      let pnl: number;

      if (direction === 'LONG') {
        pnl = positionValue * actualReturn - (2 * COMMISSION);
      } else {
        pnl = positionValue * (-actualReturn) - (2 * COMMISSION);
      }

      // Update portfolio
      currentCash -= positionValue; // Open position
      currentCash += positionValue + pnl; // Close position
      portfolioValue = currentCash;

      // Track drawdown
      if (portfolioValue > peakValue) {
        peakValue = portfolioValue;
      }
      const drawdown = ((peakValue - portfolioValue) / peakValue) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      // Track monthly returns
      const month = filing.filingDate.toISOString().slice(0, 7); // YYYY-MM
      if (month !== lastMonth) {
        if (lastMonth) {
          const monthlyReturn = ((portfolioValue - STARTING_CAPITAL) / STARTING_CAPITAL) * 100;
          monthlyReturns.push({ month: lastMonth, return: monthlyReturn });
        }
        lastMonth = month;
      }

      // Record trade
      trades.push({
        ticker: filing.company.ticker,
        filingDate: filing.filingDate,
        filingType: filing.filingType,
        predictedReturn: prediction.predicted7dReturn,
        actualReturn: actualReturn * 100, // Convert to percentage for display
        confidence: prediction.confidence,
        positionSize,
        pnl,
        direction
      });

    } catch (error) {
      console.error(`Error processing filing ${filing.id}:`, error);
    }
  }

  // Calculate final metrics
  const totalReturn = ((portfolioValue - STARTING_CAPITAL) / STARTING_CAPITAL) * 100;
  const winningTrades = trades.filter(t => t.pnl > 0).length;
  const losingTrades = trades.filter(t => t.pnl < 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

  const avgReturn = trades.length > 0
    ? trades.reduce((sum, t) => sum + (t.pnl / STARTING_CAPITAL) * 100, 0) / trades.length
    : 0;

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const avgWin = wins.length > 0
    ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length
    : 0;
  const avgLoss = losses.length > 0
    ? losses.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / losses.length
    : 0;

  // Calculate Sharpe ratio (assuming 252 trading days per year)
  const returns = trades.map(t => (t.pnl / (STARTING_CAPITAL * t.positionSize)));
  const avgReturnDaily = returns.length > 0 ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;
  const stdDev = returns.length > 0 ? Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturnDaily, 2), 0) / returns.length
  ) : 0;
  const sharpeRatio = stdDev > 0 ? (avgReturnDaily / stdDev) * Math.sqrt(252) : 0;

  // Calculate alpha (total return - SPY return)
  // Note: This is simplified - would need actual SPY returns for the period
  const alpha = totalReturn; // Placeholder - would subtract SPY return

  // Calculate profit factor (gross profit / gross loss)
  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

  return {
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    winRate,
    totalReturn,
    avgReturn,
    avgWin,
    avgLoss,
    sharpeRatio,
    maxDrawdown,
    alpha,
    profitFactor,
    trades,
    monthlyReturns
  };
}

async function main() {
  const results = await runBacktest();

  console.log('\n' + '═'.repeat(80));
  console.log('📈 BACKTEST RESULTS');
  console.log('═'.repeat(80));
  console.log(`\nPortfolio Performance:`);
  console.log(`  Total Return: ${results.totalReturn.toFixed(2)}%`);
  console.log(`  Total Trades: ${results.totalTrades}`);
  console.log(`  Final Value: $${(STARTING_CAPITAL * (1 + results.totalReturn / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  console.log(`\nWin/Loss Statistics:`);
  console.log(`  Win Rate: ${results.winRate.toFixed(1)}%`);
  console.log(`  Winning Trades: ${results.winningTrades}`);
  console.log(`  Losing Trades: ${results.losingTrades}`);
  console.log(`  Profit Factor: ${results.profitFactor.toFixed(2)}`);

  console.log(`\nReturn Metrics:`);
  console.log(`  Average Return per Trade: ${results.avgReturn.toFixed(3)}%`);
  console.log(`  Average Win: $${results.avgWin.toFixed(2)}`);
  console.log(`  Average Loss: $${results.avgLoss.toFixed(2)}`);

  console.log(`\nRisk Metrics:`);
  console.log(`  Sharpe Ratio: ${results.sharpeRatio.toFixed(2)}`);
  console.log(`  Max Drawdown: ${results.maxDrawdown.toFixed(2)}%`);
  console.log(`  Alpha: ${results.alpha.toFixed(2)}%`);

  // Show top 10 winning trades
  console.log(`\n🏆 Top 10 Winning Trades:`);
  const topWins = results.trades
    .filter(t => t.pnl > 0)
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 10);

  topWins.forEach((trade, i) => {
    console.log(`  ${i + 1}. ${trade.ticker} (${trade.filingType}) - P&L: $${trade.pnl.toFixed(2)} | Predicted: ${trade.predictedReturn.toFixed(2)}% | Actual: ${trade.actualReturn.toFixed(2)}%`);
  });

  // Show top 10 losing trades
  console.log(`\n❌ Top 10 Losing Trades:`);
  const topLosses = results.trades
    .filter(t => t.pnl < 0)
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 10);

  topLosses.forEach((trade, i) => {
    console.log(`  ${i + 1}. ${trade.ticker} (${trade.filingType}) - P&L: $${trade.pnl.toFixed(2)} | Predicted: ${trade.predictedReturn.toFixed(2)}% | Actual: ${trade.actualReturn.toFixed(2)}%`);
  });

  console.log('\n' + '═'.repeat(80));
  console.log('✅ Backtest Complete\n');

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
