import { yahooFinanceClient } from '../lib/yahoo-finance-client';

async function testYahooData() {
  console.log('Testing Yahoo Finance data for AAPL...\n');

  const financials = await yahooFinanceClient.getCompanyFinancials('AAPL');

  console.log('Raw data:');
  console.log(JSON.stringify(financials, null, 2));

  console.log('\nKey fields:');
  console.log(`dividendYield: ${financials?.dividendYield} (type: ${typeof financials?.dividendYield})`);
  console.log(`beta: ${financials?.beta} (type: ${typeof financials?.beta})`);
  console.log(`volume: ${financials?.volume}`);
}

testYahooData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
