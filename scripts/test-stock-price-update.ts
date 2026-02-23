import { prisma } from '@/lib/prisma';
import yahooFinance from '../lib/yahoo-finance-singleton';

/**
 * Test script for daily stock price updates
 * Tests the logic with just a few companies before full deployment
 */

async function testStockPriceUpdate() {
  try {
    console.log('Testing stock price update logic...\n');

    // Get just 3 test companies
    const testCompanies = await prisma.company.findMany({
      where: {
        ticker: {
          in: ['AAPL', 'MSFT', 'GOOGL']
        }
      },
      select: { id: true, ticker: true, currentPrice: true, yahooLastUpdated: true }
    });

    console.log(`Found ${testCompanies.length} test companies\n`);

    let stockPriceUpdates = 0;
    let stockPriceErrors = 0;

    for (const company of testCompanies) {
      console.log(`\nUpdating ${company.ticker}...`);
      console.log(`  Current price: $${company.currentPrice}`);
      console.log(`  Last updated: ${company.yahooLastUpdated}`);

      try {
        // Fetch latest quote data
        const quote = await yahooFinance.quoteSummary(company.ticker, {
          modules: ['price', 'summaryDetail', 'financialData']
        });

        const price = quote.price;
        const summaryDetail = quote.summaryDetail;
        const financialData = quote.financialData;

        console.log(`  New price: $${price?.regularMarketPrice}`);
        console.log(`  Market cap: $${price?.marketCap?.toLocaleString()}`);
        console.log(`  P/E ratio: ${summaryDetail?.trailingPE?.toFixed(2)}`);

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
              averageVolume: price?.averageVolume ? BigInt(price.averageVolume) : null,
              analystTargetPrice: financialData?.targetMeanPrice ?? null,
              yahooLastUpdated: new Date()
            }
          });

          stockPriceUpdates++;
          console.log(`  ✓ Updated successfully`);
        }

        // Rate limit: 100ms delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        console.error(`  ✗ Error: ${error.message}`);
        stockPriceErrors++;
      }
    }

    console.log(`\n\nTest complete: ${stockPriceUpdates} updated, ${stockPriceErrors} errors`);

  } catch (error: any) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testStockPriceUpdate();
