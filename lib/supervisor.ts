import { prisma } from './prisma';

export interface SupervisorReport {
  timestamp: string;
  stuckJobsFixed: number;
  missingDailyFilings: boolean;
  missingAnalystUpdate: boolean;
  jobsTriggered: string[];
  alerts: string[];
  actions: string[];
}

async function sendEmailAlert(subject: string, body: string): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const alertEmail = process.env.ALERT_EMAIL;

  if (!resendApiKey || !alertEmail) {
    console.log('[Supervisor] Skipping email - RESEND_API_KEY or ALERT_EMAIL not configured');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'SEC Filing Analyzer <alerts@resend.dev>',
        to: [alertEmail],
        subject: `[SEC Filing Analyzer] ${subject}`,
        html: `
          <h2>${subject}</h2>
          <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px;">${body}</pre>
          <p style="color: #666; font-size: 12px;">
            Sent by SEC Filing Analyzer Supervisor<br/>
            ${new Date().toISOString()}
          </p>
        `
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Supervisor] Email send failed: ${error}`);
      return false;
    }

    console.log('[Supervisor] Email alert sent successfully');
    return true;
  } catch (error: any) {
    console.error(`[Supervisor] Email error: ${error.message}`);
    return false;
  }
}

/**
 * Run supervisor health checks and monitoring
 *
 * @param autoTriggerMissing - If true, will automatically trigger missing jobs
 * @returns SupervisorReport with monitoring results
 */
export async function runSupervisorChecks(autoTriggerMissing: boolean = false): Promise<SupervisorReport> {
  const report: SupervisorReport = {
    timestamp: new Date().toISOString(),
    stuckJobsFixed: 0,
    missingDailyFilings: false,
    missingAnalystUpdate: false,
    jobsTriggered: [],
    alerts: [],
    actions: []
  };

  try {
    console.log('[Supervisor] Starting health check...');

    // 1. Fix stuck jobs (running > 10 minutes) and retry them
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const stuckJobs = await prisma.cronJobRun.findMany({
      where: {
        status: 'running',
        startedAt: {
          lt: tenMinutesAgo
        }
      }
    });

    if (stuckJobs.length > 0) {
      console.log(`[Supervisor] Found ${stuckJobs.length} stuck jobs`);

      // Mark stuck jobs as failed
      const result = await prisma.cronJobRun.updateMany({
        where: {
          status: 'running',
          startedAt: {
            lt: tenMinutesAgo
          }
        },
        data: {
          status: 'failed',
          errorMessage: 'Job timed out - auto-fixed by supervisor',
          completedAt: new Date()
        }
      });

      report.stuckJobsFixed = result.count;
      report.actions.push(`Fixed ${result.count} stuck jobs`);
      console.log(`[Supervisor] Marked ${result.count} stuck jobs as failed`);

      // Auto-retry stuck jobs
      const cronSecret = process.env.CRON_SECRET;
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'https://sec-filing-analyzer-indol.vercel.app';

      for (const stuckJob of stuckJobs) {
        const jobPath = stuckJob.jobName === 'daily-filings-rss'
          ? '/api/cron/daily-filings-rss'
          : stuckJob.jobName === 'update-analyst-data'
          ? '/api/cron/update-analyst-data'
          : null;

        if (jobPath) {
          try {
            console.log(`[Supervisor] Auto-retrying stuck job: ${stuckJob.jobName}`);

            const retryResponse = await fetch(`${baseUrl}${jobPath}`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${cronSecret}`,
                'User-Agent': 'supervisor-auto-retry'
              }
            });

            if (retryResponse.ok) {
              const result = await retryResponse.json();
              report.jobsTriggered.push(`${stuckJob.jobName} (retry)`);
              report.actions.push(`✅ Auto-retried stuck job ${stuckJob.jobName}: ${result.message || 'Success'}`);
              console.log(`[Supervisor] Successfully retried ${stuckJob.jobName}`);
            } else {
              const error = await retryResponse.text();
              report.actions.push(`❌ Failed to retry ${stuckJob.jobName}: ${error}`);
              console.error(`[Supervisor] Failed to retry ${stuckJob.jobName}:`, error);
            }
          } catch (error: any) {
            report.actions.push(`❌ Error retrying ${stuckJob.jobName}: ${error.message}`);
            console.error(`[Supervisor] Error retrying ${stuckJob.jobName}:`, error);
          }
        }
      }
    }

    // 2. Check if daily-filings-rss ran in last 30 hours (give extra buffer)
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);

    const recentFilingsRun = await prisma.cronJobRun.findFirst({
      where: {
        jobName: 'daily-filings-rss',
        status: 'success',
        completedAt: {
          gte: thirtyHoursAgo
        }
      },
      orderBy: {
        completedAt: 'desc'
      }
    });

    if (!recentFilingsRun) {
      report.missingDailyFilings = true;
      report.alerts.push('⚠️ daily-filings-rss has not run successfully in last 30 hours');
      console.log('[Supervisor] ALERT: Missing daily filings update');

      // Auto-trigger the missing job if requested
      if (autoTriggerMissing) {
        try {
          console.log('[Supervisor] Auto-triggering daily-filings-rss...');
          const cronSecret = process.env.CRON_SECRET;
          const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'https://sec-filing-analyzer-indol.vercel.app';

          const triggerResponse = await fetch(`${baseUrl}/api/cron/daily-filings-rss`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${cronSecret}`,
              'User-Agent': 'supervisor-auto-trigger'
            }
          });

          if (triggerResponse.ok) {
            const result = await triggerResponse.json();
            report.jobsTriggered.push('daily-filings-rss');
            report.actions.push(`✅ Auto-triggered daily-filings-rss: ${result.message}`);
            console.log('[Supervisor] Successfully triggered daily-filings-rss');
          } else {
            const error = await triggerResponse.text();
            report.actions.push(`❌ Failed to trigger daily-filings-rss: ${error}`);
            console.error('[Supervisor] Failed to trigger daily-filings-rss:', error);
          }
        } catch (error: any) {
          report.actions.push(`❌ Error triggering daily-filings-rss: ${error.message}`);
          console.error('[Supervisor] Error triggering daily-filings-rss:', error);
        }
      }
    }

    // 3. Check if update-analyst-data ran in last 48 hours (runs weekdays only)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const recentAnalystRun = await prisma.cronJobRun.findFirst({
      where: {
        jobName: 'update-analyst-data',
        status: 'success',
        completedAt: {
          gte: twoDaysAgo
        }
      },
      orderBy: {
        completedAt: 'desc'
      }
    });

    // Only alert on weekdays (Mon-Fri)
    const today = new Date();
    const dayOfWeek = today.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (isWeekday && !recentAnalystRun) {
      report.missingAnalystUpdate = true;
      report.alerts.push('⚠️ update-analyst-data has not run successfully in last 48 hours');
      console.log('[Supervisor] ALERT: Missing analyst data update');
    }

    // 4. Check for high failure rate (>50% failures in last 10 runs)
    const recentRuns = await prisma.cronJobRun.findMany({
      take: 10,
      orderBy: {
        startedAt: 'desc'
      }
    });

    const failures = recentRuns.filter(r => r.status === 'failed').length;
    if (recentRuns.length >= 5 && failures / recentRuns.length > 0.5) {
      report.alerts.push(`⚠️ High failure rate: ${failures}/${recentRuns.length} recent jobs failed`);
      console.log(`[Supervisor] ALERT: High failure rate detected`);
    }

    // 5. Send email if there are critical alerts or jobs were triggered
    if (report.alerts.length > 0 || report.jobsTriggered.length > 0) {
      const alertBody = [
        '=== Cron Job Health Report ===',
        '',
        ...report.alerts,
        '',
        '=== Jobs Auto-Triggered ===',
        report.jobsTriggered.length > 0
          ? report.jobsTriggered.map(job => `✅ ${job}`).join('\n')
          : 'None',
        '',
        '=== Actions Taken ===',
        report.actions.length > 0 ? report.actions.join('\n') : 'None',
        '',
        `Timestamp: ${report.timestamp}`,
        '',
        '=== Recommendations ===',
        'Check Vercel cron job logs:',
        'https://vercel.com/dashboard',
        '',
        'Review database cron job history:',
        'Run: npx tsx scripts/check-cron-status.ts'
      ].join('\n');

      const subject = report.jobsTriggered.length > 0
        ? `Cron Job Auto-Recovery (${report.jobsTriggered.length} jobs triggered)`
        : `Cron Job Health Alert (${report.alerts.length} issues)`;

      await sendEmailAlert(subject, alertBody);
    } else {
      console.log('[Supervisor] ✅ All systems healthy');
    }

    return report;

  } catch (error: any) {
    console.error('[Supervisor] Error during checks:', error);

    // Try to send alert about supervisor failure
    await sendEmailAlert(
      'Supervisor Health Check Failed',
      `The supervisor health check failed:\n\n${error.message}\n\nStack:\n${error.stack}`
    );

    throw error;
  }
}
