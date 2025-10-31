/**
 * Cron Job Health Monitor
 *
 * Checks if cron jobs are running on schedule and alerts on failures.
 * Can be run manually or as part of a monitoring system.
 */

import { prisma } from '../lib/prisma';

interface CronJobStatus {
  jobName: string;
  expectedSchedule: string;
  lastRun: Date | null;
  status: string;
  hoursSinceLastRun: number | null;
  isHealthy: boolean;
  issues: string[];
}

const EXPECTED_SCHEDULES = {
  'daily-filings-rss': {
    schedule: '2:00 AM daily',
    maxHoursBetweenRuns: 26, // Allow 2 hour buffer
    description: 'Fetches latest SEC filings via RSS feed'
  },
  'update-analyst-data': {
    schedule: '2:30 AM daily',
    maxHoursBetweenRuns: 26,
    description: 'Updates analyst data + closes paper trading positions'
  }
};

async function checkCronJobHealth(jobName: string): Promise<CronJobStatus> {
  const config = EXPECTED_SCHEDULES[jobName as keyof typeof EXPECTED_SCHEDULES];

  if (!config) {
    return {
      jobName,
      expectedSchedule: 'Unknown',
      lastRun: null,
      status: 'unknown',
      hoursSinceLastRun: null,
      isHealthy: false,
      issues: ['Job not in monitoring configuration']
    };
  }

  const issues: string[] = [];

  // Get last successful run
  const lastSuccessfulRun = await prisma.cronJobRun.findFirst({
    where: {
      jobName,
      status: 'success'
    },
    orderBy: {
      completedAt: 'desc'
    }
  });

  // Get last run (any status)
  const lastRun = await prisma.cronJobRun.findFirst({
    where: { jobName },
    orderBy: {
      startedAt: 'desc'
    }
  });

  const lastRunDate = lastSuccessfulRun?.completedAt || null;
  const hoursSinceLastRun = lastRunDate
    ? (Date.now() - lastRunDate.getTime()) / (1000 * 60 * 60)
    : null;

  // Check if job has run recently
  if (hoursSinceLastRun === null) {
    issues.push('No successful runs found in database');
  } else if (hoursSinceLastRun > config.maxHoursBetweenRuns) {
    issues.push(`Last run was ${hoursSinceLastRun.toFixed(1)} hours ago (expected < ${config.maxHoursBetweenRuns}h)`);
  }

  // Check for recent failures
  const recentRuns = await prisma.cronJobRun.findMany({
    where: {
      jobName,
      startedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
      }
    },
    orderBy: {
      startedAt: 'desc'
    }
  });

  const failedRuns = recentRuns.filter(r => r.status === 'failed');
  if (failedRuns.length > 0) {
    issues.push(`${failedRuns.length} failed runs in last 7 days`);

    // Show most recent error
    if (failedRuns[0].errorMessage) {
      issues.push(`Latest error: ${failedRuns[0].errorMessage.substring(0, 100)}`);
    }
  }

  // Check for stuck runs
  const stuckRuns = recentRuns.filter(r =>
    r.status === 'running' &&
    r.startedAt.getTime() < Date.now() - 10 * 60 * 1000 // Older than 10 minutes
  );

  if (stuckRuns.length > 0) {
    issues.push(`${stuckRuns.length} stuck runs (running > 10 min)`);
  }

  const isHealthy = issues.length === 0;

  return {
    jobName,
    expectedSchedule: config.schedule,
    lastRun: lastRunDate,
    status: lastRun?.status || 'never-run',
    hoursSinceLastRun,
    isHealthy,
    issues
  };
}

async function main() {
  console.log('🏥 CRON JOB HEALTH MONITOR\n');
  console.log('═'.repeat(100));
  console.log(`Check time: ${new Date().toISOString()}`);
  console.log('═'.repeat(100));

  const jobNames = Object.keys(EXPECTED_SCHEDULES);
  const statuses: CronJobStatus[] = [];

  for (const jobName of jobNames) {
    const status = await checkCronJobHealth(jobName);
    statuses.push(status);
  }

  // Display results
  console.log('\n📊 JOB STATUS\n');

  for (const status of statuses) {
    const healthIcon = status.isHealthy ? '✅' : '❌';
    console.log(`${healthIcon} ${status.jobName}`);
    console.log(`   Schedule: ${status.expectedSchedule}`);
    console.log(`   Status: ${status.status}`);

    if (status.lastRun) {
      console.log(`   Last successful run: ${status.lastRun.toISOString()}`);
      console.log(`   Time since last run: ${status.hoursSinceLastRun?.toFixed(1)} hours`);
    } else {
      console.log(`   Last successful run: Never`);
    }

    if (status.issues.length > 0) {
      console.log(`   ⚠️  Issues:`);
      status.issues.forEach(issue => {
        console.log(`      - ${issue}`);
      });
    }

    console.log('');
  }

  // Summary
  console.log('═'.repeat(100));
  console.log('\n📈 SUMMARY\n');

  const healthyJobs = statuses.filter(s => s.isHealthy).length;
  const totalJobs = statuses.length;

  console.log(`   Healthy: ${healthyJobs}/${totalJobs}`);
  console.log(`   Unhealthy: ${totalJobs - healthyJobs}/${totalJobs}`);

  if (healthyJobs === totalJobs) {
    console.log('\n✅ All cron jobs are healthy!');
  } else {
    console.log('\n❌ Some cron jobs need attention!');

    console.log('\n🔧 RECOMMENDED ACTIONS:\n');
    console.log('   1. Check Vercel dashboard for cron execution logs');
    console.log('   2. Verify CRON_SECRET is set correctly in Vercel environment');
    console.log('   3. Check deployment logs for errors');
    console.log('   4. Manually trigger cron jobs to test:');
    console.log('      curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/daily-filings-rss');
  }

  console.log('\n' + '═'.repeat(100));

  await prisma.$disconnect();

  // Exit with error code if unhealthy
  if (healthyJobs < totalJobs) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
