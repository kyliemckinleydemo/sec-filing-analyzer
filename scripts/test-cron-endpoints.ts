/**
 * Test Cron Endpoints Locally
 *
 * This script tests all cron endpoints to ensure they work correctly
 * with CRON_SECRET authentication before deploying to production.
 */

const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('❌ ERROR: CRON_SECRET environment variable is not set');
  console.log('\nPlease set it with:');
  console.log('export CRON_SECRET=<your-secret>');
  process.exit(1);
}

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

interface CronTest {
  name: string;
  path: string;
  schedule: string;
}

const cronJobs: CronTest[] = [
  {
    name: 'Daily Filings RSS',
    path: '/api/cron/daily-filings-rss',
    schedule: '2:00 AM daily'
  },
  {
    name: 'Update Analyst Data',
    path: '/api/cron/update-analyst-data',
    schedule: '2:30 AM daily'
  },
  {
    name: 'Paper Trading Close Positions',
    path: '/api/cron/paper-trading-close-positions',
    schedule: '3:00 AM daily'
  }
];

async function testCronEndpoint(job: CronTest): Promise<boolean> {
  console.log(`\n🧪 Testing: ${job.name}`);
  console.log(`   Path: ${job.path}`);
  console.log(`   Schedule: ${job.schedule}`);

  try {
    // Test without authentication
    console.log('   ⚠️  Testing without auth header...');
    const unauthResponse = await fetch(`${BASE_URL}${job.path}`);

    if (unauthResponse.status === 401) {
      console.log('   ✅ Correctly rejected unauthorized request');
    } else {
      console.log(`   ⚠️  Expected 401, got ${unauthResponse.status} (might not have CRON_SECRET set)`);
    }

    // Test with authentication
    console.log('   🔐 Testing with auth header...');
    const authResponse = await fetch(`${BASE_URL}${job.path}`, {
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`
      }
    });

    const data = await authResponse.json();

    if (authResponse.ok) {
      console.log('   ✅ Successfully authenticated');
      console.log(`   📊 Response:`, JSON.stringify(data, null, 2).substring(0, 200));
      return true;
    } else {
      console.log(`   ❌ Failed with status ${authResponse.status}`);
      console.log(`   📊 Response:`, data);
      return false;
    }

  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🔍 CRON ENDPOINT TESTING\n');
  console.log('═'.repeat(80));
  console.log(`Testing against: ${BASE_URL}`);
  console.log(`Using CRON_SECRET: ${CRON_SECRET.substring(0, 10)}...`);
  console.log('═'.repeat(80));

  const results: { [key: string]: boolean } = {};

  for (const job of cronJobs) {
    const success = await testCronEndpoint(job);
    results[job.name] = success;

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '═'.repeat(80));
  console.log('📊 TEST RESULTS\n');

  let allPassed = true;
  for (const [name, success] of Object.entries(results)) {
    const status = success ? '✅ PASS' : '❌ FAIL';
    console.log(`   ${status} - ${name}`);
    if (!success) allPassed = false;
  }

  console.log('\n' + '═'.repeat(80));

  if (allPassed) {
    console.log('✅ All tests passed! Ready to deploy.');
  } else {
    console.log('❌ Some tests failed. Please review errors above.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
