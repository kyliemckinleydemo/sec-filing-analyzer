import { prisma } from '../lib/prisma';
import { claudeClient } from '../lib/claude-client';

/**
 * Backfill concern scores for all historical filings
 *
 * This script:
 * 1. Finds filings that have analysisData but no concernLevel
 * 2. Extracts risk, sentiment, and financial metrics from stored analysis
 * 3. Generates concern assessment for each filing
 * 4. Updates the database with concernLevel and concernAssessment
 *
 * Expected runtime: 8-12 hours for 424 filings (Claude API rate limits)
 */

interface StoredAnalysis {
  risks: {
    overallTrend: string;
    riskScore: number;
    newRisks: Array<{
      title: string;
      severity: number;
      impact: string;
      reasoning: string;
    }>;
    topChanges: string[];
  };
  sentiment: {
    sentimentScore: number;
    confidence: number;
    tone: string;
    keyPhrases: string[];
  };
  financialMetrics?: {
    revenueGrowth?: string;
    marginTrend?: string;
    guidanceDirection?: string;
    surprises?: string[];
    keyMetrics?: string[];
  };
}

async function main() {
  console.log('🔄 Starting Concern Score Backfill\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Find all filings with analysisData
  const filings = await prisma.filing.findMany({
    where: {
      analysisData: { not: null },
      predicted7dReturn: { not: null }, // Only filings in our ML dataset
    },
    include: {
      company: true
    },
    orderBy: {
      filingDate: 'asc'
    }
  });

  console.log(`📊 Found ${filings.length} filings with analysis data\n`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  const startTime = Date.now();

  for (const filing of filings) {
    try {
      // Check if already has concern assessment
      const analysis = JSON.parse(filing.analysisData!) as StoredAnalysis;
      if ((analysis as any).concernAssessment) {
        console.log(`⏭️  ${filing.company?.ticker} ${filing.filingType} (${filing.filingDate.toISOString().split('T')[0]}) - Already has concern score`);
        skipped++;
        continue;
      }

      console.log(`\n🔍 Processing: ${filing.company?.ticker} ${filing.filingType} (${filing.filingDate.toISOString().split('T')[0]})`);

      // Generate concern assessment
      const concernAssessment = await claudeClient.generateConcernAssessment(
        analysis.risks,
        analysis.sentiment,
        analysis.financialMetrics
      );

      console.log(`   Concern Level: ${concernAssessment.concernLevel.toFixed(1)}/10 (${concernAssessment.concernLabel})`);
      console.log(`   Assessment: ${concernAssessment.netAssessment}`);
      console.log(`   Warning Signs: ${concernAssessment.concernFactors.length}`);
      console.log(`   Positive Factors: ${concernAssessment.positiveFactors.length}`);

      // Update the analysisData with concern assessment
      const updatedAnalysis = {
        ...analysis,
        concernAssessment
      };

      // Update filing with new concern data
      await prisma.filing.update({
        where: { id: filing.id },
        data: {
          analysisData: JSON.stringify(updatedAnalysis),
          // Store concernLevel in separate column for easy querying/ML model training
          concernLevel: concernAssessment.concernLevel
        }
      });

      processed++;

      // Progress update every 10 filings
      if (processed % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed / elapsed;
        const remaining = filings.length - processed - skipped;
        const estimatedMinutes = (remaining / rate) / 60;

        console.log(`\n📈 Progress: ${processed}/${filings.length} processed (${skipped} skipped, ${failed} failed)`);
        console.log(`⏱️  Rate: ${rate.toFixed(2)} filings/sec`);
        console.log(`⏳ Estimated time remaining: ${estimatedMinutes.toFixed(0)} minutes\n`);
      }

      // Rate limiting: wait 2 seconds between API calls to avoid hitting Claude limits
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error: any) {
      console.error(`❌ Failed: ${filing.company?.ticker} ${filing.filingType} - ${error.message}`);
      errors.push(`${filing.company?.ticker} ${filing.filingType}: ${error.message}`);
      failed++;

      // If we hit rate limit, wait longer
      if (error.message?.includes('rate') || error.message?.includes('429')) {
        console.log('⏸️  Rate limit detected, waiting 60 seconds...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  }

  const totalTime = (Date.now() - startTime) / 1000 / 60;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Backfill Complete!\n');
  console.log(`📊 Summary:`);
  console.log(`   Total filings: ${filings.length}`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Skipped (already had concern): ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total time: ${totalTime.toFixed(1)} minutes\n`);

  if (errors.length > 0) {
    console.log('❌ Errors:');
    errors.forEach(err => console.log(`   - ${err}`));
    console.log('');
  }

  // Verify the data
  console.log('🔍 Verifying backfilled data...\n');

  const withConcern = await prisma.filing.count({
    where: {
      concernLevel: { not: null }
    }
  });

  console.log(`✅ ${withConcern} filings now have concern scores`);
  console.log(`📈 Ready for ML model training!\n`);

  // Show distribution of concern levels
  const concernDistribution = await prisma.$queryRaw<Array<{ concernBucket: string, count: bigint }>>`
    SELECT
      CASE
        WHEN "concernLevel" <= 2 THEN 'LOW (0-2)'
        WHEN "concernLevel" <= 4 THEN 'MODERATE (3-4)'
        WHEN "concernLevel" <= 6 THEN 'ELEVATED (5-6)'
        WHEN "concernLevel" <= 8 THEN 'HIGH (7-8)'
        ELSE 'CRITICAL (9-10)'
      END as "concernBucket",
      COUNT(*) as count
    FROM "Filing"
    WHERE "concernLevel" IS NOT NULL
    GROUP BY "concernBucket"
    ORDER BY MIN("concernLevel")
  `;

  console.log('📊 Concern Level Distribution:');
  concernDistribution.forEach(row => {
    const count = Number(row.count);
    const pct = (count / withConcern * 100).toFixed(1);
    console.log(`   ${row.concernBucket}: ${count} (${pct}%)`);
  });

  console.log('\n✨ Backfill complete! You can now train the new ML model.\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
