/**
 * @module app/api/cron/paper-trading-close-positions/route
 * @description Next.js API route executing scheduled cron job to automatically close paper trading positions held for 7+ days and update portfolio metrics
 *
 * PURPOSE:
 * - Authenticate requests using Vercel cron user-agent or CRON_SECRET bearer token
 * - Query all active paper trading portfolios from database
 * - Close positions held 7+ days using PaperTradingEngine.closeExpiredPositions()
 * - Recalculate portfolio metrics after position closures using updatePortfolioMetrics()
 * - Return summary with total positions closed across all portfolios
 *
 * DEPENDENCIES:
 * - next/server - Provides NextResponse for API route responses
 * - @/lib/prisma - Database client for querying active paper portfolios
 * - @/lib/paper-trading - PaperTradingEngine class handling position closure and metric updates
 *
 * EXPORTS:
 * - dynamic (const) - Set to 'force-dynamic' to disable static generation for cron execution
 * - maxDuration (const) - Set to 300 seconds allowing up to 5 minutes for batch processing
 * - GET (function) - Async handler processing daily cron job for position closure
 *
 * PATTERNS:
 * - Deploy with vercel.json cron schedule at '0 3 * * *' (3:00 AM ET daily)
 * - Set CRON_SECRET environment variable for local testing with Bearer token authentication
 * - Route accessible at /api/cron/paper-trading-close-positions for manual trigger
 * - Returns JSON with { success, message, results: { portfolios, positionsClosed } }
 *
 * CLAUDE NOTES:
 * - Scheduled after 3:00 AM ET to run after analyst data updates complete per comment
 * - Continues processing remaining portfolios even if individual portfolio fails with try-catch
 * - Accepts both Vercel cron user-agent and CRON_SECRET bearer token for flexibility
 * - Uses 5-minute timeout to handle large batch operations across multiple portfolios
 * - No transaction wrapping - each portfolio processed independently to isolate failures
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PaperTradingEngine } from '@/lib/paper-trading';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily Cron Job: Close paper trading positions after 7-day hold
 *
 * Runs daily to:
 * 1. Close all positions that have been open for 7+ days
 * 2. Update portfolio metrics
 * 3. Create daily snapshots
 *
 * Schedule: 3:00 AM ET (after analyst data update completes)
 */
export async function GET(request: Request) {
  // Verify request is from Vercel cron or has valid auth header
  const authHeader = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent');
  const cronSecret = process.env.CRON_SECRET;

  const isVercelCron = userAgent?.includes('vercel-cron/');
  const hasValidAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasValidAuth) {
    console.error('[Cron] Unauthorized request - not from Vercel cron and no valid auth header');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[Cron] Starting paper trading position closure...');

    // Get all active portfolios
    const portfolios = await prisma.paperPortfolio.findMany({
      where: { isActive: true }
    });

    console.log(`[Cron] Found ${portfolios.length} active paper trading portfolios`);

    let totalClosed = 0;

    for (const portfolio of portfolios) {
      try {
        const engine = new PaperTradingEngine(portfolio.id);

        // Close expired positions (7+ days old)
        const closed = await engine.closeExpiredPositions();
        totalClosed += closed;

        // Update portfolio metrics
        await engine.updatePortfolioMetrics();

        console.log(`[Cron] Portfolio "${portfolio.name}": closed ${closed} positions`);

      } catch (error: any) {
        console.error(`[Cron] Error processing portfolio ${portfolio.id}:`, error.message);
      }
    }

    console.log(`[Cron] Paper trading position closure complete: ${totalClosed} positions closed`);

    return NextResponse.json({
      success: true,
      message: `Closed ${totalClosed} positions across ${portfolios.length} portfolios`,
      results: {
        portfolios: portfolios.length,
        positionsClosed: totalClosed
      }
    });

  } catch (error: any) {
    console.error('[Cron] Error in paper trading position closure:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
