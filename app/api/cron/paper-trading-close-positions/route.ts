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
