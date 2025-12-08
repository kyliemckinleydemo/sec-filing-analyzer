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
