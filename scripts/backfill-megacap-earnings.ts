/**
 * @module backfill-megacap-earnings
 * 
 * @description
 * Backfills historical earnings reports (10-K and 10-Q filings) for mega-cap companies
 * (>$500B market cap) from the SEC EDGAR database for the past 2 years. Fetches filings,
 * analyzes them with Claude AI, and stores results in the database.
 * 
 * PURPOSE:
 * - Build a comprehensive dataset of 400-500 high-quality earnings reports from top companies
 * - Analyze historical SEC filings (10-K annual and 10-Q quarterly reports) using Claude AI
 * - Extract risk scores, sentiment analysis, and structured insights from financial documents
 * - Enable retrospective analysis and model training on mega-cap earnings data
 * - Support champion/challenger model comparison with substantial historical data
 * 
 * EXPORTS:
 * - main(): Primary backfill execution function that orchestrates the entire process
 * - fetchFilingsFromSEC(): Retrieves filing metadata from SEC EDGAR API for a given company
 * - fetchFilingContent(): Downloads full HTML content of a specific SEC filing
 * - MEGACAP_TICKERS: Array of 50+ ticker symbols for mega-cap companies across sectors
 * - FilingInfo: Interface defining structure of SEC filing metadata
 * 
 * CLAUDE NOTES:
 * - Uses claudeClient.analyzeFullFiling() to process each earnings report
 * - Extracts and analyzes two key sections: Risk Factors and MD&A (Management Discussion & Analysis)
 * - Implements 2-second rate limiting between API calls to respect usage limits
 * - Gracefully handles analysis failures while preserving filing records
 * - Returns structured analysis including risk scores (0-10), sentiment scores (-1 to 1)
 * - 30-second pause every 10 companies to prevent rate limit issues during bulk processing
 */

/**
 * Backfill Mega-Cap Earnings Reports (2 Years)
 *
 * Strategy:
 * 1. Get top 50 mega-cap companies (>$500B market cap)
 * 2. Fetch all 10-K and 10-Q filings from last 2 years
 * 3. Analyze each filing with Claude
 * 4. Backfill stock prices (7-day returns)
 * 5. Backfill momentum indicators
 *
 * Target: 400-500 high-quality earnings reports
 */

import { prisma } from '../lib/prisma';
import { claudeClient } from '../lib/claude-client';

// Top mega-cap companies (>$500B market cap as of late 2024)
const MEGACAP_TICKERS = [
  // Tech Giants
  'AAPL', 'MSFT', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO',

  // Financial
  'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC',

  // Healthcare
  'LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO',

  // Consumer
  'WMT', 'PG', 'COST', 'HD', 'NKE', 'MCD',

  // Industrial/Energy
  'XOM', 'CVX', 'COP',

  // Telecom/Tech
  'ORCL', 'CRM', 'CSCO', 'NFLX', 'ADBE', 'INTC', 'AMD', 'QCOM',

  // Consumer/Other
  'PEP', 'KO', 'DIS', 'CMCSA', 'VZ', 'PFE', 'ABT', 'TMUS',

  // International
  'TSM', 'ASML', 'SAP', 'NVO',
];

interface FilingInfo {
  ticker: string;
  cik: string;
  filingType: string;
  filingDate: Date;
  accessionNumber: string;
  url: string;
}

