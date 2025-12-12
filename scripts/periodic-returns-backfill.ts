/**
 * Periodic Returns Backfill
 *
 * Runs the returns backfill every 30 minutes to process newly analyzed filings.
 * This ensures we continuously calculate returns as the bulk analysis progresses.
 */

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runReturnsBackfill() {
  console.log(`\n[${new Date().toISOString()}] Starting returns backfill...`);

  try {
    const { stdout, stderr } = await execAsync(
      'cd /Users/johnmckinley/sec-filing-analyzer && npx tsx scripts/backfill-all-returns.ts',
      { timeout: 30 * 60 * 1000 } // 30 minute timeout
    );

    if (stderr) {
      console.error('Stderr:', stderr);
    }

    // Extract summary from output
    const lines = stdout.split('\n');
    const summaryStart = lines.findIndex(line => line.includes('BACKFILL COMPLETE'));
    if (summaryStart !== -1) {
      console.log(lines.slice(summaryStart, summaryStart + 10).join('\n'));
    }

    return true;
  } catch (error) {
    console.error('Error running returns backfill:', error);
    return false;
  }
}

async function checkProgress() {
  const analyzed = await prisma.filing.count({
    where: { riskScore: { not: null } }
  });

  const with7d = await prisma.filing.count({
    where: { actual7dReturn: { not: null } }
  });

  const with30d = await prisma.filing.count({
    where: { actual30dReturn: { not: null } }
  });

  console.log(`\nProgress Report:`);
  console.log(`  Analyzed filings: ${analyzed}/14460`);
  console.log(`  With 7d returns: ${with7d}`);
  console.log(`  With 30d returns: ${with30d}`);

  return { analyzed, with7d, with30d };
}

async function main() {
  console.log('🔄 PERIODIC RETURNS BACKFILL');
  console.log('═'.repeat(80));
  console.log('Running returns backfill every 30 minutes...\n');

  let iteration = 0;

  while (true) {
    iteration++;
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`Iteration ${iteration} - ${new Date().toISOString()}`);
    console.log('═'.repeat(80));

    // Check current progress
    const progress = await checkProgress();

    // If we've reached the target, we can slow down or stop
    if (progress.with7d >= 500) {
      console.log('\n✅ Target of 500 filings with returns reached!');
      console.log('Slowing down to hourly checks...\n');
      await sleep(60 * 60 * 1000); // Check every hour
    }

    // Run the backfill
    await runReturnsBackfill();

    // Wait 30 minutes before next run
    console.log(`\n⏳ Waiting 30 minutes before next run...`);
    await sleep(30 * 60 * 1000);
  }
}

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
