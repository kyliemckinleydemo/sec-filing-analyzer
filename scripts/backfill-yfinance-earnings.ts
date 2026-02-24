/**
 * @module backfill-yfinance-earnings
 * @description Backfills earnings surprise data from Yahoo Finance API for historical filings
 * 
 * PURPOSE:
 * - Retrieves analyst consensus estimates and actual earnings results from yfinance
 * - Matches earnings reports to SEC filings based on filing dates (within 90-day window)
 * - Populates consensusEPS, actualEPS, epsSurprise, and revenue fields in the database
 * - Provides free alternative to premium financial data APIs
 * - Enables analysis of earnings surprise correlation with stock returns
 * - Expected coverage: 70-90% of filings (depends on analyst coverage availability)
 * 
 * EXPORTS:
 * - backfillYFinanceEarnings(limit?: number): Main backfill function with optional test limit
 * - Executable script: Accepts command-line argument for limiting number of tickers
 * 
 * CLAUDE NOTES:
 * - Groups filings by ticker to minimize API calls (1 call per ticker vs per filing)
 * - Uses 90-day matching window to account for delayed 10-K/10-Q filing deadlines
 * - Implements 1.5s rate limiting to be respectful to Yahoo Finance servers
 * - Batch updates via Prisma transactions for better performance
 * - Processes most recent filings first (DESC order) for priority coverage
 * - Tracks multiple success metrics: data availability, complete records, match rates
 * - Includes detailed progress logging with time estimates
 * - Only processes filings that have actual returns and financial data
 * - Run with: npx tsx backfill-yfinance-earnings.ts [optional_limit]
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { yfinanceClient } from '../lib/yfinance-client';
import { hasFinancials } from './utils/has-financials';

const prisma = new PrismaClient();

async function backfillYFinanceEarnings(limit?: number) {
  console.log('📊 BACKFILLING EARNINGS DATA FROM YFINANCE\n');
  console.log('═'.repeat(80));
  console.log('Using yfinance for free earnings surprise data');
  console.log('Expected coverage: 70-90% of filings\n');
  console.log('═'.repeat(80));

  // Get all filings with actual returns (sorted by most recent)
  const allFilings = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null },
      analysisData: { not: null }
    },
    include: {
      company: {
        select: { ticker: true }
      }
    },
    orderBy: {
      filingDate: 'desc'
    }
  });

  let filings = allFilings.filter(f => hasFinancials(f) && f.company?.ticker);

  // Apply limit if specified
  if (limit) {
    filings = filings.slice(0, limit);
    console.log(`\n⚠️  TEST MODE: Limited to ${limit} filings`);
  }

  console.log(`\nFound ${filings.length} filings with returns and financials`);
  console.log(`Fetching earnings data for each ticker...\n`);

  const startTime = Date.now();
  let processed = 0;
  let success = 0;
  let noData = 0;
  let complete = 0; // Has both consensus and actual
  let errors = 0;

  // Group filings by ticker to minimize API calls
  const tickerMap = new Map<string, typeof filings>();
  for (const filing of filings) {
    const ticker = filing.company!.ticker!;
    if (!tickerMap.has(ticker)) {
      tickerMap.set(ticker, []);
    }
    tickerMap.get(ticker)!.push(filing);
  }

  console.log(`Processing ${tickerMap.size} unique tickers...\n`);

  for (const [ticker, tickerFilings] of tickerMap.entries()) {
    try {
      console.log(`[${processed + 1}/${tickerMap.size}] ${ticker}... fetching earnings history`);

      // Fetch all earnings history for this ticker (one API call per ticker)
      const response = await yfinanceClient.getEarningsHistory(ticker);

      if (!response.success || response.data.length === 0) {
        console.log(`  ⚠️  No earnings data available`);
        noData++;
        processed++;
        continue;
      }

      console.log(`  ✅ Found ${response.data.length} earnings reports`);

      // Match each filing to closest earnings report and prepare batch updates
      let matchedCount = 0;
      const updates = [];
      
      for (const filing of tickerFilings) {
        const closestEarnings = yfinanceClient.findClosestEarnings(
          response.data,
          filing.filingDate,
          90 // Within 90 days (10-K can be filed up to 90 days after quarter end)
        );

        if (!closestEarnings) {
          // Debug: Show why no match
          const filingDateStr = filing.filingDate.toISOString().split('T')[0];
          const earliestEarnings = response.data[response.data.length - 1]?.date.split('T')[0];
          const latestEarnings = response.data[0]?.date.split('T')[0];
          console.log(`    ⚠️  Filing ${filingDateStr} - no match (earnings range: ${earliestEarnings} to ${latestEarnings})`);
          continue;
        }

        // Convert to our database format
        const data = yfinanceClient.toAnalystEstimates(closestEarnings);

        // Prepare update for batch
        updates.push({
          id: filing.id,
          data: {
            consensusEPS: data.consensusEPS,
            actualEPS: data.actualEPS,
            epsSurprise: data.epsSurprise,
            consensusRevenue: data.consensusRevenue,
            actualRevenue: data.actualRevenue,
            revenueSurprise: data.revenueSurprise,
          }
        });

        matchedCount++;

        // Track stats
        const hasConsensus = !!(data.consensusEPS);
        const hasActual = !!(data.actualEPS);

        if (hasConsensus && hasActual) {
          complete++;
        }
      }

      // Batch update all filings for this ticker
      if (updates.length > 0) {
        await prisma.$transaction(
          updates.map(update => 
            prisma.filing.update({
              where: { id: update.id },
              data: update.data
            })
          )
        );
      }

      console.log(`  📝 Matched ${matchedCount}/${tickerFilings.length} filings\n`);

      if (matchedCount > 0) {
        success++;
      }

      processed++;

      // Progress logging
      if (processed % 10 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        const rate = processed / (Date.now() - startTime) * 1000 * 60; // per minute
        const remaining = (tickerMap.size - processed) / rate;
        console.log(
          `✅ Progress: ${processed}/${tickerMap.size} tickers (${((processed/tickerMap.size)*100).toFixed(1)}%) | ` +
          `${success} with data, ${complete} complete filings | ` +
          `${elapsed}m elapsed, ${remaining.toFixed(0)}m remaining\n`
        );
      }

      // Rate limiting - be respectful to Yahoo Finance
      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (error: any) {
      errors++;
      console.error(`❌ Error for ${ticker}: ${error.message}\n`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n' + '═'.repeat(80));
  console.log('✅ YFINANCE EARNINGS BACKFILL COMPLETE');
  console.log('═'.repeat(80));
  console.log(`Tickers processed: ${processed}`);
  console.log(`With earnings data: ${success} (${(success/processed*100).toFixed(1)}%)`);
  console.log(`Complete filings (EPS surprise): ${complete}`);
  console.log(`No data: ${noData}`);
  console.log(`Errors: ${errors}`);
  console.log(`Duration: ${duration} minutes`);
  console.log('═'.repeat(80));

  console.log('\n📊 Coverage Analysis:\n');
  console.log(`Filings ready for modeling: ${complete} (have EPS surprise data)`);
  console.log(`Missing data: ${noData} tickers (no analyst coverage)`);

  console.log('\n✅ Next steps:');
  console.log('1. Run analysis on earnings surprise correlations');
  console.log('2. Build model development framework');
  console.log('3. Train and evaluate prediction models\n');

  await prisma.$disconnect();
}

// Get limit from command line args: npx tsx backfill-yfinance-earnings.ts 10
const limit = process.argv[2] ? parseInt(process.argv[2]) : undefined;
backfillYFinanceEarnings(limit).catch(console.error);