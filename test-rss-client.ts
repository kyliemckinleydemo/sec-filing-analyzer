import { secRSSClient } from './lib/sec-rss-client';

async function testRSSClient() {
  console.log('Testing SEC RSS Client...\n');

  try {
    // Test 1: Fetch recent filings from RSS
    console.log('=== Test 1: Fetching recent filings from RSS ===');
    const recentFilings = await secRSSClient.fetchRecentFilingsFromRSS(['10-K', '10-Q', '8-K']);
    console.log(`Found ${recentFilings.length} recent filings from top 1,000 companies`);
    if (recentFilings.length > 0) {
      console.log('Sample filing:', recentFilings[0]);
    }
    console.log('');

    // Test 2: Fetch from a specific daily index (yesterday)
    console.log('=== Test 2: Fetching from daily index (yesterday) ===');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dailyFilings = await secRSSClient.fetchFromDailyIndex(yesterday, ['10-K', '10-Q', '8-K']);
    console.log(`Found ${dailyFilings.length} filings from ${yesterday.toDateString()}`);
    if (dailyFilings.length > 0) {
      console.log('Sample filing:', dailyFilings[0]);
    }
    console.log('');

    // Test 3: Test catch-up mode (last 3 days)
    console.log('=== Test 3: Testing catch-up mode (last 3 days) ===');
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const catchupFilings = await secRSSClient.fetchMissedDays(threeDaysAgo, yesterday, ['10-K']);
    console.log(`Found ${catchupFilings.length} total filings over 3 days`);
    console.log('');

    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testRSSClient();
