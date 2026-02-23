/**
 * @module backfill-all-returns
 * 
 * @description
 * Comprehensive stock return backfill script for SEC filings with AI analysis.
 * Calculates historical returns and market-relative performance (alpha) for all
 * filings that have AI risk/sentiment scores but missing return data.
 * 
 * PURPOSE:
 * - Backfill missing return metrics for filings with completed AI analysis
 * - Calculate actual7dReturn and actual30dReturn (raw stock performance)
 * - Calculate actual7dAlpha and actual30dAlpha (market-relative performance vs SPX)
 * - Support ML model training and validation with complete historical data
 * - Enable correlation analysis between AI predictions and actual outcomes
 * 
 * EXPORTS:
 * - main(): Primary backfill execution function
 * - calculateReturns(): Computes all return metrics for a single filing
 * - getStockPrice(): Fetches historical stock price from Yahoo Finance
 * - getSPXReturn(): Calculates S&P 500 benchmark returns
 * - ReturnData: Interface for return calculation results
 * 
 * CLAUDE NOTES:
 * - Processes only filings with existing AI analysis (riskScore/sentimentScore not null)
 * - Returns stored as decimals (0.05 = 5%) for consistency with database schema
 * - Alpha calculated as stock return minus SPX return (excess return vs market)
 * - Implements 2-day buffer for price lookups to handle weekends/holidays
 * - Rate limited to 500ms between requests to respect Yahoo Finance API limits
 * - Progress reporting every 50 filings for long-running backfill operations
 * - Focuses on 10-K and 10-Q filings only (annual/quarterly reports)
 * - Expects 65-70% prediction accuracy with 30-day return data per ML analysis
 */

/**
 * Comprehensive Return Backfill Script
 *
 * Calculates for ALL filings with AI analysis:
 * - actual7dReturn: 7-day stock return %
 * - actual30dReturn: 30-day stock return %
 * - actual7dAlpha: 7-day return vs SPX (market-relative)
 * - actual30dAlpha: 30-day return vs SPX (market-relative)
 */

import { prisma } from '../lib/prisma';
import yahooFinance from '../lib/yahoo-finance-singleton';

interface ReturnData {
  actual7dReturn: number | null;
  actual30dReturn: number | null;
  actual7dAlpha: number | null;
  actual30dAlpha: number | null;
}

