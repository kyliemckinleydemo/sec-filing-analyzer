/**
 * @module backfill-company-enrichment
 * @description Backfill script to enrich Company table with financial metrics from Yahoo Finance API and XBRL filing data
 * 
 * PURPOSE:
 * - Populates Company records with market data (dividend yield, beta, volume, analyst ratings) from Yahoo Finance
 * - Extracts latest financial fundamentals (revenue, net income, EPS, margins) from most recent 10-Q/10-K filings
 * - Enables rich natural language queries like "Show companies with dividend yield > 3%" or "Find companies with revenue growth > 20%"
 * - Provides a one-time or periodic enrichment process to sync external market data with internal company records
 * 
 * EXPORTS:
 * - backfillCompanyEnrichment: Async function that processes all companies and updates their enrichment data
 * 
 * CLAUDE NOTES:
 * - Script uses batched filing fetch to optimize database queries (fetches all filings once, creates map by companyId)
 * - Implements 200ms rate limiting between Yahoo Finance API requests to avoid throttling
 * - Dividend yield converted from percentage (0.4%) to decimal (0.004) for storage
 * - Analyst rating calculated as weighted average: Buy=1, Hold=3, Sell=5 on 1-5 scale
 * - XBRL data extracted from analysisData.financialMetrics.structuredData with percentage parsing helper
 * - Quarter label auto-calculated from filing reportDate (e.g., "Q1 2024")
 * - Comprehensive error handling with detailed progress logging and summary statistics
 * - Volume fields stored as BigInt to handle large trading volumes
 * - Gracefully handles missing data (null values) for both Yahoo Finance and XBRL sources
 */

import { prisma } from '../lib/prisma';
import { yahooFinanceClient } from '../lib/yahoo-finance-client';

/**
 * Backfill Company table with enriched data from:
 * 1. Yahoo Finance API (dividend yield, beta, analyst ratings, volume)
 * 2. Latest filing XBRL data (revenue, net income, EPS, margins)
 *
 * This enables rich natural language queries like:
 * - "Show companies with dividend yield > 3%"
 * - "Find companies with revenue growth > 20%"
 * - "List companies with beta < 0.8"
 */

