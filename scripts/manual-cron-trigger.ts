/**
 * Manual Cron Job Trigger
 * Triggers production cron jobs manually using CRON_SECRET
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://sec-filing-analyzer-indol.vercel.app';
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('❌ CRON_SECRET not found in environment variables');
  console.error('Make sure you have CRON_SECRET set in your .env file');
  process.exit(1);
}

async function triggerCron(jobName: string, endpoint: string) {
  console.log(`\n🔄 Triggering ${jobName}...`);
  console.log(`   URL: ${BASE_URL}${endpoint}`);

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'User-Agent': 'manual-trigger-script',
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ ${jobName} completed successfully`);
      console.log(`   Response:`, JSON.stringify(data, null, 2));
    } else {
      console.error(`❌ ${jobName} failed`);
      console.error(`   Status: ${response.status}`);
      console.error(`   Error:`, JSON.stringify(data, null, 2));
    }
    
    return data;
  } catch (error: any) {
    console.error(`❌ ${jobName} error:`, error.message);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log('=== Manual Cron Job Trigger ===');
  console.log(`Base URL: ${BASE_URL}\n`);

  if (args.length === 0 || args.includes('filings') || args.includes('all')) {
    await triggerCron('Daily Filings RSS', '/api/cron/daily-filings-rss');
  }

  if (args.length === 0 || args.includes('analyst') || args.includes('all')) {
    await triggerCron('Update Analyst Data (with Stock Prices)', '/api/cron/update-analyst-data');
  }

  if (args.includes('supervisor')) {
    await triggerCron('Supervisor Health Check', '/api/cron/supervisor');
  }

  if (args.includes('alerts-morning') || args.includes('alerts')) {
    await triggerCron('Watchlist Alerts (Morning)', '/api/cron/watchlist-alerts?time=morning');
  }

  if (args.includes('alerts-evening') || args.includes('alerts')) {
    await triggerCron('Watchlist Alerts (Evening)', '/api/cron/watchlist-alerts?time=evening');
  }

  console.log('\n✨ Done!');
  console.log('\nUsage:');
  console.log('  npm run trigger-cron                  # Run all jobs');
  console.log('  npm run trigger-cron filings          # Run filings only');
  console.log('  npm run trigger-cron analyst          # Run analyst/stock prices only');
  console.log('  npm run trigger-cron supervisor       # Run supervisor only');
  console.log('  npm run trigger-cron alerts           # Run both alert digests');
  console.log('  npm run trigger-cron alerts-morning   # Run morning alerts only');
  console.log('  npm run trigger-cron alerts-evening   # Run evening alerts only');
}

main().catch(console.error);
