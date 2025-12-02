/**
 * Test what historical analyst data Yahoo Finance provides
 */

import yahooFinance from 'yahoo-finance2';

async function testYahooAnalystHistory() {
  console.log('🔍 Testing Yahoo Finance Analyst Data Availability\n');
  console.log('═'.repeat(80));

  const testTicker = 'AAPL';

  console.log(`\n📊 Testing ticker: ${testTicker}\n`);

  // Test 1: quoteSummary with recommendationTrend
  console.log('1️⃣ Recommendation Trend (Current + Recent):');
  try {
    const quote = await yahooFinance.quoteSummary(testTicker, {
      modules: ['recommendationTrend']
    });

    const trends = quote.recommendationTrend?.trend;
    if (trends && trends.length > 0) {
      console.log(`   ✅ Found ${trends.length} trend periods\n`);

      trends.forEach((trend, idx) => {
        console.log(`   Period ${idx + 1}:`);
        console.log(`     Date: ${trend.period}`);
        console.log(`     Strong Buy: ${trend.strongBuy}`);
        console.log(`     Buy: ${trend.buy}`);
        console.log(`     Hold: ${trend.hold}`);
        console.log(`     Sell: ${trend.sell}`);
        console.log(`     Strong Sell: ${trend.strongSell}`);
        console.log('');
      });
    } else {
      console.log('   ❌ No recommendation trend data available\n');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}\n`);
  }

  // Test 2: financialData module
  console.log('2️⃣ Financial Data (Current Snapshot):');
  try {
    const quote = await yahooFinance.quoteSummary(testTicker, {
      modules: ['financialData']
    });

    const fd = quote.financialData;
    console.log(`   Target Mean: $${fd?.targetMeanPrice}`);
    console.log(`   Target High: $${fd?.targetHighPrice}`);
    console.log(`   Target Low: $${fd?.targetLowPrice}`);
    console.log(`   Number of Analysts: ${fd?.numberOfAnalystOpinions}`);
    console.log(`   Recommendation: ${fd?.recommendationKey} (${fd?.recommendationMean})`);
    console.log('');
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}\n`);
  }

  // Test 3: upgradeDowngradeHistory
  console.log('3️⃣ Upgrade/Downgrade History:');
  try {
    const quote = await yahooFinance.quoteSummary(testTicker, {
      modules: ['upgradeDowngradeHistory']
    });

    const history = quote.upgradeDowngradeHistory?.history;
    if (history && history.length > 0) {
      console.log(`   ✅ Found ${history.length} upgrade/downgrade events\n`);

      // Show last 5
      console.log('   Last 5 events:');
      history.slice(-5).forEach((event) => {
        const date = event.epochGradeDate
          ? new Date(event.epochGradeDate * 1000).toISOString().split('T')[0]
          : 'Unknown';
        console.log(`     ${date}: ${event.firm} - ${event.toGrade} (from ${event.fromGrade})`);
      });
      console.log('');
    } else {
      console.log('   ❌ No upgrade/downgrade history available\n');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}\n`);
  }

  // Test 4: earningsHistory
  console.log('4️⃣ Earnings History (for estimate revisions):');
  try {
    const quote = await yahooFinance.quoteSummary(testTicker, {
      modules: ['earningsHistory']
    });

    const history = quote.earningsHistory?.history;
    if (history && history.length > 0) {
      console.log(`   ✅ Found ${history.length} earnings periods\n`);

      history.forEach((period) => {
        const date = period.quarter
          ? `Q${period.quarter.fmt}`
          : 'Unknown';
        console.log(`   ${date}:`);
        console.log(`     EPS Estimate: $${period.epsEstimate?.fmt}`);
        console.log(`     EPS Actual: $${period.epsActual?.fmt}`);
        console.log(`     Surprise %: ${period.surprisePercent?.fmt}`);
        console.log('');
      });
    } else {
      console.log('   ❌ No earnings history available\n');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}\n`);
  }

  // Test 5: Check if we can get target price changes
  console.log('5️⃣ Historical Target Price Data:');
  console.log('   ⚠️  Yahoo Finance does NOT provide historical target price data');
  console.log('   ⚠️  Only current snapshot is available\n');

  console.log('═'.repeat(80));
  console.log('📋 SUMMARY\n');
  console.log('✅ AVAILABLE (Free from Yahoo Finance):');
  console.log('   - Current analyst recommendations (Buy/Hold/Sell)');
  console.log('   - Recommendation trend (last ~4 periods)');
  console.log('   - Current target price (mean/high/low)');
  console.log('   - Number of analysts covering');
  console.log('   - Upgrade/downgrade history with dates!');
  console.log('   - Earnings estimates vs actuals (surprise)');
  console.log('');
  console.log('❌ NOT AVAILABLE (Need paid API):');
  console.log('   - Historical target price changes over time');
  console.log('   - Estimate revision history (EPS/revenue changes)');
  console.log('   - Detailed analyst-by-analyst coverage changes');
  console.log('');
  console.log('💡 ACTIONABLE FOR YOUR USE CASE:');
  console.log('   ✅ Upgrade/Downgrade History - Can track changes in week before filing!');
  console.log('   ✅ Recommendation Trend - Shows recent shifts in sentiment');
  console.log('   ✅ Earnings Surprise - Can use as feature (actual vs estimate)');
  console.log('');
}

testYahooAnalystHistory().catch(console.error);
