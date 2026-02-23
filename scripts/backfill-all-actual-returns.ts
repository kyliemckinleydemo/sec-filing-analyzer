/**
 * @module backfill-all-actual-returns
 * @description Script to backfill 7-day actual stock returns for analyzed SEC filings with financials
 * 
 * PURPOSE:
 * - Calculates and backfills actual 7-day stock returns for historical SEC filings
 * - Only processes filings that are >7 days old, have analysis data, and contain financial statements
 * - Retrieves historical stock price data from Yahoo Finance for the 7-day period after filing
 * - Computes percentage return: ((lastPrice - firstPrice) / firstPrice) * 100
 * - Updates Filing records with actual7dReturn field for model validation and backtesting
 * - Filters to financials-only filings using hasFinancials utility (10-K, 10-Q, 8-K with balance sheets)
 * - Implements rate limiting (5 requests/second) to comply with Yahoo Finance API constraints
 * 
 * EXPORTS:
 * - calculateActualReturn: Async function to calculate 7-day return for a ticker from filing date
 * - backfillActualReturns: Main async function that orchestrates the backfill process
 * 
 * CLAUDE NOTES:
 * - Script is designed for one-time/periodic execution, not continuous service
 * - Requires filings to be >7 days old to ensure complete 7-day trading window
 * - Only processes filings with analysisData (already analyzed by AI)
 * - Filters using hasFinancials() to match production analysis pipeline criteria
 * - Handles missing data gracefully (returns null if insufficient quotes)
 * - Progress logging every 50 filings with ETA calculation
 * - 200ms delay between requests for Yahoo Finance rate limiting
 * - Disconnects Prisma client on completion
 */

import { PrismaClient } from '@prisma/client';
import yahooFinance from '../lib/yahoo-finance-singleton';
import { hasFinancials } from './utils/has-financials';

const prisma = new PrismaClient();

yahooFinance.setGlobalConfig({
  validation: {
    logErrors: false
  }
});

async function calculateActualReturn(ticker: string, filingDate: Date): Promise<number | null> {
  try {
    const startDate = new Date(filingDate);
    startDate.setDate(startDate.getDate() + 1); // Start day after filing

    const endDate = new Date(filingDate);
    endDate.setDate(endDate.getDate() + 8); // End 7 trading days later

    const quotes = await yahooFinance.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    });

    if (quotes.length < 2) return null;

    const firstPrice = quotes[0].close;
    const lastPrice = quotes[quotes.length - 1].close;

    return ((lastPrice - firstPrice) / firstPrice) * 100;
  } catch (error) {
    return null;
  }
}

async function backfillActualReturns() {
  console.log('📊 ACTUAL RETURNS BACKFILL STARTED (FINANCIALS ONLY)');
  console.log('═'.repeat(80));

  const startTime = Date.now();

  // Get filings >7 days old without actual returns
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const allFilings = await prisma.filing.findMany({
    where: {
      filingDate: { lt: sevenDaysAgo },
      filingType: { in: ['10-K', '10-Q', '8-K'] },
      actual7dReturn: null,
      analysisData: { not: null },
      company: {
        ticker: { not: '' }
      }
    },
    include: {
      company: {
        select: {
          ticker: true
        }
      }
    },
    orderBy: {
      filingDate: 'desc'
    }
  });

  // Filter for only filings with financials
  const filings = allFilings.filter(filing => hasFinancials(filing));

  console.log(`\n📊 Fetched ${allFilings.length} analyzed filings`);
  console.log(`✅ Filtered to ${filings.length} filings WITH FINANCIALS`);
  console.log(`❌ Excluded ${allFilings.length - filings.length} filings without financials\n`);

  let processed = 0;
  let updated = 0;
  let errors = 0;

  for (const filing of filings) {
    try {
      processed++;

      if (!filing.company.ticker) {
        errors++;
        continue;
      }

      const actualReturn = await calculateActualReturn(filing.company.ticker, filing.filingDate);

      if (actualReturn !== null) {
        await prisma.filing.update({
          where: { id: filing.id },
          data: { actual7dReturn: actualReturn }
        });
        updated++;
      } else {
        errors++;
      }

      if (processed % 50 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        const rate = processed / (Date.now() - startTime) * 1000;
        const remaining = (filings.length - processed) / rate / 60;
        console.log(`✅ Progress: ${processed}/${filings.length} (${((processed/filings.length)*100).toFixed(1)}%) | ${elapsed}m elapsed | ${remaining.toFixed(0)}m remaining`);
      }

      // Rate limiting - 5 requests per second
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error: any) {
      errors++;
      if (processed % 50 === 0) {
        console.error(`❌ Error processing ${filing.accessionNumber}:`, error.message);
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n' + '═'.repeat(80));
  console.log('✅ ACTUAL RETURNS BACKFILL COMPLETE');
  console.log('═'.repeat(80));
  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`Duration: ${duration} minutes`);
  console.log('═'.repeat(80));

  await prisma.$disconnect();
}

backfillActualReturns().catch(console.error);
