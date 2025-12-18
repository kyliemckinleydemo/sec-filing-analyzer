import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface ModelFeatures {
  // Identifiers
  filingId: string;
  ticker: string;
  filingDate: string;

  // Target variable
  actual7dReturn: number;
  actual30dReturn: number | null;

  // Earnings surprise features
  epsSurprise: number | null;
  epsActual: number | null;
  consensusEPS: number | null;
  revenueSurprise: number | null;
  revenueActual: number | null;
  consensusRevenue: number | null;

  // Derived surprise features
  epsBeat: boolean;
  epsMiss: boolean;
  epsInline: boolean;
  largeBeat: boolean; // >10% beat
  largeMiss: boolean; // >10% miss
  surpriseMagnitude: number; // Absolute value

  // AI analysis features
  riskScore: number | null;
  sentimentScore: number | null;
  concernLevel: string | null;

  // XBRL financial features
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  assets: number | null;
  liabilities: number | null;

  // Derived financial features
  profitMargin: number | null;
  debtToAssets: number | null;

  // Guidance features (from AI analysis)
  guidanceDirection: string | null;
  guidanceRaised: boolean;
  guidanceLowered: boolean;

  // Market context (at filing time)
  marketCap: number | null;
}

async function extractFeatures(outputFile: string) {
  console.log('📊 EXTRACTING MODEL FEATURES\n');
  console.log('═'.repeat(80));

  // Get all filings with returns and earnings data
  const filings = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null },
      epsSurprise: { not: null },
    },
    include: {
      company: {
        select: {
          ticker: true,
          marketCap: true,
        }
      }
    },
    orderBy: {
      filingDate: 'asc' // Chronological order for time series
    }
  });

  console.log(`Found ${filings.length} filings with complete data\n`);

  if (filings.length === 0) {
    console.log('❌ No data to extract. Run backfill first.');
    await prisma.$disconnect();
    return;
  }

  // Extract features for each filing
  const features: ModelFeatures[] = [];
  let processed = 0;

  for (const filing of filings) {
    try {
      // Parse analysis data
      let analysisData: any = {};
      let xbrlFinancials: any = {};

      try {
        analysisData = JSON.parse(filing.analysisData || '{}');
        xbrlFinancials = analysisData.xbrlFinancials || {};
      } catch (e) {
        // Skip if can't parse
      }

      // Extract guidance from analysis
      const guidance = analysisData.guidanceDirection || 'not_provided';

      // Calculate derived features
      const epsSurprise = filing.epsSurprise || 0;
      const epsBeat = epsSurprise > 2;
      const epsMiss = epsSurprise < -2;
      const epsInline = !epsBeat && !epsMiss;
      const largeBeat = epsSurprise > 10;
      const largeMiss = epsSurprise < -10;
      const surpriseMagnitude = Math.abs(epsSurprise);

      // Calculate financial ratios
      const revenue = xbrlFinancials.revenue || null;
      const netIncome = xbrlFinancials.netIncome || null;
      const assets = xbrlFinancials.totalAssets || null;
      const liabilities = xbrlFinancials.totalLiabilities || null;

      const profitMargin = revenue && netIncome && revenue !== 0
        ? (netIncome / revenue) * 100
        : null;

      const debtToAssets = assets && liabilities && assets !== 0
        ? (liabilities / assets) * 100
        : null;

      features.push({
        // Identifiers
        filingId: filing.id,
        ticker: filing.company?.ticker || 'UNKNOWN',
        filingDate: filing.filingDate.toISOString().split('T')[0],

        // Target
        actual7dReturn: filing.actual7dReturn!,
        actual30dReturn: filing.actual30dReturn,

        // Earnings surprises
        epsSurprise: filing.epsSurprise,
        epsActual: filing.actualEPS,
        consensusEPS: filing.consensusEPS,
        revenueSurprise: filing.revenueSurprise,
        revenueActual: filing.actualRevenue,
        consensusRevenue: filing.consensusRevenue,

        // Derived surprise features
        epsBeat,
        epsMiss,
        epsInline,
        largeBeat,
        largeMiss,
        surpriseMagnitude,

        // AI features
        riskScore: filing.riskScore,
        sentimentScore: filing.sentimentScore,
        concernLevel: filing.concernLevel,

        // Financial features
        revenue,
        netIncome,
        eps: xbrlFinancials.earningsPerShareDiluted || xbrlFinancials.earningsPerShareBasic || null,
        assets,
        liabilities,

        // Derived financial
        profitMargin,
        debtToAssets,

        // Guidance
        guidanceDirection: guidance,
        guidanceRaised: guidance === 'raised',
        guidanceLowered: guidance === 'lowered',

        // Market context
        marketCap: filing.company?.marketCap || null,
      });

      processed++;

      if (processed % 100 === 0) {
        console.log(`Processed ${processed}/${filings.length} filings...`);
      }

    } catch (error: any) {
      console.error(`Error processing filing ${filing.id}: ${error.message}`);
    }
  }

  // Save to CSV
  const csv = convertToCSV(features);
  fs.writeFileSync(outputFile, csv);

  console.log('\n═'.repeat(80));
  console.log('✅ FEATURE EXTRACTION COMPLETE');
  console.log('═'.repeat(80));
  console.log(`Total samples: ${features.length}`);
  console.log(`Output file: ${outputFile}`);
  console.log(`File size: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);

  // Print feature summary
  console.log('\n📊 Feature Summary:\n');

  const withEPS = features.filter(f => f.epsSurprise !== null).length;
  const withRevenue = features.filter(f => f.revenueSurprise !== null).length;
  const withRisk = features.filter(f => f.riskScore !== null).length;
  const withSentiment = features.filter(f => f.sentimentScore !== null).length;
  const withFinancials = features.filter(f => f.revenue !== null).length;
  const withGuidance = features.filter(f => f.guidanceDirection !== 'not_provided').length;

  console.log(`EPS surprise data:      ${withEPS}/${features.length} (${(withEPS/features.length*100).toFixed(1)}%)`);
  console.log(`Revenue surprise data:  ${withRevenue}/${features.length} (${(withRevenue/features.length*100).toFixed(1)}%)`);
  console.log(`Risk scores:            ${withRisk}/${features.length} (${(withRisk/features.length*100).toFixed(1)}%)`);
  console.log(`Sentiment scores:       ${withSentiment}/${features.length} (${(withSentiment/features.length*100).toFixed(1)}%)`);
  console.log(`Financial metrics:      ${withFinancials}/${features.length} (${(withFinancials/features.length*100).toFixed(1)}%)`);
  console.log(`Guidance provided:      ${withGuidance}/${features.length} (${(withGuidance/features.length*100).toFixed(1)}%)`);

  // Beat/Miss distribution
  const beats = features.filter(f => f.epsBeat).length;
  const misses = features.filter(f => f.epsMiss).length;
  const inline = features.filter(f => f.epsInline).length;

  console.log(`\n📈 Surprise Distribution:\n`);
  console.log(`Beats:   ${beats} (${(beats/features.length*100).toFixed(1)}%)`);
  console.log(`Misses:  ${misses} (${(misses/features.length*100).toFixed(1)}%)`);
  console.log(`Inline:  ${inline} (${(inline/features.length*100).toFixed(1)}%)`);

  // Return distribution
  const avgReturn = features.reduce((sum, f) => sum + f.actual7dReturn, 0) / features.length;
  const positiveReturns = features.filter(f => f.actual7dReturn > 0).length;

  console.log(`\n📊 Return Distribution:\n`);
  console.log(`Average 7d return: ${(avgReturn * 100).toFixed(2)}%`);
  console.log(`Positive returns:  ${positiveReturns}/${features.length} (${(positiveReturns/features.length*100).toFixed(1)}%)`);

  console.log('\n✅ Ready for model training!\n');

  await prisma.$disconnect();
}

function convertToCSV(data: ModelFeatures[]): string {
  if (data.length === 0) return '';

  // Get headers from first object
  const headers = Object.keys(data[0]);

  // Create CSV rows
  const rows = data.map(item => {
    return headers.map(header => {
      const value = item[header as keyof ModelFeatures];

      // Handle null/undefined
      if (value === null || value === undefined) return '';

      // Handle booleans
      if (typeof value === 'boolean') return value ? '1' : '0';

      // Handle strings with commas or quotes
      if (typeof value === 'string') {
        if (value.includes(',') || value.includes('"')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }

      // Numbers
      return value.toString();
    }).join(',');
  });

  // Combine headers and rows
  return [headers.join(','), ...rows].join('\n');
}

// Run extraction
const outputFile = process.argv[2] || 'model-features.csv';
extractFeatures(outputFile).catch(console.error);
