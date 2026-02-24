/**
 * @module app/api/cron/watchlist-alerts-scheduler/route
 * @description Cron endpoint that runs twice daily to determine morning/evening delivery time based on UTC hour and delegates to watchlist-alerts processor
 *
 * PURPOSE:
 * - Authenticates incoming cron requests using CRON_SECRET bearer token from environment
 * - Determines delivery time period by mapping 13:00 UTC to 'morning' (8am ET) and 23:00 UTC to 'evening' (6pm ET)
 * - Forwards authenticated request to /api/cron/watchlist-alerts with time query parameter
 * - Returns consolidated response with delivery time, UTC hour, timestamp, and alerts processing result
 *
 * DEPENDENCIES:
 * - next/server - Provides NextRequest and NextResponse for API route handling
 * - process.env.CRON_SECRET - Environment variable for authenticating scheduled cron jobs
 * - /api/cron/watchlist-alerts - Target endpoint that processes actual watchlist alert delivery
 *
 * EXPORTS:
 * - POST (function) - Handles cron-triggered requests, determines time period, and proxies to alerts endpoint
 *
 * PATTERNS:
 * - Configure cron job to POST to this endpoint at 13:00 UTC and 23:00 UTC daily
 * - Include 'Authorization: Bearer {CRON_SECRET}' header in all requests
 * - Response includes deliveryTime ('morning'|'evening'), utcHour, timestamp, and nested alertsResult object
 *
 * CLAUDE NOTES:
 * - Acts as time-aware router rather than processing alerts directly - separation allows manual triggering of alerts endpoint with explicit time parameter
 * - Hardcoded UTC hour check (13 = morning, else evening) assumes only two daily runs - adding third schedule would require logic update
 * - Forwards original Authorization header to alerts endpoint ensuring consistent authentication chain
 * - Logs UTC hour and calculated period for debugging timezone-related scheduling issues
 */
import { NextRequest, NextResponse } from 'next/server';

// This scheduler runs at both 13:00 UTC (8am ET) and 23:00 UTC (6pm ET)
// It determines which time period based on the current hour

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Determine time period based on current UTC hour
    const now = new Date();
    const utcHour = now.getUTCHours();

    // 13:00 UTC = morning (8am ET)
    // 23:00 UTC = evening (6pm ET)
    const deliveryTime = utcHour === 13 ? 'morning' : 'evening';

    console.log(`[Watchlist Alerts Scheduler] Running at ${now.toISOString()}, UTC hour: ${utcHour}, period: ${deliveryTime}`);

    // Call the actual alerts endpoint with the time parameter
    const alertsUrl = new URL('/api/cron/watchlist-alerts', request.url);
    alertsUrl.searchParams.set('time', deliveryTime);

    const response = await fetch(alertsUrl.toString(), {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    return NextResponse.json({
      success: true,
      deliveryTime,
      utcHour,
      timestamp: now.toISOString(),
      alertsResult: data,
    });
  } catch (error: any) {
    console.error('[Watchlist Alerts Scheduler] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run scheduler' },
      { status: 500 }
    );
  }
}
