import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../../mocks/prisma';
import {
  MOCK_FILING_RECENT,
  MOCK_ANALYST_ACTIVITY,
  MOCK_USER_WITH_WATCHLIST,
} from '../../../fixtures/cron-data';

// Mock Resend
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({ id: 'email-001' }),
}));
vi.mock('resend', () => {
  return {
    Resend: function () {
      return { emails: { send: mockSend } };
    },
  };
});

import { POST } from '@/app/api/cron/watchlist-alerts/route';
import { NextRequest } from 'next/server';

const CRON_URL = 'http://localhost:3000/api/cron/watchlist-alerts?time=morning';

function makeRequest(headers: Record<string, string> = {}, time = 'morning') {
  return new NextRequest(`http://localhost:3000/api/cron/watchlist-alerts?time=${time}`, {
    method: 'POST',
    headers,
  });
}

function makeAuthRequest(time = 'morning') {
  return makeRequest({ authorization: 'Bearer test-cron-secret' }, time);
}

describe('POST /api/cron/watchlist-alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.filing.findMany.mockResolvedValue([]);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
  });

  // --- Auth ---

  it('returns 401 without CRON_SECRET', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong auth', async () => {
    const res = await POST(makeRequest({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  // --- Success ---

  it('returns 200 for valid request', async () => {
    const res = await POST(makeAuthRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('sends email alerts for new filings matching watchlist', async () => {
    const filing = {
      ...MOCK_FILING_RECENT,
      company: { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    };

    prismaMock.filing.findMany.mockResolvedValue([filing]);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([MOCK_USER_WITH_WATCHLIST]);

    const res = await POST(makeAuthRequest());
    const body = await res.json();

    expect(body.stats.emailsSent).toBe(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('sends email alerts for new analyst activity', async () => {
    prismaMock.filing.findMany.mockResolvedValue([]);
    prismaMock.analystActivity.findMany.mockResolvedValue([MOCK_ANALYST_ACTIVITY]);
    prismaMock.user.findMany.mockResolvedValue([MOCK_USER_WITH_WATCHLIST]);

    const res = await POST(makeAuthRequest());
    const body = await res.json();

    expect(body.stats.emailsSent).toBe(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'trader@example.com',
        html: expect.stringContaining('Goldman Sachs'),
      })
    );
  });

  it('groups alerts per user (one email per user)', async () => {
    const filing = {
      ...MOCK_FILING_RECENT,
      company: { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    };

    prismaMock.filing.findMany.mockResolvedValue([filing]);
    prismaMock.analystActivity.findMany.mockResolvedValue([MOCK_ANALYST_ACTIVITY]);
    prismaMock.user.findMany.mockResolvedValue([MOCK_USER_WITH_WATCHLIST]);

    await POST(makeAuthRequest());

    // Should send ONE email with both filing and analyst alerts
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('sends emails to multiple users', async () => {
    const user2 = {
      ...MOCK_USER_WITH_WATCHLIST,
      id: 'user-002',
      email: 'trader2@example.com',
    };

    const filing = {
      ...MOCK_FILING_RECENT,
      company: { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    };

    prismaMock.filing.findMany.mockResolvedValue([filing]);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([MOCK_USER_WITH_WATCHLIST, user2]);

    await POST(makeAuthRequest());

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('does not send email when no alerts triggered', async () => {
    // User watches AAPL but no AAPL filings
    const filing = {
      ...MOCK_FILING_RECENT,
      company: { ticker: 'GOOG', name: 'Alphabet Inc.', sector: 'Technology' },
    };

    prismaMock.filing.findMany.mockResolvedValue([filing]);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([MOCK_USER_WITH_WATCHLIST]);

    const res = await POST(makeAuthRequest());
    const body = await res.json();

    expect(body.stats.emailsSent).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  // --- Email content ---

  it('includes concern level color in filing alerts', async () => {
    const highConcernFiling = {
      ...MOCK_FILING_RECENT,
      concernLevel: 8.0,
      company: { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    };

    prismaMock.filing.findMany.mockResolvedValue([highConcernFiling]);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([MOCK_USER_WITH_WATCHLIST]);

    await POST(makeAuthRequest());

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('#dc2626'), // red for concern >= 7
      })
    );
  });

  it('formats action types correctly (upgrade → Upgrade)', async () => {
    prismaMock.filing.findMany.mockResolvedValue([]);
    prismaMock.analystActivity.findMany.mockResolvedValue([MOCK_ANALYST_ACTIVITY]);
    prismaMock.user.findMany.mockResolvedValue([MOCK_USER_WITH_WATCHLIST]);

    await POST(makeAuthRequest());

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('Upgrade'),
      })
    );
  });

  it('uses correct action color for upgrades (green)', async () => {
    prismaMock.filing.findMany.mockResolvedValue([]);
    prismaMock.analystActivity.findMany.mockResolvedValue([MOCK_ANALYST_ACTIVITY]);
    prismaMock.user.findMany.mockResolvedValue([MOCK_USER_WITH_WATCHLIST]);

    await POST(makeAuthRequest());

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('#10b981'), // green for upgrade
      })
    );
  });

  it('uses correct action color for downgrades (red)', async () => {
    const downgrade = {
      ...MOCK_ANALYST_ACTIVITY,
      actionType: 'downgrade',
      previousRating: 'Buy',
      newRating: 'Hold',
    };

    prismaMock.filing.findMany.mockResolvedValue([]);
    prismaMock.analystActivity.findMany.mockResolvedValue([downgrade]);
    prismaMock.user.findMany.mockResolvedValue([MOCK_USER_WITH_WATCHLIST]);

    await POST(makeAuthRequest());

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('#ef4444'), // red for downgrade
      })
    );
  });

  it('includes morning label for morning alerts', async () => {
    const filing = {
      ...MOCK_FILING_RECENT,
      company: { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    };

    prismaMock.filing.findMany.mockResolvedValue([filing]);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([MOCK_USER_WITH_WATCHLIST]);

    await POST(makeAuthRequest('morning'));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Morning'),
      })
    );
  });

  // --- Edge cases ---

  it('handles users with no watchlist items', async () => {
    const userNoWatchlist = {
      ...MOCK_USER_WITH_WATCHLIST,
      watchlist: [],
      sectorWatchlist: [],
    };

    const filing = {
      ...MOCK_FILING_RECENT,
      company: { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    };

    prismaMock.filing.findMany.mockResolvedValue([filing]);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([userNoWatchlist]);

    const res = await POST(makeAuthRequest());
    const body = await res.json();

    expect(body.stats.emailsSent).toBe(0);
  });

  it('deduplicates filings across alert types', async () => {
    const userWithMultipleAlerts = {
      ...MOCK_USER_WITH_WATCHLIST,
      alerts: [
        ...MOCK_USER_WITH_WATCHLIST.alerts,
        {
          id: 'alert-003',
          userId: 'user-001',
          alertType: 'prediction_result',
          ticker: null,
          sector: null,
          enabled: true,
          frequency: 'immediate',
          deliveryTime: 'both',
          minConcernLevel: null,
          minPredictedReturn: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };

    const filing = {
      ...MOCK_FILING_RECENT,
      predicted7dReturn: 2.5,
      company: { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    };

    prismaMock.filing.findMany.mockResolvedValue([filing]);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([userWithMultipleAlerts]);

    await POST(makeAuthRequest());

    // The filing should appear once even though it matches two alert types
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('handles Resend API errors gracefully', async () => {
    const filing = {
      ...MOCK_FILING_RECENT,
      company: { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    };

    prismaMock.filing.findMany.mockResolvedValue([filing]);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([MOCK_USER_WITH_WATCHLIST]);

    mockSend.mockRejectedValue(new Error('Resend rate limit'));

    const res = await POST(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.stats.errors).toBe(1);
    expect(body.stats.emailsSent).toBe(0);
  });

  it('handles Prisma errors gracefully', async () => {
    prismaMock.filing.findMany.mockRejectedValue(new Error('DB timeout'));

    const res = await POST(makeAuthRequest());
    expect(res.status).toBe(500);
  });

  it('includes target price changes in analyst alerts', async () => {
    const targetChange = {
      ...MOCK_ANALYST_ACTIVITY,
      actionType: 'target_raised',
      previousTarget: 180.0,
      newTarget: 210.0,
    };

    prismaMock.filing.findMany.mockResolvedValue([]);
    prismaMock.analystActivity.findMany.mockResolvedValue([targetChange]);
    prismaMock.user.findMany.mockResolvedValue([MOCK_USER_WITH_WATCHLIST]);

    await POST(makeAuthRequest());

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('$180.00'),
      })
    );
  });
});
