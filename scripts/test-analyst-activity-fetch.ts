import { yahooFinanceClient } from '../lib/yahoo-finance-client';

async function main() {
  console.log('=== Testing Analyst Activity Fetcher ===\n');

  const testTickers = ['EFX', 'AAPL', 'MSFT'];

  for (const ticker of testTickers) {
    console.log(`\n--- Testing ${ticker} ---`);

    try {
      const activities = await yahooFinanceClient.getAnalystActivity(ticker);

      if (activities.length === 0) {
        console.log(`❌ No analyst activity found for ${ticker}`);
        continue;
      }

      console.log(`✅ Found ${activities.length} analyst actions for ${ticker}\n`);

      // Show most recent 5 actions
      const recent = activities.slice(0, 5);

      recent.forEach((action, idx) => {
        console.log(`${idx + 1}. ${action.date.toISOString().split('T')[0]} | ${action.firm}`);
        console.log(`   Action: ${action.actionType}`);
        if (action.fromGrade && action.toGrade) {
          console.log(`   Rating: ${action.fromGrade} → ${action.toGrade}`);
        } else if (action.toGrade) {
          console.log(`   Rating: ${action.toGrade}`);
        }
        console.log('');
      });

      // Count upgrades vs downgrades
      const upgrades = activities.filter(a => a.actionType === 'upgrade').length;
      const downgrades = activities.filter(a => a.actionType === 'downgrade').length;
      const initiates = activities.filter(a => a.actionType === 'initiate').length;

      console.log(`Summary: ${upgrades} upgrades, ${downgrades} downgrades, ${initiates} initiations`);

    } catch (error: any) {
      console.error(`❌ Error fetching analyst activity for ${ticker}:`, error.message);
    }
  }
}

main();
