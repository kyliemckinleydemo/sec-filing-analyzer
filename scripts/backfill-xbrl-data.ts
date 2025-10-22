import { prisma } from '../lib/prisma';
import { secDataAPI } from '../lib/sec-data-api';

/**
 * Backfill XBRL structured financial data for filings from the last year
 *
 * This adds missing financialMetrics.structuredData with:
 * - Revenue, net income, EPS
 * - YoY growth rates
 * - Margins
 */

async function backfillXBRLData() {
  console.log('🔄 Starting XBRL data backfill for last year...\n');

  // Get filings from last year that have analysisData
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const filings = await prisma.filing.findMany({
    where: {
      filingDate: { gte: oneYearAgo },
      analysisData: { not: null }
    },
    include: { company: true },
    orderBy: { filingDate: 'desc' }
  });

  console.log(`Found ${filings.length} filings from last year with analysisData\n`);

  let processed = 0;
  let enriched = 0;
  let  alreadyComplete = 0;
  let failed = 0;

  for (const filing of filings) {
    processed++;
    const progress = `[${processed}/${filings.length}]`;

    try {
      // Parse existing analysisData
      let analysisData;
      try {
        analysisData = JSON.parse(filing.analysisData!);
      } catch {
        console.log(`${progress} ❌ ${filing.company.ticker} - Failed to parse analysisData`);
        failed++;
        continue;
      }

      // Check if already has complete structuredData with YoY
      const hasStructuredData = analysisData?.financialMetrics?.structuredData;
      const hasYoYData = hasStructuredData?.revenueYoY || hasStructuredData?.epsYoY;

      if (hasStructuredData && hasYoYData) {
        console.log(`${progress} ✅ ${filing.company.ticker} (${filing.filingType}) - Already complete`);
        alreadyComplete++;
        continue;
      }

      // Fetch XBRL data from SEC Data API
      console.log(`${progress} 🔍 ${filing.company.ticker} (${filing.filingType}) - Fetching XBRL...`);

      const structuredFinancials = await secDataAPI.getFinancialSummary(
        filing.company.cik,
        filing.accessionNumber.replace(/-/g, '')
      );

      if (!structuredFinancials) {
        console.log(`${progress} ⚠️  ${filing.company.ticker} - No XBRL data available`);
        failed++;
        continue;
      }

      // Initialize or update structuredData
      if (!analysisData.financialMetrics) {
        analysisData.financialMetrics = {};
      }

      // Merge with existing data (preserve any existing values)
      analysisData.financialMetrics.structuredData = {
        ...analysisData.financialMetrics.structuredData,
        revenue: structuredFinancials.revenue ?? analysisData.financialMetrics.structuredData?.revenue,
        revenueYoY: structuredFinancials.revenueYoY ?? analysisData.financialMetrics.structuredData?.revenueYoY,
        netIncome: structuredFinancials.netIncome ?? analysisData.financialMetrics.structuredData?.netIncome,
        netIncomeYoY: structuredFinancials.netIncomeYoY ?? analysisData.financialMetrics.structuredData?.netIncomeYoY,
        eps: structuredFinancials.eps ?? analysisData.financialMetrics.structuredData?.eps,
        epsYoY: structuredFinancials.epsYoY ?? analysisData.financialMetrics.structuredData?.epsYoY,
        grossMargin: structuredFinancials.grossMargin ?? analysisData.financialMetrics.structuredData?.grossMargin,
        operatingMargin: structuredFinancials.operatingMargin ?? analysisData.financialMetrics.structuredData?.operatingMargin,
      };

      // Update filing in database
      await prisma.filing.update({
        where: { id: filing.id },
        data: {
          analysisData: JSON.stringify(analysisData)
        }
      });

      console.log(`${progress} ✅ ${filing.company.ticker} - Enriched with XBRL data`);
      console.log(`   Revenue: ${structuredFinancials.revenue ? `$${(structuredFinancials.revenue / 1e9).toFixed(2)}B` : 'N/A'} (${structuredFinancials.revenueYoY || 'N/A'})`);
      console.log(`   EPS: ${structuredFinancials.eps || 'N/A'} (${structuredFinancials.epsYoY || 'N/A'})`);
      enriched++;

      // Rate limiting: pause between requests
      await new Promise(resolve => setTimeout(resolve, 150));

    } catch (error: any) {
      console.log(`${progress} ❌ ${filing.company.ticker} - Error: ${error.message}`);
      failed++;
    }
  }

  console.log('\n📊 Backfill Summary:');
  console.log(`   Total processed: ${processed}`);
  console.log(`   ✅ Enriched: ${enriched}`);
  console.log(`   ✅ Already complete: ${alreadyComplete}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`\n✨ Backfill complete!`);
}

backfillXBRLData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
