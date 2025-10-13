import { prisma } from '../lib/prisma';
import { yahooFinanceClient } from '../lib/yahoo-finance-client';

/**
 * Backfill Yahoo Finance data for all companies with CompanySnapshot support
 * Version 2: Creates historical snapshots for time-series analysis
 */

interface BackfillOptions {
  chunkSize?: number;
  delayBetweenChunks?: number; // seconds
  delayBetweenRequests?: number; // milliseconds
}

async function backfillYahooFinanceData(options: BackfillOptions = {}) {
  const {
    chunkSize = 50,
    delayBetweenChunks = 5,
    delayBetweenRequests = 200
  } = options;

  console.log('Starting Yahoo Finance data backfill with snapshot support');
  console.log(`Chunk size: ${chunkSize} companies`);
  console.log(`Delay between chunks: ${delayBetweenChunks}s`);
  console.log(`Delay between requests: ${delayBetweenRequests}ms`);
  console.log('');

  // Get all companies
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      ticker: true,
      name: true
    },
    orderBy: {
      ticker: 'asc'
    }
  });

  console.log(`Total companies to process: ${companies.length}`);
  console.log('');

  const chunks = [];
  for (let i = 0; i < companies.length; i += chunkSize) {
    chunks.push(companies.slice(i, i + chunkSize));
  }

  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalErrors = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    console.log(`=== Chunk ${i + 1}/${chunks.length} ===`);
    console.log(`Processing companies ${totalProcessed + 1} to ${totalProcessed + chunk.length}`);

    for (const company of chunk) {
      try {
        console.log(`Fetching data for ${company.ticker} (${company.name})...`);

        // Fetch Yahoo Finance data
        const financials = await yahooFinanceClient.getCompanyFinancials(company.ticker);

        if (financials) {
          // Update company with Yahoo Finance data
          await prisma.company.update({
            where: { id: company.id },
            data: {
              marketCap: financials.marketCap,
              peRatio: financials.peRatio,
              forwardPE: financials.forwardPE,
              currentPrice: financials.currentPrice,
              fiftyTwoWeekHigh: financials.fiftyTwoWeekHigh,
              fiftyTwoWeekLow: financials.fiftyTwoWeekLow,
              analystTargetPrice: financials.analystTargetPrice,
              earningsDate: financials.earningsDate,
              yahooFinanceData: JSON.stringify(financials.additionalData),
              yahooLastUpdated: new Date()
            }
          });

          // Create historical snapshot
          await prisma.companySnapshot.create({
            data: {
              companyId: company.id,
              triggerType: 'backfill',
              marketCap: financials.marketCap,
              currentPrice: financials.currentPrice,
              peRatio: financials.peRatio,
              forwardPE: financials.forwardPE,
              fiftyTwoWeekHigh: financials.fiftyTwoWeekHigh,
              fiftyTwoWeekLow: financials.fiftyTwoWeekLow,
              analystTargetPrice: financials.analystTargetPrice,
              analystRatingCount: financials.analystRatingCount,
              epsActual: financials.epsActual,
              epsEstimateCurrentQ: financials.epsEstimateCurrentQ,
              epsEstimateNextQ: financials.epsEstimateNextQ,
              epsEstimateCurrentY: financials.epsEstimateCurrentY,
              epsEstimateNextY: financials.epsEstimateNextY,
              dividendYield: financials.dividendYield,
              beta: financials.beta,
              volume: financials.volume,
              averageVolume: financials.averageVolume,
            }
          });

          console.log(`Success: ${company.ticker}`);
          totalSuccess++;
        } else {
          console.log(`No data found for ${company.ticker}`);
          totalErrors++;
        }

      } catch (error: any) {
        console.error(`Error processing ${company.ticker}:`, error.message);
        totalErrors++;
      }

      totalProcessed++;

      // Rate limiting: wait between requests
      if (totalProcessed < companies.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
      }
    }

    // Wait between chunks
    if (i < chunks.length - 1) {
      console.log(`Waiting ${delayBetweenChunks} seconds before next chunk...`);
      console.log('');
      await new Promise(resolve => setTimeout(resolve, delayBetweenChunks * 1000));
    }
  }

  console.log('');
  console.log('Backfill complete!');
  console.log('');
  console.log('Summary:');
  console.log(`  Companies processed: ${totalProcessed}`);
  console.log(`  Successful: ${totalSuccess}`);
  console.log(`  Errors: ${totalErrors}`);

  await prisma.$disconnect();
}

// Run the backfill
backfillYahooFinanceData({
  chunkSize: 50,
  delayBetweenChunks: 5,
  delayBetweenRequests: 200
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
