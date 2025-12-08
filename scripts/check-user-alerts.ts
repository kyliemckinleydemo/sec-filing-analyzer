import { prisma } from '../lib/prisma';

async function checkUserAlerts() {
  const email = 'john@greatfallsventures.com';

  console.log('\n=== User Alert Configuration Check ===\n');

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      alerts: true,
      watchlist: true
    }
  });

  if (!user) {
    console.log('❌ User not found with email:', email);
    console.log('\nYou need to:');
    console.log('1. Go to https://stockhuntr.net');
    console.log('2. Sign in with magic link');
    return;
  }

  console.log('✅ User found:', user.email);
  console.log('User ID:', user.id);
  console.log('\n--- Alerts Configuration ---');

  if (user.alerts.length === 0) {
    console.log('❌ No alerts configured');
    console.log('\nYou need to:');
    console.log('1. Go to https://stockhuntr.net/alerts');
    console.log('2. Add at least one alert type (e.g., "New Filing")');
  } else {
    console.log(`✅ Found ${user.alerts.length} alert(s):`);
    user.alerts.forEach(alert => {
      console.log(`  - ${alert.alertType} (${alert.enabled ? 'ENABLED' : 'DISABLED'})`);
      console.log(`    Frequency: ${alert.frequency}`);
      console.log(`    Delivery Time: ${alert.deliveryTime}`);
      if (alert.minConcernLevel) console.log(`    Min Concern: ${alert.minConcernLevel}`);
      if (alert.minPredictedReturn) console.log(`    Min Return: ${alert.minPredictedReturn}%`);
    });
  }

  console.log('\n--- Watchlist ---');

  if (user.watchlist.length === 0) {
    console.log('❌ No companies in watchlist');
    console.log('\nYou need to:');
    console.log('1. Search for a company (e.g., AAPL)');
    console.log('2. Click "Add to Watchlist"');
  } else {
    console.log(`✅ Watching ${user.watchlist.length} companies:`);
    user.watchlist.forEach(item => {
      console.log(`  - ${item.ticker}`);
    });
  }

  // Check for recent filings on watchlist companies
  if (user.watchlist.length > 0) {
    console.log('\n--- Recent Filings (Last 14 Hours) ---');
    const windowStart = new Date(Date.now() - 14 * 60 * 60 * 1000);
    const tickers = user.watchlist.map(w => w.ticker);

    const recentFilings = await prisma.filing.findMany({
      where: {
        company: {
          ticker: { in: tickers }
        },
        filingDate: {
          gte: windowStart
        }
      },
      include: {
        company: {
          select: {
            ticker: true,
            name: true
          }
        }
      },
      orderBy: { filingDate: 'desc' }
    });

    if (recentFilings.length === 0) {
      console.log('No recent filings in the last 14 hours for your watchlist companies');
    } else {
      console.log(`Found ${recentFilings.length} recent filing(s):`);
      recentFilings.forEach(filing => {
        console.log(`  - ${filing.company.ticker}: ${filing.filingType} on ${filing.filingDate.toISOString()}`);
      });
    }
  }

  await prisma.$disconnect();
}

checkUserAlerts().catch(console.error);
