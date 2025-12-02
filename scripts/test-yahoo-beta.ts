/**
 * Test script to check beta availability across different Yahoo Finance endpoints
 */

async function testYahooBeta() {
  const yahooFinance = (await import('yahoo-finance2')).default;

  const tickers = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'JPM'];

  for (const ticker of tickers) {
    console.log(`\n=== ${ticker} ===`);

    try {
      // Try quote endpoint
      const quote = await yahooFinance.quote(ticker);
      console.log(`quote.beta: ${quote.beta}`);

      // Try quoteSummary with financialData module
      const summary = await yahooFinance.quoteSummary(ticker, {
        modules: ['summaryDetail', 'defaultKeyStatistics']
      });

      console.log(`summaryDetail.beta: ${(summary.summaryDetail as any)?.beta}`);
      console.log(`defaultKeyStatistics.beta: ${(summary.defaultKeyStatistics as any)?.beta}`);

    } catch (error: any) {
      console.log(`Error: ${error.message}`);
    }
  }
}

testYahooBeta()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
