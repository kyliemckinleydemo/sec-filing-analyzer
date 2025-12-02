/**
 * Analyze Recent Filings for Selected 164 Companies
 *
 * This script:
 * 1. Reads the selected company list
 * 2. For each company, finds their most recent 10-K, 10-Q, or 8-K filing
 * 3. Runs AI analysis on the filing (risk score + sentiment)
 * 4. Stores results in database
 * 5. Fetches Yahoo Finance data for the company
 *
 * Target: 164 companies across market cap spectrum
 */

import { prisma } from '../lib/prisma';
import { claudeClient } from '../lib/claude-client';
import { yahooFinancePythonClient } from '../lib/yahoo-finance-python';
import * as fs from 'fs';

interface SelectedCompany {
  ticker: string;
  name: string;
  marketCapB: string;
  category: string;
  rank: number;
}

async function loadSelectedCompanies(): Promise<SelectedCompany[]> {
  const data = JSON.parse(fs.readFileSync('selected-companies-200.json', 'utf-8'));
  return data.companies;
}

async function analyzeCompanyFiling(company: SelectedCompany, filingIndex: number, totalFilings: number) {
  const { ticker } = company;

  console.log(`\n[${ filingIndex}/${totalFilings}] Processing ${ticker} (${company.name})...`);
  console.log(`  Market Cap: $${company.marketCapB}B | Category: ${company.category}`);

  try {
    // Find company in database
    const dbCompany = await prisma.company.findUnique({
      where: { ticker },
      include: {
        filings: {
          where: {
            filingType: { in: ['10-K', '10-Q', '8-K'] },
          },
          orderBy: { filingDate: 'desc' },
          take: 5, // Get 5 most recent filings
        },
      },
    });

    if (!dbCompany) {
      console.log(`  ❌ Company ${ticker} not found in database`);
      return { success: false, ticker, reason: 'not_in_db' };
    }

    if (dbCompany.filings.length === 0) {
      console.log(`  ❌ No filings found for ${ticker}`);
      return { success: false, ticker, reason: 'no_filings' };
    }

    // Find a filing that doesn't already have analysis
    let filingToAnalyze = dbCompany.filings.find(f => !f.analysisData);

    // If all filings have analysis, use the most recent one
    if (!filingToAnalyze) {
      filingToAnalyze = dbCompany.filings[0];
      console.log(`  ℹ️  All filings already analyzed. Re-analyzing most recent filing.`);
    }

    const filing = filingToAnalyze;
    console.log(`  📄 Filing: ${filing.filingType} from ${filing.filingDate.toISOString().split('T')[0]}`);
    console.log(`     Accession: ${filing.accessionNumber}`);

    // Check if already analyzed
    if (filing.analysisData && filing.riskScore !== null && filing.sentimentScore !== null) {
      console.log(`  ✅ Already analyzed (Risk: ${filing.riskScore.toFixed(2)}, Sentiment: ${filing.sentimentScore.toFixed(2)})`);
      return { success: true, ticker, status: 'already_analyzed' };
    }

    // Fetch filing content from SEC
    console.log(`  🌐 Fetching filing content from SEC...`);
    const response = await fetch(filing.filingUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch filing: ${response.statusText}`);
    }

    const html = await response.text();

    // Extract key sections using simple text parsing
    // In production, you'd use a proper HTML parser
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

    // Find Risk Factors section
    const riskMatch = text.match(/RISK FACTORS(.{0,50000})/i);
    const riskText = riskMatch ? riskMatch[1].substring(0, 15000) : text.substring(0, 15000);

    // Find MD&A section
    const mdaMatch = text.match(/MANAGEMENT'?S DISCUSSION AND ANALYSIS(.{0,50000})/i);
    const mdaText = mdaMatch ? mdaMatch[1].substring(0, 15000) : text.substring(15000, 30000);

    console.log(`  🤖 Running Claude AI analysis...`);

    // Run Claude analysis (using same method as the API route)
    const analysis = await claudeClient.analyzeFullFiling(
      riskText,
      mdaText,
      undefined, // No prior risks (for speed)
      undefined  // No prior MD&A (for speed)
    );

    // Extract key metrics from analysis
    const riskScore = analysis.risks?.riskScore ?? 5.0;
    const sentimentScore = analysis.sentiment?.sentimentScore ?? 0.0;

    // Update filing with analysis results
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

    // Fetch Yahoo Finance data for the company
    console.log(`  📊 Fetching Yahoo Finance data...`);
    try {
      const yahooData = await yahooFinancePythonClient.getCompanyData(ticker);

      // Update company with Yahoo Finance data
      await prisma.company.update({
        where: { id: dbCompany.id },
        data: {
          marketCap: yahooData.market_cap || null,
          currentPrice: yahooData.current_price || null,
          peRatio: yahooData.pe_ratio || null,
          forwardPE: yahooData.forward_pe || null,
          fiftyTwoWeekHigh: yahooData.fifty_two_week_high || null,
          fiftyTwoWeekLow: yahooData.fifty_two_week_low || null,
          analystTargetPrice: yahooData.analyst_target_price || null,
          yahooFinanceData: JSON.stringify(yahooData),
          yahooLastUpdated: new Date(),
        },
      });

      // Create a snapshot for this filing
      await prisma.companySnapshot.create({
        data: {
          companyId: dbCompany.id,
          filingId: filing.id,
          snapshotDate: new Date(),
          triggerType: 'backfill',

          marketCap: yahooData.market_cap || null,
          currentPrice: yahooData.current_price || null,
          peRatio: yahooData.pe_ratio || null,
          forwardPE: yahooData.forward_pe || null,
          fiftyTwoWeekHigh: yahooData.fifty_two_week_high || null,
          fiftyTwoWeekLow: yahooData.fifty_two_week_low || null,

          analystTargetPrice: yahooData.analyst_target_price || null,
          epsActual: yahooData.eps_actual || null,
          epsEstimateCurrentQ: yahooData.eps_estimate_current_quarter || null,
          epsEstimateNextQ: yahooData.eps_estimate_next_quarter || null,
          epsEstimateCurrentY: yahooData.eps_estimate_current_year || null,
          epsEstimateNextY: yahooData.eps_estimate_next_year || null,

          dividendYield: yahooData.dividend_yield || null,
          beta: yahooData.beta || null,
          volume: yahooData.volume || null,
          averageVolume: yahooData.average_volume || null,
        },
      });

      console.log(`  ✅ Yahoo Finance data saved`);

    } catch (yahooError) {
      console.log(`  ⚠️  Yahoo Finance data unavailable: ${yahooError instanceof Error ? yahooError.message : 'Unknown error'}`);
    }

    return { success: true, ticker, status: 'analyzed' };

  } catch (error) {
    console.log(`  ❌ Error analyzing ${ticker}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { success: false, ticker, reason: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function main() {
  console.log('🚀 Starting Analysis of 164 Selected Companies\n');
  console.log('═'.repeat(80));

  const companies = await loadSelectedCompanies();
  console.log(`\n📋 Loaded ${companies.length} companies from selection\n`);

  const results = {
    total: companies.length,
    analyzed: 0,
    alreadyAnalyzed: 0,
    failed: 0,
    errors: [] as any[],
  };

  // Process companies in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < companies.length; i += batchSize) {
    const batch = companies.slice(i, i + batchSize);

    console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(companies.length / batchSize)}`);
    console.log('─'.repeat(80));

    for (let j = 0; j < batch.length; j++) {
      const result = await analyzeCompanyFiling(batch[j], i + j + 1, companies.length);

      if (result.success) {
        if (result.status === 'analyzed') {
          results.analyzed++;
        } else if (result.status === 'already_analyzed') {
          results.alreadyAnalyzed++;
        }
      } else {
        results.failed++;
        results.errors.push(result);
      }

      // Small delay between requests to avoid rate limiting
      if (j < batch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      }
    }

    // Longer delay between batches
    if (i + batchSize < companies.length) {
      console.log(`\n⏳ Waiting 10 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  // Print summary
  console.log('\n' + '═'.repeat(80));
  console.log('📊 ANALYSIS SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Total Companies:        ${results.total}`);
  console.log(`✅ Newly Analyzed:      ${results.analyzed}`);
  console.log(`✓  Already Analyzed:    ${results.alreadyAnalyzed}`);
  console.log(`❌ Failed:              ${results.failed}`);
  console.log('');

  if (results.errors.length > 0) {
    console.log('❌ Failed Companies:');
    results.errors.forEach(err => {
      console.log(`   ${err.ticker}: ${err.reason} ${err.error ? `(${err.error})` : ''}`);
    });
    console.log('');
  }

  // Check total analyzed filings in database
  const totalAnalyzed = await prisma.filing.count({
    where: {
      analysisData: { not: null },
      actual7dReturn: null, // Don't have stock prices yet
    },
  });

  console.log(`📈 Total analyzed filings ready for stock price backfill: ${totalAnalyzed}`);
  console.log('');
  console.log('✅ Next step: Run stock price backfill script');
  console.log('   npx tsx scripts/backfill-stock-prices.ts');
  console.log('');

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
