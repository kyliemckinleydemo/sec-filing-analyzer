import yahooFinance from '../lib/yahoo-finance-singleton';

async function testYahooSector() {
  const ticker = 'AAPL';

  console.log('Testing quote():');
  const quote: any = await yahooFinance.quote(ticker);
  console.log('Available fields:', Object.keys(quote));
  console.log('Sector:', quote.sector);
  console.log('Industry:', quote.industry);
  console.log('\n');

  console.log('Testing quoteSummary() with assetProfile:');
  const summary = await yahooFinance.quoteSummary(ticker, {
    modules: ['assetProfile', 'summaryProfile']
  });
  console.log('assetProfile:', summary.assetProfile);
  console.log('summaryProfile:', summary.summaryProfile);
}

testYahooSector().catch(console.error);
