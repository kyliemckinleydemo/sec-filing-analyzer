import { prisma } from '../lib/prisma';

const PORTFOLIO_ID = 'cmgu5ysgx0000boh27mxywid1';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('              PAPER TRADING PORTFOLIO');
  console.log('═══════════════════════════════════════════════════════\n');

  // Get portfolio
  const portfolio = await prisma.paperPortfolio.findUnique({
    where: { id: PORTFOLIO_ID },
    include: {
      trades: true
    }
  });

  if (!portfolio) {
    console.log('❌ Portfolio not found');
    return;
  }

  // Portfolio Summary
  console.log('📊 PORTFOLIO SUMMARY');
  console.log('───────────────────────────────────────────────────────');
  console.log(`Name:           ${portfolio.name}`);
  console.log(`Starting:       $${portfolio.startingCapital.toLocaleString()}`);
  console.log(`Current Value:  $${portfolio.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Cash:           $${portfolio.currentCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Total Return:   ${portfolio.totalReturn >= 0 ? '+' : ''}${portfolio.totalReturn.toFixed(2)}%`);
  console.log(`Win Rate:       ${portfolio.winRate.toFixed(1)}%`);
  console.log(`Total Trades:   ${portfolio.totalTrades}`);
  console.log(`  ✅ Wins:      ${portfolio.winningTrades}`);
  console.log(`  ❌ Losses:    ${portfolio.losingTrades}`);
  console.log();

  // Open Positions
  const openTrades = portfolio.trades.filter(t => t.status === 'OPEN');
  console.log(`📈 OPEN POSITIONS (${openTrades.length})`);
  console.log('───────────────────────────────────────────────────────');

  if (openTrades.length === 0) {
    console.log('No open positions\n');
  } else {
    for (const trade of openTrades) {
      const daysHeld = Math.floor((Date.now() - trade.entryDate.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`${trade.ticker}`);
      console.log(`  Entry:      ${trade.entryDate.toLocaleDateString()} @ $${trade.entryPrice.toFixed(2)}`);
      console.log(`  Shares:     ${trade.shares.toLocaleString()}`);
      console.log(`  Value:      $${trade.entryValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
      console.log(`  Days Held:  ${daysHeld}/7`);
      console.log(`  Predicted:  ${trade.predictedReturn > 0 ? '+' : ''}${trade.predictedReturn.toFixed(2)}%`);
      console.log(`  Confidence: ${(trade.confidence * 100).toFixed(0)}%`);
      console.log();
    }
  }

  // Closed Trades
  const closedTrades = portfolio.trades
    .filter(t => t.status === 'CLOSED')
    .sort((a, b) => (b.exitDate?.getTime() || 0) - (a.exitDate?.getTime() || 0));

  console.log(`📝 CLOSED TRADES (${closedTrades.length})`);
  console.log('───────────────────────────────────────────────────────');

  if (closedTrades.length === 0) {
    console.log('No closed trades yet\n');
  } else {
    // Show last 10
    for (const trade of closedTrades.slice(0, 10)) {
      const correct = (trade.predictedReturn > 0 && trade.actualReturn && trade.actualReturn > 0) ||
                     (trade.predictedReturn < 0 && trade.actualReturn && trade.actualReturn < 0);

      console.log(`${trade.ticker} - ${trade.exitDate?.toLocaleDateString()}`);
      console.log(`  Entry:      $${trade.entryPrice.toFixed(2)} → Exit: $${trade.exitPrice?.toFixed(2)}`);
      console.log(`  P&L:        ${trade.realizedPnL && trade.realizedPnL >= 0 ? '+' : ''}$${trade.realizedPnL?.toFixed(2)} (${trade.realizedPnLPct && trade.realizedPnLPct >= 0 ? '+' : ''}${trade.realizedPnLPct?.toFixed(2)}%)`);
      console.log(`  Predicted:  ${trade.predictedReturn > 0 ? '+' : ''}${trade.predictedReturn.toFixed(2)}%`);
      console.log(`  Actual:     ${trade.actualReturn && trade.actualReturn > 0 ? '+' : ''}${trade.actualReturn?.toFixed(2)}%`);
      console.log(`  Accuracy:   ${correct ? '✅ Correct' : '❌ Wrong'}`);
      console.log();
    }

    if (closedTrades.length > 10) {
      console.log(`... and ${closedTrades.length - 10} more trades\n`);
    }
  }

  // Performance Stats
  if (closedTrades.length > 0) {
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

    const correctPredictions = closedTrades.filter(t => {
      if (t.predictedReturn && t.actualReturn) {
        return (t.predictedReturn > 0 && t.actualReturn > 0) ||
               (t.predictedReturn < 0 && t.actualReturn < 0);
      }
      return false;
    }).length;

    const modelAccuracy = (correctPredictions / closedTrades.length) * 100;

    console.log('📊 PERFORMANCE STATISTICS');
    console.log('───────────────────────────────────────────────────────');
    console.log(`Model Accuracy:    ${modelAccuracy.toFixed(1)}%`);
    console.log(`Average Win:       +${avgWin.toFixed(2)}%`);
    console.log(`Average Loss:      ${avgLoss.toFixed(2)}%`);
    console.log(`Profit Factor:     ${profitFactor.toFixed(2)}x`);
    console.log();
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('\n💡 View full dashboard at: /paper-trading');
  console.log('💡 Portfolio ID: ' + PORTFOLIO_ID);
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
