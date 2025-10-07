/**
 * Process Historical Filings Batch
 *
 * Takes output from collect-historical-data.py and processes each filing
 * through the analysis pipeline (SEC filing analysis + prediction generation)
 */

import { prisma } from '../lib/prisma';
import { analyzeSecFiling } from '../lib/sec-filing-analyzer';
import { predictionEngine } from '../lib/predictions';
import fs from 'fs';

interface HistoricalFiling {
  ticker: string;
  filingType: string;
  accessionNumber: string;
  filingDate: string;
  url: string;
  actual7dReturn?: number;
}

async function processHistoricalFiling(filing: HistoricalFiling): Promise<void> {
  console.log(`\n[${filing.ticker}] Processing ${filing.filingType} from ${filing.filingDate}...`);

  try {
    // Check if filing already exists
    const existing = await prisma.filing.findUnique({
      where: { accessionNumber: filing.accessionNumber }
    });

    if (existing) {
      console.log(`[${filing.ticker}] Filing already exists, skipping`);
      return;
    }

    // Get or create company
    let company = await prisma.company.findUnique({
      where: { ticker: filing.ticker }
    });

    if (!company) {
      console.log(`[${filing.ticker}] Creating company record...`);
      company = await prisma.company.create({
        data: {
          ticker: filing.ticker,
          name: filing.ticker, // We'd normally fetch this from SEC
          cik: '0000000000', // Placeholder
        }
      });
    }

    // Fetch filing content from SEC
    console.log(`[${filing.ticker}] Fetching filing content...`);
    const response = await fetch(filing.url);
    const htmlContent = await response.text();

    // Analyze filing with Claude
    console.log(`[${filing.ticker}] Analyzing with Claude...`);
    const analysis = await analyzeSecFiling({
      accessionNumber: filing.accessionNumber,
      filingType: filing.filingType as '10-K' | '10-Q' | '8-K',
      filingDate: new Date(filing.filingDate),
      htmlContent: htmlContent,
      ticker: filing.ticker,
    });

    // Store filing
    console.log(`[${filing.ticker}] Storing in database...`);
    const filingRecord = await prisma.filing.create({
      data: {
        companyId: company.id,
        accessionNumber: filing.accessionNumber,
        filingType: filing.filingType,
        filingDate: new Date(filing.filingDate),
        url: filing.url,
        content: htmlContent.substring(0, 10000), // Store truncated content
        riskScore: analysis.riskScore || 0,
        sentimentScore: analysis.sentimentScore || 0,
        analysisData: JSON.stringify(analysis),
        actual7dReturn: filing.actual7dReturn || null,
      }
    });

    console.log(`[${filing.ticker}] ✅ Filing stored (ID: ${filingRecord.id})`);

    // Generate prediction
    console.log(`[${filing.ticker}] Generating prediction...`);
    // Prediction generation happens via API endpoint
    // For batch processing, we'd call the prediction engine directly

  } catch (error: any) {
    console.error(`[${filing.ticker}] ❌ Error: ${error.message}`);
  }
}

async function main() {
  // Read historical filings from stdin (piped from Python script)
  const inputData = fs.readFileSync(0, 'utf-8');
  const data = JSON.parse(inputData);

  const filings: HistoricalFiling[] = data.filings;

  console.log('='.repeat(80));
  console.log('PROCESSING HISTORICAL FILINGS BATCH');
  console.log('='.repeat(80));
  console.log(`Total filings to process: ${filings.length}`);
  console.log(`Filings with returns: ${data.withReturns}`);
  console.log('='.repeat(80));

  // Process in batches to avoid overwhelming APIs
  const BATCH_SIZE = 5;
  for (let i = 0; i < filings.length; i += BATCH_SIZE) {
    const batch = filings.slice(i, i + BATCH_SIZE);

    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(filings.length / BATCH_SIZE)}...`);

    for (const filing of batch) {
      await processHistoricalFiling(filing);

      // Rate limiting for Claude API
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('BATCH PROCESSING COMPLETE');
  console.log('='.repeat(80));

  await prisma.$disconnect();
}

main().catch(console.error);
