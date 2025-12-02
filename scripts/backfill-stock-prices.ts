/**
 * Backfill Stock Prices and Calculate Actual Returns
 *
 * For each filing with analysis data:
 * 1. Fetch stock prices for filing date and 7 days after
 * 2. Calculate actual 7-day return
 * 3. Store in database
 *
 * Uses Yahoo Finance for historical price data
 */

import { prisma } from '../lib/prisma';
import yahooFinance from 'yahoo-finance2';

interface PriceData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function getHistoricalPrices(
  ticker: string,
  startDate: Date,
  endDate: Date
): Promise<PriceData[]> {
  try {
    const result = await yahooFinance.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    return result.map((quote) => ({
      date: quote.date,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      close: quote.close,
      volume: quote.volume,
    }));
  } catch (error: any) {
    console.error(`Error fetching ${ticker}:`, error.message);
    return [];
  }
}

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;

  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    // Skip weekends
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }

  return result;
}

async function backfillStockPrices(options: {
  limitFilings?: number;
  delayMs?: number;
}) {
  const { limitFilings = 1000, delayMs = 200 } = options;

  console.log('📈 Starting stock price backfill...\n');

  // Get filings with analysis data but no actual return
  const filings = await prisma.filing.findMany({
    where: {
      AND: [
        { analysisData: { not: null } },
        { riskScore: { not: null } },
        { sentimentScore: { not: null } },
        { actual7dReturn: null }, // Not yet calculated
      ],
    },
    include: {
      company: true,
    },
    orderBy: {
      filingDate: 'desc',
    },
    take: limitFilings,
  });

  console.log(`Found ${filings.length} filings to process\n`);

  let processed = 0;
  let success = 0;
  let errors = 0;
  let skipped = 0;

  for (const filing of filings) {
    processed++;
    const ticker = filing.company.ticker;

    console.log(`[${processed}/${filings.length}] Processing ${ticker} - ${filing.filingType} on ${filing.filingDate.toISOString().split('T')[0]}...`);

    try {
      // Get price data from filing date to 7 business days after
      const startDate = new Date(filing.filingDate);
      const endDate = addBusinessDays(startDate, 10); // Extra buffer for holidays

      const prices = await getHistoricalPrices(ticker, startDate, endDate);

      if (prices.length < 2) {
        console.log(`  ⚠️  Insufficient price data (${prices.length} days)`);
        skipped++;
        continue;
      }

      // Find filing date price and 7 business days later
      const filingDatePrice = prices.find(p =>
        p.date.toISOString().split('T')[0] === filing.filingDate.toISOString().split('T')[0]
      );

      if (!filingDatePrice) {
        // Try to find closest price within 3 days
        const filingDateStr = filing.filingDate.toISOString().split('T')[0];
        const closestPrice = prices
          .filter(p => {
            const daysDiff = Math.abs(
              (p.date.getTime() - filing.filingDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            return daysDiff <= 3;
          })
          .sort((a, b) =>
            Math.abs(a.date.getTime() - filing.filingDate.getTime()) -
            Math.abs(b.date.getTime() - filing.filingDate.getTime())
          )[0];

        if (!closestPrice) {
          console.log(`  ⚠️  No price found near filing date`);
          skipped++;
          continue;
        }

        console.log(`  ℹ️  Using closest price: ${closestPrice.date.toISOString().split('T')[0]}`);
      }

      const startPrice = filingDatePrice ? filingDatePrice.close : prices[0].close;

      // Find price 7 business days later (or closest available)
      const targetDate = addBusinessDays(filing.filingDate, 7);
      let endPrice: number | null = null;

      // Look for price closest to 7 days after
      const sortedPrices = prices
        .filter(p => p.date >= filing.filingDate)
        .sort((a, b) =>
          Math.abs(a.date.getTime() - targetDate.getTime()) -
          Math.abs(b.date.getTime() - targetDate.getTime())
        );

      if (sortedPrices.length >= 2) {
        endPrice = sortedPrices[1].close; // Take second entry (first is filing date)
      } else if (prices.length >= 2) {
        endPrice = prices[prices.length - 1].close;
      }

      if (!endPrice) {
        console.log(`  ⚠️  No end price found`);
        skipped++;
        continue;
      }

      // Calculate 7-day return
      const return7d = ((endPrice - startPrice) / startPrice) * 100;

      // Update filing with actual return
      await prisma.filing.update({
        where: { id: filing.id },
        data: {
          actual7dReturn: return7d,
        },
      });

      // Store stock prices
      for (const price of prices) {
        await prisma.stockPrice.upsert({
          where: {
            ticker_date: {
              ticker: ticker,
              date: price.date,
            },
          },
          create: {
            ticker: ticker,
            date: price.date,
            open: price.open,
            high: price.high,
            low: price.low,
            close: price.close,
            volume: price.volume,
            filingId: filing.id,
          },
          update: {
            open: price.open,
            high: price.high,
            low: price.low,
            close: price.close,
            volume: price.volume,
          },
        });
      }

      console.log(`  ✅ Return: ${return7d > 0 ? '+' : ''}${return7d.toFixed(2)}% (${prices.length} price points)`);
      success++;

    } catch (error: any) {
      console.error(`  ❌ Error: ${error.message}`);
      errors++;
    }

    // Rate limiting
    if (processed < filings.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Stock Price Backfill Complete');
  console.log('='.repeat(60));
  console.log(`Processed: ${processed}`);
  console.log(`Success: ${success}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log('='.repeat(60) + '\n');
}

async function main() {
  try {
    await backfillStockPrices({
      limitFilings: 1000, // Process first 1000 filings
      delayMs: 200, // 200ms between requests
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('Fatal error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
