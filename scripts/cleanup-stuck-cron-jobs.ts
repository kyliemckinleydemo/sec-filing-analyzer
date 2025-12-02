import { prisma } from '../lib/prisma';

async function cleanupStuckJobs() {
  console.log('Cleaning up stuck cron jobs...');

  // Find all stuck jobs (status: running, but started more than 1 hour ago)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const stuckJobs = await prisma.cronJobRun.findMany({
    where: {
      status: 'running',
      startedAt: {
        lt: oneHourAgo
      }
    }
  });

  console.log(`Found ${stuckJobs.length} stuck jobs`);

  if (stuckJobs.length > 0) {
    // Update them to failed
    const result = await prisma.cronJobRun.updateMany({
      where: {
        status: 'running',
        startedAt: {
          lt: oneHourAgo
        }
      },
      data: {
        status: 'failed',
        errorMessage: 'Job timed out - marked as failed by cleanup script',
        completedAt: new Date()
      }
    });

    console.log(`Marked ${result.count} stuck jobs as failed`);
  }

  // Show summary of jobs in last 24 hours
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentJobs = await prisma.cronJobRun.findMany({
    where: {
      startedAt: {
        gte: yesterday
      }
    },
    orderBy: {
      startedAt: 'desc'
    }
  });

  if (recentJobs.length > 0) {
    console.log('\n=== Recent Jobs (Last 24h) ===');
    for (const job of recentJobs) {
      console.log(`${job.jobName}: ${job.status} at ${job.startedAt.toISOString()}`);
    }
  } else {
    console.log('\n⚠️ No cron jobs have run in the last 24 hours!');
  }
}

cleanupStuckJobs()
  .then(() => {
    console.log('\nCleanup complete!');
    process.exit(0);
  })
  .catch(e => {
    console.error('Error during cleanup:', e);
    process.exit(1);
  });
