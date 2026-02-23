/**
 * @module app/api/cron/update-stock-prices/route
 * @description Scheduled API route that updates current stock prices and market metrics for companies with SEC filings in the past 30 days via Yahoo Finance API
 *
 * PURPOSE:
 * - Fetch current stock prices, market cap, P/E ratios, 52-week ranges, and analyst targets from Yahoo Finance API
 * - Update database records for companies that filed SEC documents within 30 days to prioritize active tickers
 * - Process updates in batches of 50 with minimal delays (Yahoo Finance has no strict rate limit)
 * - Authenticate requests via Vercel cron headers or CRON_SECRET bearer token to prevent unauthorized execution
 *
 * DEPENDENCIES:
 * - next/server - Provides NextResponse for JSON responses and status codes
 * - @/lib/prisma - Database client for querying companies and updating stock price fields
 * - @/lib/yahoo-finance-singleton - Yahoo Finance API client for quote and quoteSummary calls
 *
 * EXPORTS:
 * - dynamic (const) - Force-dynamic rendering mode to prevent route caching
 * - maxDuration (const) - 300 second (5 minute) maximum execution time for Vercel serverless function
 * - GET (function) - Async handler that authenticates request, fetches active companies, updates stock data in batches, and returns success/error summary with counts
 *
 * PATTERNS:
 * - Deploy as Vercel cron job with schedule like '0 0 * * *' for daily midnight execution
 * - Set CRON_SECRET environment variable and pass as 'Authorization: Bearer {secret}' header for manual testing
 * - Route returns partial completion JSON when approaching 270-second timeout (leaves 30s buffer)
 * - Skips companies with 404/Not Found errors (delisted tickers) without logging to reduce noise
 *
 * CLAUDE NOTES:
 * - Uses 30-day filing window to prioritize recently active companies, avoiding stale ticker updates
 * - Implements timeout protection by checking elapsed time every company and returning partial results at 4.5 minutes
 * - Stores volume fields as BigInt in Prisma since daily volume can exceed JavaScript's safe integer limit (2^53-1)
 * - Yahoo Finance quote() provides most fields directly; quoteSummary(financialData) used for analystTargetPrice
 * - dividendYield from Yahoo Finance is already a ratio (e.g. 0.005 = 0.5%), stored directly
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from '@/lib/yahoo-finance-singleton';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily Cron Job: Update stock prices for active companies
 *
 * Updates current price, market cap, P/E, and other key metrics
 * for companies that have filed in the past 30 days.
 *
 * Uses Yahoo Finance API (quote + quoteSummary) for market data.
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
    console.error('[StockPriceCron] Unauthorized request', {
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
    console.log('[StockPriceCron] Starting stock price update job...');

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

    console.log(`[StockPriceCron] Found ${activeCompanies.length} companies with filings in past 30 days`);

    // Process in batches for progress logging
    const BATCH_SIZE = 50;
    const POLITE_DELAY_MS = 50;

    const totalBatches = Math.ceil(activeCompanies.length / BATCH_SIZE);

    for (let i = 0; i < activeCompanies.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batch = activeCompanies.slice(i, i + BATCH_SIZE);

      console.log(`[StockPriceCron] Processing batch ${batchNum}/${totalBatches} (${batch.length} companies)`);

      for (const company of batch) {
        try {
          // Check if we're approaching timeout (leave 30s buffer)
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          if (elapsedSeconds > 270) { // 4.5 minutes
            console.log(`[StockPriceCron] Approaching timeout at ${elapsedSeconds}s, stopping early`);
            console.log(`[StockPriceCron] Partial completion: ${stockPriceUpdates} updated, ${stockPriceErrors} errors, ${skippedCompanies} skipped`);
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

          // Fetch quote data from Yahoo Finance
          const quote = await yahooFinance.quote(company.ticker);

          if (quote && quote.regularMarketPrice != null) {
            // Fetch enriched metrics from quoteSummary (separate call)
            let enrichedData: Record<string, any> = {
              analystTargetPrice: null,
              revenueGrowth: null,
              earningsGrowth: null,
              grossMargins: null,
              operatingMargins: null,
              profitMargins: null,
              freeCashflow: null,
              pegRatio: null,
              shortRatio: null,
              shortPercentOfFloat: null,
              enterpriseToRevenue: null,
              enterpriseToEbitda: null,
            };
            try {
              const summary = await yahooFinance.quoteSummary(company.ticker, {
                modules: ['financialData', 'defaultKeyStatistics'],
              });
              enrichedData = {
                analystTargetPrice: summary.financialData?.targetMeanPrice ?? null,
                revenueGrowth: summary.financialData?.revenueGrowth ?? null,
                earningsGrowth: summary.financialData?.earningsGrowth ?? null,
                grossMargins: summary.financialData?.grossMargins ?? null,
                operatingMargins: summary.financialData?.operatingMargins ?? null,
                profitMargins: summary.financialData?.profitMargins ?? null,
                freeCashflow: summary.financialData?.freeCashflow ?? null,
                pegRatio: summary.defaultKeyStatistics?.pegRatio ?? null,
                shortRatio: summary.defaultKeyStatistics?.shortRatio ?? null,
                shortPercentOfFloat: summary.defaultKeyStatistics?.shortPercentOfFloat ?? null,
                enterpriseToRevenue: summary.defaultKeyStatistics?.enterpriseToRevenue ?? null,
                enterpriseToEbitda: summary.defaultKeyStatistics?.enterpriseToEbitda ?? null,
              };
            } catch {
              // Skip if quoteSummary fails - enriched fields will remain null
            }

            await prisma.company.update({
              where: { id: company.id },
              data: {
                currentPrice: quote.regularMarketPrice ?? null,
                marketCap: quote.marketCap ?? null,
                peRatio: quote.trailingPE ?? null,
                beta: (quote as any).beta ?? null,
                dividendYield: ('dividendYield' in quote && (quote as any).dividendYield != null)
                  ? (quote as any).dividendYield / 100
                  : null,
                fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
                fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
                fiftyDayAverage: (quote as any).fiftyDayAverage ?? null,
                twoHundredDayAverage: (quote as any).twoHundredDayAverage ?? null,
                volume: quote.regularMarketVolume ? BigInt(quote.regularMarketVolume) : null,
                averageVolume: quote.averageDailyVolume10Day ? BigInt(quote.averageDailyVolume10Day) : null,
                ...enrichedData,
                yahooLastUpdated: new Date()
              }
            });

            stockPriceUpdates++;

            // Log progress every 10 companies
            if (stockPriceUpdates % 10 === 0) {
              console.log(`[StockPriceCron] Progress: ${stockPriceUpdates} companies updated`);
            }
          } else {
            skippedCompanies++;
          }

          // Small polite delay between requests
          await new Promise(resolve => setTimeout(resolve, POLITE_DELAY_MS));

        } catch (error: any) {
          stockPriceErrors++;

          // Only log non-404 errors (404 means delisted/invalid ticker)
          if (!error.message?.includes('Not Found') && !error.message?.includes('404')) {
            console.error(`[StockPriceCron] Error updating ${company.ticker}: ${error.message}`);
          }

          // Continue with next company even if this one fails
          continue;
        }
      }

      // Log batch completion
      if (i + BATCH_SIZE < activeCompanies.length) {
        console.log(`[StockPriceCron] Batch ${batchNum} complete`);
      }
    }

    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`[StockPriceCron] Complete: ${stockPriceUpdates} updated, ${stockPriceErrors} errors, ${skippedCompanies} skipped in ${elapsedSeconds}s`);

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
    console.error('[StockPriceCron] Fatal error:', error.message);
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