async function fetchFilingsFromSEC(
  cik: string,
  ticker: string,
  startDate: Date
): Promise<FilingInfo[]> {
  console.log(`  Fetching filings for ${ticker} (CIK: ${cik})...`);

  const url = `https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SEC Filing Analyzer research@secanalyzer.com',
      },
    });

    if (!response.ok) {
      console.log(`    ❌ Failed to fetch: ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const recentFilings = data.filings?.recent;

    if (!recentFilings) {
      console.log(`    ⚠️  No filings found`);
      return [];
    }

    const filings: FilingInfo[] = [];

    for (let i = 0; i < recentFilings.form.length; i++) {
      const filingType = recentFilings.form[i];
      const filingDate = new Date(recentFilings.filingDate[i]);

      // Only 10-K and 10-Q
      if (!['10-K', '10-Q'].includes(filingType)) continue;

      // Only last 2 years
      if (filingDate < startDate) continue;

      const accessionNumber = recentFilings.accessionNumber[i].replace(/-/g, '');

      filings.push({
        ticker,
        cik,
        filingType,
        filingDate,
        accessionNumber,
        url: `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${cik}&accession_number=${recentFilings.accessionNumber[i]}`,
      });
    }

    console.log(`    ✅ Found ${filings.length} earnings reports`);
    return filings;
  } catch (error) {
    console.log(`    ❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return [];
  }
}

async function fetchFilingContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log('🚀 Backfilling Mega-Cap Earnings Reports\n');
  console.log('═'.repeat(80));
  console.log('');
  console.log(`Target companies: ${MEGACAP_TICKERS.length} mega-caps`);
  console.log(`Timeframe: 2 years (back to ${new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]})`);
  console.log(`Filing types: 10-K, 10-Q only`);
  console.log('');
  console.log('═'.repeat(80));
  console.log('');

  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 2);

  // Step 1: Get all mega-cap companies from database
  const companies = await prisma.company.findMany({
    where: {
      ticker: { in: MEGACAP_TICKERS },
    },
    include: {
      filings: {
        where: {
          filingType: { in: ['10-K', '10-Q'] },
        },
      },
    },
  });

  console.log(`📊 Found ${companies.length}/${MEGACAP_TICKERS.length} companies in database\n`);

  const missingTickers = MEGACAP_TICKERS.filter(
    t => !companies.find(c => c.ticker === t)
  );

  if (missingTickers.length > 0) {
    console.log(`⚠️  Missing companies (need to add): ${missingTickers.join(', ')}\n`);
  }

  // Step 2: For each company, fetch earnings filings from SEC
  let totalFilingsFound = 0;
  let totalFilingsToAnalyze = 0;
  let totalAnalyzed = 0;
  let errors = 0;

  for (const company of companies) {
    console.log(`\n[${companies.indexOf(company) + 1}/${companies.length}] ${company.name} (${company.ticker})`);
    console.log('─'.repeat(80));

    if (!company.cik) {
      console.log('  ⚠️  No CIK, skipping');
      continue;
    }

    // Fetch from SEC
    const secFilings = await fetchFilingsFromSEC(company.cik, company.ticker, startDate);
    totalFilingsFound += secFilings.length;

    // Check which ones we already have
    const existingAccessions = new Set(
      company.filings.map(f => f.accessionNumber)
    );

    const newFilings = secFilings.filter(
      f => !existingAccessions.has(f.accessionNumber)
    );

    if (newFilings.length === 0) {
      console.log('  ✅ All filings already in database');
      continue;
    }

    console.log(`  📋 Need to analyze ${newFilings.length} new filings`);
    totalFilingsToAnalyze += newFilings.length;

    // Batch fetch all filing content first
    console.log(`\n    Fetching ${newFilings.length} filing contents...`);
    const filingContents = await Promise.all(
      newFilings.map(filing => fetchFilingContent(filing.url))
    );

    // Analyze each new filing
    for (let i = 0; i < newFilings.length; i++) {
      const filing = newFilings[i];
      const html = filingContents[i];

      try {
        console.log(`\n    Analyzing ${filing.filingType} from ${filing.filingDate.toISOString().split('T')[0]}...`);

        // Create filing record
        const filingRecord = await prisma.filing.create({
          data: {
            companyId: company.id,
            cik: filing.cik,
            filingType: filing.filingType,
            filingDate: filing.filingDate,
            accessionNumber: filing.accessionNumber,
            filingUrl: filing.url,
          },
        });

        // Analyze with Claude
        console.log('      🤖 Analyzing with Claude AI...');

        try {
          if (!html) {
            throw new Error('Failed to fetch filing content');
          }

          const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

          // Extract sections
          const riskMatch = text.match(/RISK FACTORS(.{0,50000})/i);
          const riskText = riskMatch ? riskMatch[1].substring(0, 15000) : text.substring(0, 15000);

          const mdaMatch = text.match(/MANAGEMENT'?S DISCUSSION AND ANALYSIS(.{0,50000})/i);
          const mdaText = mdaMatch ? mdaMatch[1].substring(0, 15000) : text.substring(15000, 30000);

          // Analyze with Claude
          const analysis = await claudeClient.analyzeFullFiling(
            riskText,
            mdaText,
            undefined,
            undefined
          );

          // Extract scores
          const riskScore = analysis.risks?.riskScore ?? 5.0;
          const sentimentScore = analysis.sentiment?.sentimentScore ?? 0.0;

          // Update filing
          await prisma.filing.update({
            where: { id: filingRecord.id },
            data: {
              analysisData: JSON.stringify(analysis),
              aiSummary: analysis.summary,
              riskScore,
              sentimentScore,
            },
          });

          console.log(`      ✅ Analysis complete (risk: ${riskScore}, sentiment: ${sentimentScore})`);
          totalAnalyzed++;
        } catch (analysisError) {
          console.log(`      ⚠️  Claude analysis failed: ${analysisError instanceof Error ? analysisError.message : 'Unknown'}`);
          // Keep the filing record even if analysis fails
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`    ❌ Error creating filing: ${error instanceof Error ? error.message : 'Unknown'}`);
        errors++;
      }
    }

    // Pause between companies
    if ((companies.indexOf(company) + 1) % 10 === 0) {
      console.log('\n⏳ Pausing 30 seconds between batches...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('📊 BACKFILL SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Companies processed:        ${companies.length}`);
  console.log(`Filings found from SEC:     ${totalFilingsFound}`);
  console.log(`New filings to analyze:     ${totalFilingsToAnalyze}`);
  console.log(`Successfully analyzed:      ${totalAnalyzed}`);
  console.log(`Errors:                     ${errors}`);
  console.log('');

  if (totalAnalyzed > 0) {
    console.log('✅ Next steps:');
    console.log('   1. Backfill 7-day returns: npx tsx scripts/backfill-stock-prices.ts');
    console.log('   2. Backfill momentum: npx tsx scripts/backfill-momentum-indicators.ts');
    console.log('   3. Re-run filtered analysis: npx tsx scripts/filtered-champion-challenger.ts');
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});