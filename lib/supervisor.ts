/**
 * @module lib/supervisor
 * @description Monitors cron job health by detecting stuck jobs, missing scheduled runs, and high failure rates, with automatic recovery and email alerting via Resend API
 *
 * PURPOSE:
 * - Detects and marks jobs stuck in 'running' status for over 10 minutes as failed
 * - Auto-retries stuck jobs by calling their API endpoints with CRON_SECRET authorization
 * - Alerts when daily-filings-rss hasn't succeeded in 30 hours or update-analyst-data in 48 hours on weekdays
 * - Sends HTML email alerts via Resend API when critical issues detected or jobs auto-triggered
 *
 * DEPENDENCIES:
 * - ./prisma - Queries cronJobRun table for job status history and updates stuck job records
 *
 * EXPORTS:
 * - SupervisorReport (interface) - Report structure containing timestamp, counts of fixed jobs, missing job flags, triggered job names, alert messages, and action logs
 * - runSupervisorChecks (function) - Executes health monitoring checks and returns SupervisorReport; accepts autoTriggerMissing boolean to enable automatic job triggering
 *
 * PATTERNS:
 * - Call runSupervisorChecks(true) to enable auto-triggering of missing jobs, or runSupervisorChecks(false) for monitoring only
 * - Configure RESEND_API_KEY and ALERT_EMAIL environment variables to enable email alerts
 * - Set CRON_SECRET and VERCEL_URL for automatic job retry functionality
 * - Check report.alerts array for warning messages and report.actions for recovery actions taken
 *
 * CLAUDE NOTES:
 * - Uses 30-hour buffer for daily jobs and 48-hour buffer for analyst updates to avoid false positives from schedule variations
 * - Batches all stuck job retry API calls with Promise.all to minimize supervisor execution time
 * - Only alerts about missing analyst updates on weekdays (Mon-Fri) since job runs weekdays only
 * - Sends email on supervisor failure itself to prevent silent monitoring failures
 * - Marks stuck jobs as failed with specific 'Job timed out - auto-fixed by supervisor' error message before retry
 */
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

      // Auto-retry stuck jobs - batch all fetch calls
      const cronSecret = process.env.CRON_SECRET;
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'https://sec-filing-analyzer-indol.vercel.app';

      const retryPromises = stuckJobs.map(async (stuckJob) => {
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
              return {
                success: true,
                jobName: stuckJob.jobName,
                message: result.message || 'Success'
              };
            } else {
              const error = await retryResponse.text();
              return {
                success: false,
                jobName: stuckJob.jobName,
                error
              };
            }
          } catch (error: any) {
            return {
              success: false,
              jobName: stuckJob.jobName,
              error: error.message
            };
          }
        }
        return null;
      });

      const retryResults = await Promise.all(retryPromises);

      for (const result of retryResults) {
        if (result) {
          if (result.success) {
            report.jobsTriggered.push(`${result.jobName} (retry)`);
            report.actions.push(`✅ Auto-retried stuck job ${result.jobName}: ${result.message}`);
            console.log(`[Supervisor] Successfully retried ${result.jobName}`);
          } else {
            report.actions.push(`❌ Failed to retry ${result.jobName}: ${result.error}`);
            console.error(`[Supervisor] Failed to retry ${result.jobName}:`, result.error);
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