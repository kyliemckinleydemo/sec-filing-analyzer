import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Supervisor Cron Job: Monitor and fix stuck jobs
 *
 * Runs daily to:
 * - Detect stuck jobs (running > 10 min)
 * - Mark them as failed
 * - Check if daily jobs ran successfully in last 24h
 * - Send email alerts if critical issues detected
 *
 * Schedule: 0 6 * * * (daily at 6 AM UTC)
 */

interface SupervisorReport {
  timestamp: string;
  stuckJobsFixed: number;
  missingDailyFilings: boolean;
  missingAnalystUpdate: boolean;
  alerts: string[];
  actions: string[];
}

async function sendEmailAlert(subject: string, body: string): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const alertEmail = process.env.ALERT_EMAIL;

  if (!resendApiKey || !alertEmail) {
    console.error('[Supervisor] Missing RESEND_API_KEY or ALERT_EMAIL env vars');
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
            Sent by SEC Filing Analyzer Supervisor Cron<br/>
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

export async function GET(request: Request) {
  // Verify request is from Vercel cron or has valid auth header
  const authHeader = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent');
  const cronSecret = process.env.CRON_SECRET;

  const isVercelCron = userAgent?.includes('vercel-cron/');
  const hasValidAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasValidAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const report: SupervisorReport = {
    timestamp: new Date().toISOString(),
    stuckJobsFixed: 0,
    missingDailyFilings: false,
    missingAnalystUpdate: false,
    alerts: [],
    actions: []
  };

  try {
    console.log('[Supervisor] Starting health check...');

    // 1. Fix stuck jobs (running > 10 minutes)
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
    }

    // 2. Check if daily-filings-rss ran in last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentFilingsRun = await prisma.cronJobRun.findFirst({
      where: {
        jobName: 'daily-filings-rss',
        status: 'success',
        completedAt: {
          gte: yesterday
        }
      },
      orderBy: {
        completedAt: 'desc'
      }
    });

    if (!recentFilingsRun) {
      report.missingDailyFilings = true;
      report.alerts.push('⚠️ daily-filings-rss has not run successfully in last 24 hours');
      console.log('[Supervisor] ALERT: Missing daily filings update');
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

    // 5. Send email if there are critical alerts
    if (report.alerts.length > 0) {
      const alertBody = [
        '=== Cron Job Health Report ===',
        '',
        ...report.alerts,
        '',
        '=== Actions Taken ===',
        ...report.actions,
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

      await sendEmailAlert(
        `Cron Job Health Alert (${report.alerts.length} issues)`,
        alertBody
      );
    } else {
      console.log('[Supervisor] ✅ All systems healthy');
    }

    return NextResponse.json({
      status: report.alerts.length === 0 ? 'healthy' : 'alerts',
      report
    });

  } catch (error: any) {
    console.error('[Supervisor] Error:', error);

    // Try to send alert about supervisor failure
    await sendEmailAlert(
      'Supervisor Cron Failed',
      `The supervisor cron job itself failed:\n\n${error.message}\n\nStack:\n${error.stack}`
    );

    return NextResponse.json({
      status: 'error',
      error: error.message,
      report
    }, { status: 500 });
  }
}
