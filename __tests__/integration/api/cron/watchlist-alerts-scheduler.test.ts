import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { POST } from '@/app/api/cron/watchlist-alerts-scheduler/route';
import { NextRequest } from 'next/server';

describe('POST /api/cron/watchlist-alerts-scheduler', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, stats: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeRequest(headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost:3000/api/cron/watchlist-alerts-scheduler', {
      method: 'POST',
      headers,
    });
  }

  function makeAuthRequest() {
    return makeRequest({ authorization: 'Bearer test-cron-secret' });
  }

  // --- Auth ---

  it('returns 401 without CRON_SECRET', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  // --- Routing ---

  it('routes to morning alerts at UTC hour 13', async () => {
    vi.setSystemTime(new Date('2024-12-01T13:30:00Z'));

    const res = await POST(makeAuthRequest());
    const body = await res.json();

    expect(body.deliveryTime).toBe('morning');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('time=morning'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('routes to evening alerts at UTC hour 23', async () => {
    vi.setSystemTime(new Date('2024-12-01T23:15:00Z'));

    const res = await POST(makeAuthRequest());
    const body = await res.json();

    expect(body.deliveryTime).toBe('evening');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('time=evening'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('calls watchlist-alerts endpoint with proper auth', async () => {
    vi.setSystemTime(new Date('2024-12-01T13:00:00Z'));

    await POST(makeAuthRequest());

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-cron-secret',
        }),
      })
    );
  });

  it('handles fetch errors gracefully', async () => {
    fetchSpy.mockRejectedValue(new Error('Network failure'));

    const res = await POST(makeAuthRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe('Network failure');
  });

  it('returns success with alerts result', async () => {
    vi.setSystemTime(new Date('2024-12-01T13:00:00Z'));

    const res = await POST(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.alertsResult).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });
});
