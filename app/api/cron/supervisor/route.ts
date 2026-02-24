/**
 * @module app/api/cron/supervisor/route
 * @description Next.js API route exposing supervisor health check endpoint for manual verification or external monitoring of cron job execution status
 *
 * PURPOSE:
 * - Authenticate requests using Vercel cron user-agent or Bearer token from CRON_SECRET environment variable
 * - Execute runSupervisorChecks with auto-trigger enabled to both monitor and potentially restart missing cron jobs
 * - Return health report with 'healthy' or 'alerts' status based on detected supervisor alerts
 *
 * DEPENDENCIES:
 * - @/lib/supervisor - Provides runSupervisorChecks function to verify cron job execution and optionally trigger missing jobs
 *
 * EXPORTS:
 * - dynamic (const) - Forces Next.js dynamic rendering to prevent response caching
 * - maxDuration (const) - Sets 300 second timeout allowing sufficient time for supervisor checks and potential job triggering
 * - GET (function) - Handles authenticated GET requests, runs supervisor checks with auto-trigger, returns JSON health report or error
 *
 * PATTERNS:
 * - Call GET /api/cron/supervisor with either User-Agent containing 'vercel-cron/' or Authorization header 'Bearer YOUR_CRON_SECRET'
 * - Response returns { status: 'healthy'|'alerts'|'error', report: {...} } with HTTP 200 for success or 401/500 for auth/system failures
 * - When auto-trigger enabled via manual call, endpoint actively restarts missing jobs rather than just reporting status
 *
 * CLAUDE NOTES:
 * - Dual authentication accepts both Vercel's automatic cron user-agent and manual Bearer token for flexibility in monitoring systems
 * - Auto-trigger parameter set to true means this endpoint actively fixes problems by restarting jobs, not just passive monitoring
 * - 5 minute maxDuration accommodates cascading job triggers since supervisor may need to start multiple sequential cron jobs
 * - Status differentiates 'alerts' (jobs missing but detected) from 'error' (supervisor check itself failed)
 */
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
