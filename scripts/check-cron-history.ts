import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Cron Job Execution History ===\n');

  // Get latest runs for daily-filings-rss
  const filingRuns = await prisma.cronJobRun.findMany({
    where: {
      jobName: 'daily-filings-rss'
    },
    orderBy: {
      startedAt: 'desc'
    },
    take: 10
  });

  console.log('Latest Daily Filings RSS Cron Runs:');
  console.log('─'.repeat(80));

  if (filingRuns.length === 0) {
    console.log('❌ No cron runs found!\n');
  } else {
    filingRuns.forEach((run, i) => {
      const duration = run.completedAt && run.startedAt
        ? ((run.completedAt.getTime() - run.startedAt.getTime()) / 1000).toFixed(1)
        : 'N/A';

      console.log(`${i + 1}. Run ID: ${run.id}`);
      console.log(`   Status: ${run.status}`);
      console.log(`   Started: ${run.startedAt.toISOString()}`);
      console.log(`   Completed: ${run.completedAt?.toISOString() || 'Not completed'}`);
      console.log(`   Duration: ${duration}s`);
      console.log(`   Fetched: ${run.filingsFetched || 0}, Stored: ${run.filingsStored || 0}`);

      if (run.errorMessage) {
        console.log(`   ❌ Error: ${run.errorMessage}`);
      }
      console.log();
    });
  }

  // Check when last successful run was
  const lastSuccess = await prisma.cronJobRun.findFirst({
    where: {
      jobName: 'daily-filings-rss',
      status: 'success'
    },
    orderBy: {
      completedAt: 'desc'
    }
  });

  if (lastSuccess) {
    const hoursAgo = ((Date.now() - lastSuccess.completedAt!.getTime()) / (1000 * 60 * 60)).toFixed(1);
    console.log(`\n✅ Last successful run: ${lastSuccess.completedAt?.toISOString()}`);
    console.log(`   (${hoursAgo} hours ago)`);
  } else {
    console.log('\n❌ No successful runs found!');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
