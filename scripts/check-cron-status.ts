import { prisma } from '../lib/prisma';

async function checkCronStatus() {
  const recentRuns = await prisma.cronJobRun.findMany({
    where: {
      startedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    },
    orderBy: {
      startedAt: 'desc'
    },
    take: 20
  });

  console.log('\n=== Recent Cron Job Runs (Last 7 Days) ===');
  for (const run of recentRuns) {
    const duration = run.completedAt
      ? Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000)
      : 'N/A';
    const timeAgo = Math.round((Date.now() - run.startedAt.getTime()) / 1000 / 60);
    console.log(`\n${run.jobName}: ${run.status}`);
    console.log(`  Started: ${run.startedAt.toISOString()} (${timeAgo} min ago)`);
    console.log(`  Duration: ${duration}s`);
    if (run.result) {
      const res = typeof run.result === 'string' ? run.result : JSON.stringify(run.result);
      console.log(`  Result: ${res.substring(0, 300)}`);
    }
    if (run.error) {
      console.log(`  Error: ${run.error.substring(0, 200)}`);
    }
  }

  const running = await prisma.cronJobRun.findMany({
    where: {
      status: 'running'
    }
  });

  if (running.length > 0) {
    console.log('\n=== Currently Running Jobs ===');
    running.forEach(job => {
      console.log(`${job.jobName}: Started ${job.startedAt.toISOString()}`);
    });
  } else {
    console.log('\n=== No Currently Running Jobs ===');
  }
}

checkCronStatus()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
