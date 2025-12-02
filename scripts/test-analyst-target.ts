import { yahooFinanceClient } from '../lib/yahoo-finance-client';

async function testAnalystTarget() {
  console.log('Testing analyst target price fetch for AAPL...\n');

  const data = await yahooFinanceClient.getCompanyFinancials('AAPL');

  if (data) {
    console.log('✅ Successfully fetched Yahoo Finance data:');
    console.log(`   Ticker: ${data.ticker}`);
    console.log(`   Current Price: $${data.currentPrice}`);
    console.log(`   Analyst Target Price: ${data.analystTargetPrice ? `$${data.analystTargetPrice}` : 'null'}`);

    if (data.analystTargetPrice && data.currentPrice) {
      const upside = ((data.analystTargetPrice - data.currentPrice) / data.currentPrice * 100).toFixed(1);
      console.log(`   Upside Potential: ${upside}%`);
      console.log(`   Status: ${data.currentPrice < data.analystTargetPrice ? 'UNDERVALUED' : 'OVERVALUED'}`);
    }
  } else {
    console.log('❌ Failed to fetch data');
  }
}

testAnalystTarget()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
