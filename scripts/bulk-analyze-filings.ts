#!/usr/bin/env npx tsx
/**
 * Bulk Filing Analysis Script
 *
 * Analyzes all filings that don't have Claude analysis yet.
 * Extracts:
 * - Financial metrics (revenue, margins, EPS, guidance)
 * - Earnings surprises (beats/misses)
 * - Risk assessment
 * - Sentiment analysis
 * - Concern scores
 *
 * This is CRITICAL for the prediction model to have access to structured data.
 */

import { PrismaClient } from '@prisma/client';
import { claudeClient } from '../lib/claude-client';

const prisma = new PrismaClient();

async function fetchFilingContent(filingUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(filingUrl, {
      headers: {
        'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`  Failed to fetch (${response.status})`);
      return null;
    }

    return await response.text();
  } catch (error: any) {
    console.log(`  Error fetching: ${error.message}`);
    return null;
  }
}

async function bulkAnalyzeFilings() {
  console.log('\n' + '='.repeat(80));
  console.log('BULK FILING ANALYSIS - Extracting Financial Metrics & Guidance');
  console.log('='.repeat(80) + '\n');

  // Find all filings without analysis
  const filings = await prisma.filing.findMany({
    where: {
      analysisData: null,
    },
    include: {
      company: true,
    },
    orderBy: {
      filingDate: 'desc',
    },
  });

  console.log(`Found ${filings.length} filings needing analysis\n`);

  if (filings.length === 0) {
    console.log('All filings are already analyzed!\n');
    await prisma.$disconnect();
    return;
  }

  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  for (let i = 0; i < filings.length; i++) {
    const filing = filings[i];
    const progress = `[${i + 1}/${filings.length}]`;

    console.log(`${progress} ${filing.company.ticker} ${filing.filingType} (${filing.filingDate.toISOString().split('T')[0]})`);

    try {
      if (!filing.filingUrl) {
        console.log(`  No URL - skipping`);
        skipCount++;
        continue;
      }

      // Fetch filing content
      const filingText = await fetchFilingContent(filing.filingUrl);
      if (!filingText) {
        errorCount++;
        continue;
      }

      // Extract first 50KB (Claude limit)
      const textSample = filingText.slice(0, 50000);

      // Run full Claude analysis (using Haiku for cost efficiency)
      console.log(`  Analyzing with Haiku...`);
      const analysis = await claudeClient.analyzeFullFiling(
        textSample,           // currentRisks
        textSample,           // mdaText
        undefined,            // priorRisks
        filing.filingType,    // filingType
        filing.company.name,  // companyName
        undefined,            // priorMDA
        'bulk'                // useCase - Use Haiku (12x cheaper, 2x faster)
      );

      // Store analysis
      await prisma.filing.update({
        where: { id: filing.id },
        data: {
          analysisData: JSON.stringify(analysis),
          riskScore: analysis.risks.riskScore,
          sentimentScore: analysis.sentiment.sentimentScore,
          concernLevel: analysis.concernAssessment.concernLevel,
          aiSummary: analysis.summary,
        },
      });

      // Log key findings
      const metrics = analysis.financialMetrics;
      console.log(`  Risk: ${analysis.risks.riskScore.toFixed(1)}/10`);
      console.log(`  Concern: ${analysis.concernAssessment.concernLevel.toFixed(1)}/10 (${analysis.concernAssessment.concernLabel})`);
      if (metrics?.guidanceDirection) {
        console.log(`  Guidance: ${metrics.guidanceDirection}`);
      }
      if (metrics?.surprises && metrics.surprises.length > 0) {
        console.log(`  Surprises: ${metrics.surprises.join(', ')}`);
      }

      successCount++;

      // Rate limiting: 2 seconds between API calls
      if (i < filings.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Progress checkpoint every 50 filings
      if ((i + 1) % 50 === 0) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Progress: ${successCount} analyzed, ${errorCount} errors, ${skipCount} skipped`);
        console.log(`${'='.repeat(80)}\n`);
      }

    } catch (error: any) {
      console.log(`  Error: ${error.message}`);
      errorCount++;
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('BULK ANALYSIS COMPLETE');
  console.log('='.repeat(80));
  console.log(`Total filings: ${filings.length}`);
  console.log(`Successfully analyzed: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Skipped: ${skipCount}`);
  console.log(`Success rate: ${((successCount / filings.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(80) + '\n');

  await prisma.$disconnect();
}

bulkAnalyzeFilings().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