async function backfillCompanyEnrichment() {
  console.log('🚀 Starting Company enrichment backfill...\n');

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      ticker: true,
      name: true,
    },
    orderBy: { ticker: 'asc' }
  });

  console.log(`Found ${companies.length} companies to process\n`);

  // Batch fetch all latest filings for all companies
  const latestFilings = await prisma.filing.findMany({
    where: {
      companyId: { in: companies.map(c => c.id) },
      filingType: { in: ['10-Q', '10-K'] },
      analysisData: { not: null }
    },
    select: {
      companyId: true,
      analysisData: true,
      reportDate: true,
      filingDate: true
    },
    orderBy: { filingDate: 'desc' }
  });

  // Create a map of companyId -> latest filing
  const latestFilingMap = new Map();
  for (const filing of latestFilings) {
    if (!latestFilingMap.has(filing.companyId)) {
      latestFilingMap.set(filing.companyId, filing);
    }
  }

  let processed = 0;
  let yahooSuccess = 0;
  let financialsSuccess = 0;
  let failed = 0;

  for (const company of companies) {
    processed++;
    const progress = `[${processed}/${companies.length}]`;

    try {
      console.log(`${progress} Processing ${company.ticker}...`);

      // 1. Fetch Yahoo Finance data
      const financials = await yahooFinanceClient.getCompanyFinancials(company.ticker);

      // 2. Get most recent 10-Q or 10-K filing with XBRL data from pre-fetched map
      const latestFiling = latestFilingMap.get(company.id);

      // Parse XBRL data from latest filing
      // XBRL data is nested in analysisData.financialMetrics.structuredData
      let xbrlData: any = null;
      if (latestFiling?.analysisData) {
        try {
          const analysisData = JSON.parse(latestFiling.analysisData);
          const rawData = analysisData.financialMetrics?.structuredData;

          if (rawData) {
            // Helper to parse percentage strings like "+0.4%" or "-3.8%" to floats
            const parsePercentage = (value: any): number | undefined => {
              if (typeof value === 'number') return value;
              if (typeof value === 'string') {
                const match = value.match(/([+-]?\d+(?:\.\d+)?)/);
                return match ? parseFloat(match[1]) : undefined;
              }
              return undefined;
            };

            xbrlData = {
              revenue: rawData.revenue,
              revenueYoY: parsePercentage(rawData.revenueYoY),
              netIncome: rawData.netIncome,
              netIncomeYoY: parsePercentage(rawData.netIncomeYoY),
              eps: rawData.eps,
              epsYoY: parsePercentage(rawData.epsYoY),
              grossMargin: rawData.grossMargin,
              operatingMargin: rawData.operatingMargin
            };
          }
        } catch (e) {
          console.log(`   ⚠️  Could not parse analysis data`);
        }
      }

      // Helper function to calculate average analyst rating (1-5 scale)
      const calculateAnalystRating = (buyCount?: number, holdCount?: number, sellCount?: number): number | undefined => {
        if (!buyCount && !holdCount && !sellCount) return undefined;

        const buy = buyCount || 0;
        const hold = holdCount || 0;
        const sell = sellCount || 0;
        const total = buy + hold + sell;

        if (total === 0) return undefined;

        // Weighted average: Buy=1, Hold=3, Sell=5
        return (buy * 1 + hold * 3 + sell * 5) / total;
      };

      // Calculate quarter label
      const quarterLabel = latestFiling?.reportDate
        ? `Q${Math.ceil((new Date(latestFiling.reportDate).getMonth() + 1) / 3)} ${new Date(latestFiling.reportDate).getFullYear()}`
        : null;

      // Update company record with all enriched data
      await prisma.company.update({
        where: { id: company.id },
        data: {
          // Yahoo Finance metrics
          // dividendYield comes as percentage (0.4 = 0.4%), convert to decimal (0.004)
          dividendYield: financials?.dividendYield ? financials.dividendYield / 100 : null,
          beta: financials?.beta,
          volume: financials?.volume ? BigInt(financials.volume) : null,
          averageVolume: financials?.averageVolume ? BigInt(financials.averageVolume) : null,
          analystRating: calculateAnalystRating(
            financials?.analystBuyCount,
            financials?.analystHoldCount,
            financials?.analystSellCount
          ),
          analystRatingCount: financials?.analystRatingCount,

          // Latest financial fundamentals from XBRL
          latestRevenue: xbrlData?.revenue,
          latestRevenueYoY: xbrlData?.revenueYoY,
          latestNetIncome: xbrlData?.netIncome,
          latestNetIncomeYoY: xbrlData?.netIncomeYoY,
          latestEPS: xbrlData?.eps,
          latestEPSYoY: xbrlData?.epsYoY,
          latestGrossMargin: xbrlData?.grossMargin,
          latestOperatingMargin: xbrlData?.operatingMargin,
          latestQuarter: quarterLabel,
        }
      });

      // Log what was added
      const updates: string[] = [];
      // financials.dividendYield is already a percentage (0.4 = 0.4%), no need to multiply
      if (financials?.dividendYield) updates.push(`dividend: ${financials.dividendYield.toFixed(2)}%`);
      if (financials?.beta) updates.push(`beta: ${financials.beta.toFixed(2)}`);
      if (xbrlData?.revenue) {
        const revB = xbrlData.revenue / 1_000_000_000;
        updates.push(`revenue: $${revB.toFixed(1)}B`);
        if (xbrlData.revenueYoY) updates.push(`growth: ${xbrlData.revenueYoY > 0 ? '+' : ''}${xbrlData.revenueYoY.toFixed(1)}%`);
      }

      console.log(`   ✅ ${company.ticker} - ${updates.join(', ')}`);
      if (financials) yahooSuccess++;
      if (xbrlData) financialsSuccess++;

      // Rate limiting: 200ms between requests
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error: any) {
      console.log(`   ❌ ${company.ticker} - Error: ${error.message}`);
      failed++;
    }
  }

  console.log('\n📊 Backfill Summary:');
  console.log(`   Total processed: ${processed}`);
  console.log(`   ✅ Yahoo Finance data: ${yahooSuccess}`);
  console.log(`   ✅ Financial fundamentals: ${financialsSuccess}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`\n✨ Company enrichment complete!`);
}

backfillCompanyEnrichment()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });