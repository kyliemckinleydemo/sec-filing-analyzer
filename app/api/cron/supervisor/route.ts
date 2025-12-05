import { NextResponse } from 'next/server';
import { runSupervisorChecks } from '@/lib/supervisor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes to allow for triggering jobs

/**
 * Supervisor Health Check Endpoint
 *
 * Can be called manually or by external monitoring services.
 * The supervisor checks are now integrated into daily-filings-rss cron.
 *
 * This endpoint exists for:
 * - Manual health checks
 * - External monitoring services
 * - Emergency auto-trigger of missing jobs
 */

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

  try {
    // Run supervisor health checks with auto-trigger enabled
    // (When called manually, it can trigger missing jobs)
    const report = await runSupervisorChecks(true);

    return NextResponse.json({
      status: report.alerts.length === 0 ? 'healthy' : 'alerts',
      report
    });

  } catch (error: any) {
    console.error('[Supervisor Endpoint] Error:', error);

    return NextResponse.json({
      status: 'error',
      error: error.message
    }, { status: 500 });
  }
}
