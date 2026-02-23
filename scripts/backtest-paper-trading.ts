import { prisma } from '../lib/prisma';
import { PaperTradingEngine, createPaperPortfolio } from '../lib/paper-trading';
import yahooFinance from '../lib/yahoo-finance-singleton';

/**
 * Backtest Paper Trading System
 *
 * Simulates paper trading on historical filings with ML predictions
 * Uses actual historical prices (entry at next-day open, exit after 7 days)
 */

const PORTFOLIO_ID = 'cmgu5ysgx0000boh27mxywid1';

interface BacktestTrade {
  ticker: string;
  filingDate: Date;
  entryDate: Date;
  exitDate: Date;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  predictedReturn: number;
  actualReturn: number;
  pnl: number;
  pnlPct: number;
  confidence: number;
}

async function getHistoricalPrice(ticker: string, date: Date, priceType: 'open' | 'close'): Promise<number | null> {
  try {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 5); // Get 5 days to handle weekends/holidays

    const historicalData = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    });

    if (historicalData.quotes && historicalData.quotes.length > 0) {
      const quote = historicalData.quotes[0];
      return priceType === 'open' ? (quote.open || null) : (quote.close || null);
    }

    return null;
  } catch (error: any) {
    console.log(`  ⚠️  Could not fetch ${priceType} price for ${ticker} on ${date.toDateString()}: ${error.message}`);
    return null;
  }
}

function getNextTradingDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);

  // Skip weekends
  if (next.getDay() === 6) { // Saturday → Monday
    next.setDate(next.getDate() + 2);
  } else if (next.getDay() === 0) { // Sunday → Monday
    next.setDate(next.getDate() + 1);
  }

  return next;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('           PAPER TRADING BACKTEST');
  console.log('═══════════════════════════════════════════════════════\n');

  // Get all filings with ML predictions
  const filings = await prisma.filing.findMany({
    where: {
      predicted7dReturn: { not: null },
      predictionConfidence: { not: null },
      filingType: { in: ['10-K', '10-Q'] }
    },
    include: {
      company: true
    },
    orderBy: {
      filingDate: 'asc'
    }
  });

  console.log(`Found ${filings.length} filings with ML predictions\n`);

  // Backtest settings
  const MIN_CONFIDENCE = 0.60;
  const MIN_PREDICTED_RETURN = 2.0;
  const MAX_POSITION_SIZE = 0.10; // 10%
  const HOLD_DAYS = 7;

  let portfolioValue = 100000.00;
  let cash = 100000.00;
  const trades: BacktestTrade[] = [];
  const openPositions = new Map<string, any>();

  console.log('⚙️  Backtest Settings:');
  console.log(`   Starting Capital: $${portfolioValue.toLocaleString()}`);
  console.log(`   Min Confidence: ${MIN_CONFIDENCE * 100}%`);
  console.log(`   Min Return: ${MIN_PREDICTED_RETURN}%`);
  console.log(`   Max Position: ${MAX_POSITION_SIZE * 100}%`);
  console.log(`   Hold Period: ${HOLD_DAYS} days\n`);

  console.log('🔄 Processing filings...\n');

  for (let i = 0; i < filings.length; i++) {
    const filing = filings[i];
    const ticker = filing.company?.ticker;

    if (!ticker) continue;

    const predictedReturn = filing.predicted7dReturn!;
    const confidence = filing.predictionConfidence!;

    // Check if we should trade
    if (confidence < MIN_CONFIDENCE || Math.abs(predictedReturn) < MIN_PREDICTED_RETURN) {
      continue;
    }

    // Check if we already have a position
    if (openPositions.has(ticker)) {
      continue;
    }

    console.log(`[${i + 1}/${filings.length}] ${ticker} - ${filing.filingDate.toDateString()}`);
    console.log(`   Predicted: ${predictedReturn > 0 ? '+' : ''}${predictedReturn.toFixed(2)}% (${(confidence * 100).toFixed(0)}% confidence)`);

    // Calculate entry date (next trading day after filing)
    const entryDate = getNextTradingDay(filing.filingDate);
    const exitDate = new Date(entryDate);
    exitDate.setDate(exitDate.getDate() + HOLD_DAYS);

    // Get historical prices
    const entryPrice = await getHistoricalPrice(ticker, entryDate, 'open');

    if (!entryPrice) {
      console.log(`   ⏭️  Skipped: No entry price available\n`);
      continue;
    }

    // Wait a bit to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 200));

    const exitPrice = await getHistoricalPrice(ticker, exitDate, 'close');

    if (!exitPrice) {
      console.log(`   ⏭️  Skipped: No exit price available\n`);
      continue;
    }

    // Calculate position size (Kelly Criterion)
    const kellySize = (confidence * Math.abs(predictedReturn)) / 100;
    const positionSize = Math.min(kellySize, MAX_POSITION_SIZE);
    const positionValue = portfolioValue * positionSize;

    if (positionValue > cash) {
      console.log(`   ⏭️  Skipped: Insufficient cash\n`);
      continue;
    }

    // Calculate shares and actual position value
    const shares = Math.floor(positionValue / entryPrice);
    const actualPositionValue = shares * entryPrice;
    const commission = 2.00; // $1 entry + $1 exit

    // Execute trade
    cash -= actualPositionValue + 1.00; // Deduct entry commission

    // Calculate P&L
    const exitValue = shares * exitPrice;
    const pnl = exitValue - actualPositionValue - commission;
    const pnlPct = (pnl / actualPositionValue) * 100;
    const actualReturn = ((exitPrice - entryPrice) / entryPrice) * 100;

    // Close position
    cash += exitValue - 1.00; // Add exit value, deduct exit commission
    portfolioValue = cash; // Update portfolio value (simplified - no open positions at this point)

    trades.push({
      ticker,
      filingDate: filing.filingDate,
      entryDate,
      exitDate,
      entryPrice,
      exitPrice,
      shares,
      predictedReturn,
      actualReturn,
      pnl,
      pnlPct,
      confidence
    });

    console.log(`   📊 Entry:  ${entryDate.toDateString()} @ $${entryPrice.toFixed(2)}`);
    console.log(`   📊 Exit:   ${exitDate.toDateString()} @ $${exitPrice.toFixed(2)}`);
    console.log(`   💰 P&L:    ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`);
    console.log(`   🎯 Actual: ${actualReturn >= 0 ? '+' : ''}${actualReturn.toFixed(2)}%`);
    console.log(`   💵 Cash:   $${cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Calculate statistics
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('              BACKTEST RESULTS');
  console.log('═══════════════════════════════════════════════════════\n');

  const totalReturn = ((portfolioValue - 100000) / 100000) * 100;
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = (wins.length / trades.length) * 100;

  const avgWin = wins.length > 0
    ? wins.reduce((sum, t) => sum + t.pnlPct, 0) / wins.length
    : 0;
  const avgLoss = losses.length > 0
    ? losses.reduce((sum, t) => sum + t.pnlPct, 0) / losses.length
    : 0;

  const totalWinsDollar = wins.reduce((sum, t) => sum + t.pnl, 0);
  const totalLossesDollar = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = totalLossesDollar > 0 ? totalWinsDollar / totalLossesDollar : 0;

  const correctPredictions = trades.filter(t =>
    (t.predictedReturn > 0 && t.actualReturn > 0) ||
    (t.predictedReturn < 0 && t.actualReturn < 0)
  ).length;
  const modelAccuracy = (correctPredictions / trades.length) * 100;

  console.log('📊 PORTFOLIO PERFORMANCE');
  console.log('───────────────────────────────────────────────────────');
  console.log(`Starting Value:    $${(100000).toLocaleString()}`);
  console.log(`Ending Value:      $${portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
  console.log(`Total Return:      ${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`);
  console.log(`Total P&L:         ${portfolioValue - 100000 >= 0 ? '+' : ''}$${(portfolioValue - 100000).toFixed(2)}`);
  console.log();

  console.log('📈 TRADING STATISTICS');
  console.log('───────────────────────────────────────────────────────');
  console.log(`Total Trades:      ${trades.length}`);
  console.log(`Winning Trades:    ${wins.length} (${winRate.toFixed(1)}%)`);
  console.log(`Losing Trades:     ${losses.length}`);
  console.log(`Average Win:       +${avgWin.toFixed(2)}%`);
  console.log(`Average Loss:      ${avgLoss.toFixed(2)}%`);
  console.log(`Profit Factor:     ${profitFactor.toFixed(2)}x`);
  console.log();

  console.log('🎯 MODEL ACCURACY');
  console.log('───────────────────────────────────────────────────────');
  console.log(`Directional Accuracy: ${modelAccuracy.toFixed(1)}%`);
  console.log(`Correct Predictions:  ${correctPredictions}/${trades.length}`);
  console.log();

  // Best and worst trades
  const bestTrade = trades.reduce((best, t) => t.pnlPct > best.pnlPct ? t : best, trades[0]);
  const worstTrade = trades.reduce((worst, t) => t.pnlPct < worst.pnlPct ? t : worst, trades[0]);

  console.log('🏆 BEST TRADE');
  console.log('───────────────────────────────────────────────────────');
  console.log(`${bestTrade.ticker} - ${bestTrade.filingDate.toDateString()}`);
  console.log(`Entry: $${bestTrade.entryPrice.toFixed(2)} → Exit: $${bestTrade.exitPrice.toFixed(2)}`);
  console.log(`P&L: +$${bestTrade.pnl.toFixed(2)} (+${bestTrade.pnlPct.toFixed(2)}%)`);
  console.log(`Predicted: ${bestTrade.predictedReturn.toFixed(2)}% | Actual: ${bestTrade.actualReturn.toFixed(2)}%`);
  console.log();

  console.log('💔 WORST TRADE');
  console.log('───────────────────────────────────────────────────────');
  console.log(`${worstTrade.ticker} - ${worstTrade.filingDate.toDateString()}`);
  console.log(`Entry: $${worstTrade.entryPrice.toFixed(2)} → Exit: $${worstTrade.exitPrice.toFixed(2)}`);
  console.log(`P&L: $${worstTrade.pnl.toFixed(2)} (${worstTrade.pnlPct.toFixed(2)}%)`);
  console.log(`Predicted: ${worstTrade.predictedReturn.toFixed(2)}% | Actual: ${worstTrade.actualReturn.toFixed(2)}%`);
  console.log();

  console.log('═══════════════════════════════════════════════════════\n');

  // Export results
  const results = {
    summary: {
      startingValue: 100000,
      endingValue: portfolioValue,
      totalReturn: totalReturn,
      totalPnL: portfolioValue - 100000,
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: winRate,
      avgWin: avgWin,
      avgLoss: avgLoss,
      profitFactor: profitFactor,
      modelAccuracy: modelAccuracy
    },
    trades: trades
  };

  // Save to file
  const fs = require('fs');
  fs.writeFileSync('backtest-results.json', JSON.stringify(results, null, 2));
  console.log('💾 Results saved to: backtest-results.json\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
