/**
 * @module check-cron-status
 * @description Standalone diagnostic script that queries and displays the last 5 cron job execution records with their processing statistics and database totals
 *
 * PURPOSE:
 * - Fetch the 5 most recent cronJobRun records ordered by startedAt descending
 * - Display each job's name, status, timestamps, processing counts (companies/filings), and error messages if any
 * - Query and output total filing and company counts from the database for health monitoring
 *
 * DEPENDENCIES:
 * - @prisma/client - Provides PrismaClient for querying cronJobRun, filing, and company tables
 *
 * PATTERNS:
 * - Run directly via node or ts-node: 'ts-node check-cron-status.ts'
 * - Use for debugging scheduled jobs - check if daily/hourly crons are executing and how many records they process
 * - Prisma connection auto-disconnects in finally block after queries complete
 *
 * CLAUDE NOTES:
 * - Script is self-executing with checkCronStatus() called at module bottom - not importable as library
 * - Displays comprehensive per-run metrics: companiesProcessed, filingsFetched, filingsStored to track job efficiency
 * - Gracefully handles empty database state by checking runs.length before iteration
 * - No command-line arguments or configuration - hardcoded to show last 5 runs and current totals
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCronStatus() {
  try {
    // Get last 5 cron job runs
    const runs = await prisma.cronJobRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 5,
    });

    console.log('\n=== Recent Cron Job Runs ===\n');

    if (runs.length === 0) {
      console.log('No cron job runs found in database.');
      return;
    }

    for (const run of runs) {
      console.log(`Job: ${run.jobName}`);
      console.log(`Status: ${run.status}`);
      console.log(`Started: ${run.startedAt}`);
      console.log(`Completed: ${run.completedAt || 'N/A'}`);
      console.log(`Companies Processed: ${run.companiesProcessed || 0}`);
      console.log(`Filings Fetched: ${run.filingsFetched || 0}`);
      console.log(`Filings Stored: ${run.filingsStored || 0}`);
      if (run.errorMessage) {
        console.log(`Error: ${run.errorMessage}`);
      }
      console.log('---\n');
    }

    // Get total filings count
    const totalFilings = await prisma.filing.count();
    console.log(`Total filings in database: ${totalFilings}`);

    // Get total companies count
    const totalCompanies = await prisma.company.count();
    console.log(`Total companies in database: ${totalCompanies}`);

  } catch (error) {
    console.error('Error checking cron status:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCronStatus();
