import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from 'yahoo-finance2';

// Suppress yahoo-finance2 survey notice
yahooFinance.suppressNotices(['yahooSurvey']);

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily Cron Job: Update stock prices for active companies
 *
 * Updates current price, market cap, P/E, and other key metrics
 * for companies that have filed in the past 30 days
 */

export async function GET(request: Request) {
  const startTime = Date.now();

  // Verify request is from Vercel cron or has valid auth header
  const authHeader = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent');
  const cronSecret = process.env.CRON_SECRET;

  // Check multiple indicators that this is a Vercel cron request
  const isVercelCron = userAgent?.includes('vercel-cron/') ||
                       request.headers.get('x-vercel-cron') === '1' ||
                       request.headers.get('user-agent')?.toLowerCase().includes('vercel');
  const hasValidAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasValidAuth) {
    console.error('[StockPriceCron] ❌ Unauthorized request', {
      userAgent,
      hasAuthHeader: !!authHeader,
      hasCronSecret: !!cronSecret
    });
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  let stockPriceUpdates = 0;
  let stockPriceErrors = 0;
  let skippedCompanies = 0;

  try {
    console.log('[StockPriceCron] 🚀 Starting stock price update job...');

    // Get companies with recent filings (past 30 days) - these are priority
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeCompanies = await prisma.company.findMany({
      where: {
        filings: {
          some: {
            filingDate: {
              gte: thirtyDaysAgo
            }
          }
        }
      },
      select: { id: true, ticker: true }
    });

    console.log(`[StockPriceCron] 📊 Found ${activeCompanies.length} companies with filings in past 30 days`);

    // Update in batches to avoid rate limits and timeout
    const BATCH_SIZE = 50; // Reduced from 100 for better reliability
    const BATCH_DELAY_MS = 2000;
    const REQUEST_DELAY_MS = 150; // Slightly increased delay

    const totalBatches = Math.ceil(activeCompanies.length / BATCH_SIZE);

    for (let i = 0; i < activeCompanies.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batch = activeCompanies.slice(i, i + BATCH_SIZE);

      console.log(`[StockPriceCron] 🔄 Processing batch ${batchNum}/${totalBatches} (${batch.length} companies)`);

      for (const company of batch) {
        try {
          // Check if we're approaching timeout (leave 30s buffer)
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          if (elapsedSeconds > 270) { // 4.5 minutes
            console.log(`[StockPriceCron] ⏱️  Approaching timeout at ${elapsedSeconds}s, stopping early`);
            console.log(`[StockPriceCron] 📈 Partial completion: ${stockPriceUpdates} updated, ${stockPriceErrors} errors, ${skippedCompanies} skipped`);
            return NextResponse.json({
              success: true,
              partial: true,
              message: `Partial update: ${stockPriceUpdates} updated (timeout protection)`,
              results: {
                updated: stockPriceUpdates,
                errors: stockPriceErrors,
                skipped: skippedCompanies,
                elapsedSeconds: Math.round(elapsedSeconds)
              }
            });
          }

          // Fetch latest quote data with timeout protection
          const quotePromise = yahooFinance.quoteSummary(company.ticker, {
            modules: ['price', 'summaryDetail', 'financialData']
          });

          // Add timeout to individual requests (10 seconds max)
          const quote = await Promise.race([
            quotePromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Request timeout')), 10000)
            )
          ]) as any;

          const price = quote.price;
          const summaryDetail = quote.summaryDetail;
          const financialData = quote.financialData;

          if (price || summaryDetail || financialData) {
            await prisma.company.update({
              where: { id: company.id },
              data: {
                currentPrice: price?.regularMarketPrice ?? null,
                marketCap: price?.marketCap ?? null,
                peRatio: summaryDetail?.trailingPE ?? null,
                forwardPE: summaryDetail?.forwardPE ?? null,
                beta: summaryDetail?.beta ?? null,
                dividendYield: summaryDetail?.dividendYield ?? null,
                fiftyTwoWeekHigh: summaryDetail?.fiftyTwoWeekHigh ?? null,
                fiftyTwoWeekLow: summaryDetail?.fiftyTwoWeekLow ?? null,
                volume: price?.regularMarketVolume ? BigInt(price.regularMarketVolume) : null,
                averageVolume: summaryDetail?.averageVolume ? BigInt(summaryDetail.averageVolume) : null,
                analystTargetPrice: financialData?.targetMeanPrice ?? null,
                yahooLastUpdated: new Date()
              }
            });

            stockPriceUpdates++;

            // Log progress every 10 companies
            if (stockPriceUpdates % 10 === 0) {
              console.log(`[StockPriceCron] ✅ Progress: ${stockPriceUpdates} companies updated`);
            }
          } else {
            skippedCompanies++;
          }

          // Rate limit: delay between requests
          await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));

        } catch (error: any) {
          stockPriceErrors++;

          // Only log non-404 errors (404 means delisted/invalid ticker)
          if (!error.message?.includes('Not Found') && !error.message?.includes('404')) {
            console.error(`[StockPriceCron] ⚠️  Error updating ${company.ticker}: ${error.message}`);
          }

          // Continue with next company even if this one fails
          continue;
        }
      }

      // Delay between batches
      if (i + BATCH_SIZE < activeCompanies.length) {
        console.log(`[StockPriceCron] ⏸️  Batch ${batchNum} complete, pausing ${BATCH_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`[StockPriceCron] ✅ Complete: ${stockPriceUpdates} updated, ${stockPriceErrors} errors, ${skippedCompanies} skipped in ${elapsedSeconds}s`);

    return NextResponse.json({
      success: true,
      message: `Updated ${stockPriceUpdates} stock prices in ${elapsedSeconds}s`,
      results: {
        updated: stockPriceUpdates,
        errors: stockPriceErrors,
        skipped: skippedCompanies,
        totalCompanies: activeCompanies.length,
        elapsedSeconds
      }
    });

  } catch (error: any) {
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.error('[StockPriceCron] ❌ Fatal error:', error.message);
    console.error('[StockPriceCron] Stack trace:', error.stack);

    return NextResponse.json(
      {
        error: error.message,
        partialResults: {
          updated: stockPriceUpdates,
          errors: stockPriceErrors,
          skipped: skippedCompanies,
          elapsedSeconds
        }
      },
      { status: 500 }
    );
  }
}
