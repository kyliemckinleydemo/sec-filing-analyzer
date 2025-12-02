/**
 * Monitor Mid-Cap Analysis and Auto-Run Full Pipeline
 *
 * Monitors the mid-cap analysis log file for completion,
 * then automatically runs the full model development pipeline
 */

import * as fs from 'fs';
import { execSync } from 'child_process';

const LOG_FILE = 'midcap-analysis.log';
const CHECK_INTERVAL_MS = 30000; // Check every 30 seconds

async function checkAnalysisComplete(): Promise<boolean> {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      console.log(`⏳ Waiting for ${LOG_FILE} to be created...`);
      return false;
    }

    const logContent = fs.readFileSync(LOG_FILE, 'utf-8');

    // Check for completion markers
    const hasAnalysisSummary = logContent.includes('ANALYSIS SUMMARY');
    const hasNewlyAnalyzed = logContent.includes('Newly Analyzed:');
    const hasTotalAnalyzed = logContent.includes('Total analyzed filings');

    return hasAnalysisSummary && (hasNewlyAnalyzed || hasTotalAnalyzed);
  } catch (error) {
    console.error(`Error checking log: ${error}`);
    return false;
  }
}

function getProgress(): string {
  try {
    const logContent = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = logContent.split('\n');

    // Find last batch and company number
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.includes('Processing batch')) {
        return line;
      }
      if (line.match(/^\[\d+\/\d+\]/)) {
        return line.substring(0, 60);
      }
    }

    return 'Progress unknown';
  } catch (error) {
    return 'Cannot read progress';
  }
}

async function runPipeline() {
  console.log('\n' + '═'.repeat(80));
  console.log('🚀 MID-CAP ANALYSIS COMPLETE! Starting Full Pipeline');
  console.log('═'.repeat(80));
  console.log('');

  const steps = [
    {
      name: 'Backfill 90 days historical prices',
      command: 'npx tsx scripts/backfill-historical-prices.ts',
      log: 'historical-prices.log',
    },
    {
      name: 'Calculate momentum indicators',
      command: 'npx tsx scripts/backfill-momentum-indicators.ts',
      log: 'momentum-indicators.log',
    },
    {
      name: 'Backfill 7-day returns for mid-caps',
      command: 'npx tsx scripts/backfill-stock-prices.ts',
      log: 'midcap-returns.log',
    },
    {
      name: 'Run champion-challenger analysis',
      command: 'npx tsx scripts/champion-challenger-analysis.ts',
      log: 'final-model-analysis.log',
    },
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`\n[Step ${i + 1}/${steps.length}] ${step.name}`);
    console.log('─'.repeat(80));

    try {
      execSync(`${step.command} 2>&1 | tee ${step.log}`, {
        stdio: 'inherit',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      });
      console.log(`✅ ${step.name} complete`);
    } catch (error) {
      console.error(`❌ ${step.name} failed:`, error);
      console.log(`\nPipeline stopped at step ${i + 1}. Check ${step.log} for details.`);
      process.exit(1);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('✅ FULL PIPELINE COMPLETE');
  console.log('═'.repeat(80));
  console.log('\nCheck final-model-analysis.log for results and recommendations\n');
}

async function monitor() {
  console.log('🔍 Monitoring Mid-Cap Analysis...\n');
  console.log(`Log file: ${LOG_FILE}`);
  console.log(`Check interval: ${CHECK_INTERVAL_MS / 1000} seconds\n`);
  console.log('═'.repeat(80));

  let checkCount = 0;

  while (true) {
    checkCount++;
    const timestamp = new Date().toLocaleTimeString();

    const isComplete = await checkAnalysisComplete();

    if (isComplete) {
      console.log(`\n✅ [${timestamp}] Mid-cap analysis COMPLETE after ${checkCount} checks!`);
      await runPipeline();
      break;
    }

    const progress = getProgress();
    console.log(`⏳ [${timestamp}] Check #${checkCount} - ${progress}`);

    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
  }
}

monitor().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