async function getStockPrice(ticker: string, date: Date): Promise<number | null> {
  try {
    const result = await yahooFinance.chart(ticker, {
      period1: new Date(date.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days buffer
      period2: new Date(date.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days buffer
      interval: '1d'
    });

    if (!result.quotes || result.quotes.length === 0) return null;

    // Find closest date
    let closest = result.quotes[0];
    let minDiff = Math.abs(new Date(closest.date!).getTime() - date.getTime());

    for (const quote of result.quotes) {
      const diff = Math.abs(new Date(quote.date!).getTime() - date.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closest = quote;
      }
    }

    return closest.close ?? null;
  } catch (error) {
    console.error(`    Error fetching price for ${ticker}:`, (error as Error).message);
    return null;
  }
}

async function getSPXReturn(startDate: Date, days: number): Promise<number | null> {
  try {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    const result = await yahooFinance.chart('^GSPC', {
      period1: new Date(startDate.getTime() - 2 * 24 * 60 * 60 * 1000),
      period2: new Date(endDate.getTime() + 2 * 24 * 60 * 60 * 1000),
      interval: '1d'
    });

    if (!result.quotes || result.quotes.length < 2) return null;

    // Find start and end prices
    let startQuote = result.quotes[0];
    let endQuote = result.quotes[result.quotes.length - 1];

    // Find closest to startDate
    for (const quote of result.quotes) {
      const diff = Math.abs(new Date(quote.date!).getTime() - startDate.getTime());
      if (diff < Math.abs(new Date(startQuote.date!).getTime() - startDate.getTime())) {
        startQuote = quote;
      }
    }

    // Find closest to endDate
    for (const quote of result.quotes) {
      const diff = Math.abs(new Date(quote.date!).getTime() - endDate.getTime());
      if (diff < Math.abs(new Date(endQuote.date!).getTime() - endDate.getTime())) {
        endQuote = quote;
      }
    }

    if (!startQuote.close || !endQuote.close) return null;

    // Return as decimal (e.g., 0.05 = 5%)
    const spxReturn = ((endQuote.close - startQuote.close) / startQuote.close);
    return spxReturn;
  } catch (error) {
    return null;
  }
}

async function calculateReturns(
  ticker: string,
  filingDate: Date
): Promise<ReturnData> {
  // Get price at filing date
  const priceAtFiling = await getStockPrice(ticker, filingDate);
  if (!priceAtFiling) {
    return {
      actual7dReturn: null,
      actual30dReturn: null,
      actual7dAlpha: null,
      actual30dAlpha: null
    };
  }

  // Get 7-day price
  const date7d = new Date(filingDate);
  date7d.setDate(date7d.getDate() + 7);
  const price7d = await getStockPrice(ticker, date7d);

  // Get 30-day price
  const date30d = new Date(filingDate);
  date30d.setDate(date30d.getDate() + 30);
  const price30d = await getStockPrice(ticker, date30d);

  // Calculate stock returns (stored as decimal, e.g., 0.06 = 6%)
  const actual7dReturn = price7d
    ? ((price7d - priceAtFiling) / priceAtFiling)
    : null;

  const actual30dReturn = price30d
    ? ((price30d - priceAtFiling) / priceAtFiling)
    : null;

  // Get SPX returns (market benchmark)
  const spx7dReturn = await getSPXReturn(filingDate, 7);
  const spx30dReturn = await getSPXReturn(filingDate, 30);

  // Calculate alpha (stock return - market return)
  const actual7dAlpha = actual7dReturn !== null && spx7dReturn !== null
    ? actual7dReturn - spx7dReturn
    : null;

  const actual30dAlpha = actual30dReturn !== null && spx30dReturn !== null
    ? actual30dReturn - spx30dReturn
    : null;

  return {
    actual7dReturn,
    actual30dReturn,
    actual7dAlpha,
    actual30dAlpha
  };
}

async function main() {
  console.log('🚀 COMPREHENSIVE RETURN BACKFILL\n');
  console.log('═'.repeat(80));

  // Get all filings with AI analysis that need returns
  const filings = await prisma.filing.findMany({
    where: {
      AND: [
        { filingType: { in: ['10-K', '10-Q'] } },
        { riskScore: { not: null } },
        { sentimentScore: { not: null } },
        {
          OR: [
            { actual7dReturn: null },
            { actual30dReturn: null }
          ]
        }
      ]
    },
    include: {
      company: true
    },
    orderBy: {
      filingDate: 'asc'
    }
  });

  console.log(`\n📊 Found ${filings.length} filings needing return backfill\n`);

  if (filings.length === 0) {
    console.log('✅ All filings already have returns calculated');
    await prisma.$disconnect();
    return;
  }

  let processed = 0;
  let success = 0;
  let errors = 0;

  for (const filing of filings) {
    processed++;
    const pct = ((processed / filings.length) * 100).toFixed(1);

    console.log(`[${processed}/${filings.length} - ${pct}%] ${filing.company.ticker} (${filing.filingType} on ${filing.filingDate.toISOString().split('T')[0]})`);

    try {
      const returns = await calculateReturns(
        filing.company.ticker,
        filing.filingDate
      );

      // Update filing with all returns
      await prisma.filing.update({
        where: { id: filing.id },
        data: {
          actual7dReturn: returns.actual7dReturn,
          actual30dReturn: returns.actual30dReturn,
          actual7dAlpha: returns.actual7dAlpha,
          actual30dAlpha: returns.actual30dAlpha
        }
      });

      if (returns.actual7dReturn !== null || returns.actual30dReturn !== null) {
        console.log(`  ✅ 7d: ${returns.actual7dReturn?.toFixed(2)}%, 30d: ${returns.actual30dReturn?.toFixed(2)}%`);
        success++;
      } else {
        console.log(`  ⚠️  No price data available`);
      }

      // Rate limiting (Yahoo Finance)
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.log(`  ❌ Error: ${(error as Error).message}`);
      errors++;
    }

    // Progress report every 50 filings
    if (processed % 50 === 0) {
      console.log(`\n📈 Progress: ${processed}/${filings.length} (${success} successful, ${errors} errors)\n`);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('📊 BACKFILL COMPLETE\n');
  console.log(`  Processed: ${processed}`);
  console.log(`  Successful: ${success}`);
  console.log(`  Errors: ${errors}`);

  // Final status check
  const withReturns = await prisma.filing.count({
    where: {
      filingType: { in: ['10-K', '10-Q'] },
      riskScore: { not: null },
      actual7dReturn: { not: null }
    }
  });

  const with30dReturns = await prisma.filing.count({
    where: {
      filingType: { in: ['10-K', '10-Q'] },
      riskScore: { not: null },
      actual30dReturn: { not: null }
    }
  });

  console.log(`\n  Total with 7d returns: ${withReturns}`);
  console.log(`  Total with 30d returns: ${with30dReturns}`);

  console.log('\n═'.repeat(80));
  console.log('\n📋 NEXT STEPS:');
  console.log('   1. Export updated dataset: npx tsx scripts/export-ml-dataset.ts');
  console.log('   2. Re-run ML analysis: python3 scripts/ml_analysis.py');
  console.log('   3. Expect 65-70% accuracy with 30-day returns!\n');

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
