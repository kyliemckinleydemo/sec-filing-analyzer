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
