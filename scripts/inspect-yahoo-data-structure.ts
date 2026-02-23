/**
 * Inspect Yahoo Finance Data Structure
 *
 * See what fields are actually available in upgrade/downgrade history
 */

import yahooFinance from '../lib/yahoo-finance-singleton';

async function inspectYahooData() {
  console.log('🔍 INSPECTING YAHOO FINANCE DATA STRUCTURE\n');
  console.log('═'.repeat(80));

  const ticker = 'AAPL';

  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ['upgradeDowngradeHistory']
    });

    const history = quote.upgradeDowngradeHistory?.history || [];
    console.log(`\n📊 Found ${history.length} events\n`);

    if (history.length > 0) {
      console.log('📋 Raw data structure of first 3 events:\n');

      for (let i = 0; i < Math.min(3, history.length); i++) {
        const event = history[i];
        console.log(`Event ${i + 1}:`);
        console.log(JSON.stringify(event, null, 2));
        console.log('');
      }

      console.log('\n📋 All available fields:');
      const allFields = new Set<string>();
      history.forEach(event => {
        Object.keys(event).forEach(key => allFields.add(key));
      });
      console.log(Array.from(allFields).join(', '));

      console.log('\n\n📊 Sample of most recent events with all fields:');
      history.slice(0, 5).forEach((event, idx) => {
        console.log(`\n${idx + 1}.`);
        Object.entries(event).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      });
    }

  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
  }
}

inspectYahooData().catch(console.error);
