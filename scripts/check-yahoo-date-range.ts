import yahooFinance from 'yahoo-finance2';

async function check() {
  const quote = await yahooFinance.quoteSummary('AAPL', {
    modules: ['upgradeDowngradeHistory']
  });

  const history = quote.upgradeDowngradeHistory?.history || [];
  const dates = history
    .filter(e => e.epochGradeDate)
    .map(e => new Date(e.epochGradeDate!))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length > 0) {
    console.log('AAPL Analyst Event Date Range:');
    console.log(`  Earliest: ${dates[0].toISOString()}`);
    console.log(`  Latest: ${dates[dates.length - 1].toISOString()}`);
    console.log(`  Total events: ${dates.length}`);

    // Show distribution by month
    const byMonth: { [key: string]: number } = {};
    dates.forEach(d => {
      const key = d.toISOString().substring(0, 7);
      byMonth[key] = (byMonth[key] || 0) + 1;
    });

    console.log('\nEvents by month (last 6 months):');
    Object.entries(byMonth)
      .sort()
      .slice(-6)
      .forEach(([month, count]) => {
        console.log(`  ${month}: ${count}`);
      });
  }
}

check().catch(console.error);
