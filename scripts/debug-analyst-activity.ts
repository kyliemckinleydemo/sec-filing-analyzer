/**
 * Debug Analyst Activity Date Filtering
 *
 * Understand why we're getting 0% coverage
 */

import { prisma } from '../lib/prisma';
import yahooFinance from 'yahoo-finance2';

async function debugAnalystActivity() {
  console.log('🔍 DEBUGGING ANALYST ACTIVITY DATE FILTERING\n');
  console.log('═'.repeat(80));

  // Get a sample of recent filings from a major ticker
  const sampleFilings = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null },
      filingType: { in: ['10-K', '10-Q'] },
      company: {
        ticker: 'AAPL' // Start with Apple as test case
      }
    },
    include: { company: true },
    orderBy: { filingDate: 'desc' },
    take: 5
  });

  console.log(`\n📊 Found ${sampleFilings.length} AAPL filings to debug\n`);

  for (const filing of sampleFilings) {
    const ticker = filing.company?.ticker;
    if (!ticker) continue;

    console.log('\n' + '─'.repeat(80));
    console.log(`\n🔍 ${ticker} - Filing ${filing.filingType}`);
    console.log(`   Filing Date: ${filing.filingDate.toISOString()}`);
    console.log(`   Filing Date (local): ${filing.filingDate.toLocaleDateString()} ${filing.filingDate.toLocaleTimeString()}`);

    try {
      // Fetch upgrade/downgrade history
      const quote = await yahooFinance.quoteSummary(ticker, {
        modules: ['upgradeDowngradeHistory']
      });

      const history = quote.upgradeDowngradeHistory?.history || [];
      console.log(`\n   📈 Total analyst events in history: ${history.length}`);

      if (history.length === 0) {
        console.log('   ⚠️  No analyst history available for this ticker');
        continue;
      }

      // Show date range of all events
      const eventDates = history
        .filter(e => e.epochGradeDate)
        .map(e => new Date(e.epochGradeDate! * 1000));

      if (eventDates.length > 0) {
        const sortedDates = eventDates.sort((a, b) => a.getTime() - b.getTime());
        console.log(`   📅 Event date range:`);
        console.log(`      Earliest: ${sortedDates[0].toISOString()}`);
        console.log(`      Latest: ${sortedDates[sortedDates.length - 1].toISOString()}`);
      }

      // Calculate 7-day window
      const sevenDaysBefore = new Date(filing.filingDate);
      sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7);

      console.log(`\n   🎯 Target 7-day window:`);
      console.log(`      Start: ${sevenDaysBefore.toISOString()}`);
      console.log(`      End: ${filing.filingDate.toISOString()}`);

      // Show most recent 10 events with detailed info
      console.log(`\n   📋 Most recent 10 analyst events:`);
      const recentTen = history
        .filter(e => e.epochGradeDate)
        .sort((a, b) => (b.epochGradeDate! - a.epochGradeDate!))
        .slice(0, 10);

      recentTen.forEach((event, idx) => {
        const eventDate = new Date(event.epochGradeDate! * 1000);
        const inWindow = eventDate >= sevenDaysBefore && eventDate <= filing.filingDate;

        console.log(`\n      ${idx + 1}. ${eventDate.toISOString()}`);
        console.log(`         Firm: ${event.firm}`);
        console.log(`         From: ${event.fromGrade || 'N/A'} → To: ${event.toGrade}`);
        console.log(`         In 7-day window? ${inWindow ? '✅ YES' : '❌ NO'}`);

        if (!inWindow) {
          const daysDiff = Math.floor((filing.filingDate.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
          console.log(`         Days before filing: ${daysDiff}`);
        }
      });

      // Filter events in 7-day window
      const eventsInWindow = history.filter(event => {
        if (!event.epochGradeDate) return false;
        const eventDate = new Date(event.epochGradeDate * 1000);
        return eventDate >= sevenDaysBefore && eventDate <= filing.filingDate;
      });

      console.log(`\n   🎯 Events in 7-day window: ${eventsInWindow.length}`);

      if (eventsInWindow.length > 0) {
        console.log(`\n   ✅ Found ${eventsInWindow.length} events in window!`);
        eventsInWindow.forEach(event => {
          const eventDate = new Date(event.epochGradeDate! * 1000);
          console.log(`      ${eventDate.toISOString()} - ${event.firm} - ${event.toGrade}`);
        });
      } else {
        console.log(`\n   ❌ No events found in 7-day window`);
        console.log(`\n   💡 Possible reasons:`);
        console.log(`      1. Filing dates may be in the past, analyst events are more recent`);
        console.log(`      2. Need wider time window (e.g., 30 days)`);
        console.log(`      3. Event dates don't align with filing dates for this ticker`);
      }

    } catch (error) {
      console.log(`\n   ❌ Error: ${(error as Error).message}`);
    }
  }

  console.log('\n\n' + '═'.repeat(80));
  console.log('📋 DIAGNOSIS COMPLETE\n');

  await prisma.$disconnect();
}

debugAnalystActivity().catch(console.error);
