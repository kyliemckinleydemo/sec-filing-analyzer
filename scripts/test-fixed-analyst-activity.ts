/**
 * Test Fixed Analyst Activity Date Parsing
 */

import { prisma } from '../lib/prisma';
import yahooFinance from 'yahoo-finance2';

async function testFixed() {
  console.log('🔍 TESTING FIXED ANALYST ACTIVITY\n');
  console.log('═'.repeat(80));

  // Get a recent 2025 filing
  const recentFiling = await prisma.filing.findFirst({
    where: {
      actual7dReturn: { not: null },
      filingDate: { gte: new Date('2025-09-01') }
    },
    include: { company: true },
    orderBy: { filingDate: 'desc' }
  });

  if (!recentFiling) {
    console.log('❌ No recent 2025 filings found');
    await prisma.$disconnect();
    return;
  }

  const ticker = recentFiling.company?.ticker;
  if (!ticker) {
    console.log('❌ No ticker found');
    await prisma.$disconnect();
    return;
  }

  console.log(`\n📊 Testing ${ticker} - ${recentFiling.filingType}`);
  console.log(`   Filing Date: ${recentFiling.filingDate.toISOString()}`);

  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ['upgradeDowngradeHistory']
    });

    const history = quote.upgradeDowngradeHistory?.history || [];
    console.log(`\n   Total events: ${history.length}`);

    // Calculate 7-day window
    const sevenDaysBefore = new Date(recentFiling.filingDate);
    sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7);

    console.log(`\n   7-day window:`);
    console.log(`      Start: ${sevenDaysBefore.toISOString()}`);
    console.log(`      End: ${recentFiling.filingDate.toISOString()}`);

    // FIXED: Don't multiply by 1000
    const recentEvents = history.filter(event => {
      if (!event.epochGradeDate) return false;
      const eventDate = new Date(event.epochGradeDate);
      return eventDate >= sevenDaysBefore && eventDate <= recentFiling.filingDate;
    });

    console.log(`\n   ✅ Events in 7-day window: ${recentEvents.length}`);

    if (recentEvents.length > 0) {
      console.log('\n   📋 Events found:');
      recentEvents.forEach(event => {
        const eventDate = new Date(event.epochGradeDate!);
        const action = event.fromGrade
          ? (event.toGrade > event.fromGrade ? 'UPGRADE' : 'DOWNGRADE')
          : 'INITIATED';

        console.log(`\n      ${eventDate.toISOString()}`);
        console.log(`      Firm: ${event.firm}`);
        console.log(`      ${event.fromGrade || 'N/A'} → ${event.toGrade}`);
        console.log(`      Action: ${action}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
  }

  console.log('\n' + '═'.repeat(80));
  await prisma.$disconnect();
}

testFixed().catch(console.error);
