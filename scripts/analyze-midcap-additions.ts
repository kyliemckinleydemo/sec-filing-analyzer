/**
 * @module analyze-midcap-additions
 * 
 * @description
 * Incrementally analyzes newly added mid-cap companies that haven't been processed yet.
 * Identifies unanalyzed companies from the selection file, fetches their SEC filings,
 * and performs Claude AI analysis to extract risk scores, sentiment, and summaries.
 * 
 * PURPOSE:
 * - Load companies from selected-companies-with-midcaps.json selection file
 * - Identify companies that lack AI analysis on their latest filings
 * - Batch process SEC filings (10-K, 10-Q, 8-K) for unanalyzed companies
 * - Extract Risk Factors and MD&A sections from filing HTML
 * - Generate AI-powered risk scores and sentiment analysis using Claude
 * - Update database with analysis results (riskScore, sentimentScore, aiSummary)
 * - Provide detailed progress reporting and error handling
 * - Support incremental runs (only analyzes what's missing)
 * 
 * EXPORTS:
 * - None (executable script with main() entry point)
 * 
 * CLAUDE NOTES:
 * - Processes companies in batches of 5 to manage API rate limits
 * - Pre-fetches all filing contents per batch to optimize network requests
 * - Extracts up to 15KB of Risk Factors and MD&A text for analysis
 * - Implements 2-second delay between individual analyses
 * - Implements 10-second delay between batches
 * - Stores full analysis JSON in analysisData field
 * - Defaults to riskScore=5.0 and sentimentScore=0.0 if analysis incomplete
 * - Continues processing on individual failures (non-fatal error handling)
 */

/**
 * Analyze Mid-Cap Additions
 *
 * Only analyzes companies from the new mid-cap selection that haven't been analyzed yet
 */

import { prisma } from '../lib/prisma';
import { claudeClient } from '../lib/claude-client';
import * as fs from 'fs';

async function main() {
  console.log('🚀 Analyzing Mid-Cap Company Additions\n');
  console.log('═'.repeat(80));

  // Load the new selection
  const selectionData = JSON.parse(fs.readFileSync('selected-companies-with-midcaps.json', 'utf-8'));
  const selectedTickers = selectionData.companies.map((c: any) => c.ticker);

  console.log(`\n📋 Loaded ${selectedTickers.length} companies from new selection\n`);

  // Find which ones haven't been analyzed yet
  const companies = await prisma.company.findMany({
    where: {
      ticker: { in: selectedTickers },
    },
    include: {
      filings: {
        where: {
          filingType: { in: ['10-K', '10-Q', '8-K'] },
        },
        orderBy: { filingDate: 'desc' },
        take: 5,
      },
    },
  });

  // Filter to only companies that need analysis
  const needAnalysis: Array<{company: any; filing: any}> = [];

  for (const company of companies) {
    // Find a filing that doesn't have analysis yet
    const unanalyzedFiling = company.filings.find(f => !f.analysisData);

    if (unanalyzedFiling) {
      needAnalysis.push({ company, filing: unanalyzedFiling });
    }
  }

  console.log(`📊 Analysis Status:`);
  console.log(`  Total companies in selection: ${companies.length}`);
  console.log(`  Need analysis: ${needAnalysis.length}`);
  console.log(`  Already analyzed: ${companies.length - needAnalysis.length}\n`);

  if (needAnalysis.length === 0) {
    console.log('✅ All companies already analyzed!\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`🔄 Will analyze ${needAnalysis.length} new companies\n`);
  console.log('═'.repeat(80));

  let analyzed = 0;
  let errors = 0;

  // Process in batches
  const batchSize = 5;
  for (let i = 0; i < needAnalysis.length; i += batchSize) {
    const batch = needAnalysis.slice(i, i + batchSize);

    console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(needAnalysis.length / batchSize)}`);
    console.log('─'.repeat(80));

    // Batch fetch all filing contents for this batch
    const filingUrls = batch.map(item => item.filing.filingUrl);
    const filingContents = await Promise.all(
      filingUrls.map(async (url) => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            return { success: false, error: `Failed to fetch filing: ${response.statusText}` };
          }
          const html = await response.text();
          return { success: true, html };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      })
    );

    for (let j = 0; j < batch.length; j++) {
      const { company, filing } = batch[j];
      const idx = i + j + 1;

      console.log(`\n[${idx}/${needAnalysis.length}] Processing ${company.ticker} (${company.name})...`);
      const marketCapB = company.marketCap ? (company.marketCap / 1_000_000_000).toFixed(0) : 'N/A';
      console.log(`  Market Cap: $${marketCapB}B`);
      console.log(`  📄 Filing: ${filing.filingType} from ${filing.filingDate.toISOString().split('T')[0]}`);
      console.log(`     Accession: ${filing.accessionNumber}`);

      try {
        // Get the pre-fetched filing content
        const filingContent = filingContents[j];
        if (!filingContent.success) {
          throw new Error(filingContent.error);
        }

        console.log(`  🌐 Using pre-fetched filing content from SEC...`);
        const html = filingContent.html;
        const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

        // Extract sections
        const riskMatch = text.match(/RISK FACTORS(.{0,50000})/i);
        const riskText = riskMatch ? riskMatch[1].substring(0, 15000) : text.substring(0, 15000);

        const mdaMatch = text.match(/MANAGEMENT'?S DISCUSSION AND ANALYSIS(.{0,50000})/i);
        const mdaText = mdaMatch ? mdaMatch[1].substring(0, 15000) : text.substring(15000, 30000);

        // Run Claude analysis
        console.log(`  🤖 Running Claude AI analysis...`);
        const analysis = await claudeClient.analyzeFullFiling(riskText, mdaText, undefined, undefined);

        const riskScore = analysis.risks?.riskScore ?? 5.0;
        const sentimentScore = analysis.sentiment?.sentimentScore ?? 0.0;

        // Update filing
        await prisma.filing.update({
          where: { id: filing.id },
          data: {
            analysisData: JSON.stringify(analysis),
            aiSummary: analysis.summary,
            riskScore,
            sentimentScore,
          },
        });

        console.log(`  ✅ Analysis complete!`);
        console.log(`     Risk Score: ${riskScore.toFixed(2)}/10`);
        console.log(`     Sentiment: ${sentimentScore.toFixed(2)} (${analysis.sentiment?.tone || 'N/A'})`);

        analyzed++;

        // Small delay
        if (j < batch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        errors++;
      }
    }

    // Delay between batches
    if (i + batchSize < needAnalysis.length) {
      console.log(`\n⏳ Waiting 10 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('📊 ANALYSIS SUMMARY');
  console.log('═'.repeat(80));
  console.log(`✅ Newly Analyzed:      ${analyzed}`);
  console.log(`❌ Failed:              ${errors}`);
  console.log('');

  // Check total dataset size now
  const totalAnalyzed = await prisma.filing.count({
    where: {
      analysisData: { not: null },
      riskScore: { not: null },
      sentimentScore: { not: null },
    },
  });

  console.log(`📈 Total analyzed filings in database: ${totalAnalyzed}`);
  console.log('');
  console.log('✅ Next step: Run stock price backfill');
  console.log('   npx tsx scripts/backfill-stock-prices.ts');
  console.log('');

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});