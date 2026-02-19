import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prismaMock } from '../../../mocks/prisma';
import { MOCK_FMP_PROFILE } from '../../../fixtures/cron-data';

const { mockGetProfile } = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
}));
vi.mock('@/lib/fmp-client', () => ({
  default: {
    getProfile: mockGetProfile,
  },
  parseRange: (range: string) => {
    if (!range) return null;
    const parts = range.split('-').map((s: string) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { low: Math.min(parts[0], parts[1]), high: Math.max(parts[0], parts[1]) };
    }
    return null;
  },
}));

import { GET } from '@/app/api/cron/update-stock-prices-batch/route';
import { NextRequest } from 'next/server';

const CRON_URL = 'http://localhost:3000/api/cron/update-stock-prices-batch';

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest(CRON_URL, { headers });
}

function makeAuthRequest() {
  return makeRequest({ authorization: 'Bearer test-cron-secret' });
}

describe('GET /api/cron/update-stock-prices-batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.company.findMany.mockResolvedValue([]);
    prismaMock.company.update.mockResolvedValue({});
    mockGetProfile.mockResolvedValue(MOCK_FMP_PROFILE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Auth ---

  it('returns 401 without CRON_SECRET', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  // --- Batch selection ---

  it('selects batch based on day of year', async () => {
    // 2024-12-01 = day 336 of year, 336 % 6 = 0 → batch 0
    vi.setSystemTime(new Date('2024-12-01T05:00:00Z'));

    const companies = Array.from({ length: 12 }, (_, i) => ({
      id: `c-${i}`,
      ticker: `TICK${i}`,
    }));
    prismaMock.company.findMany.mockResolvedValue(companies);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.totalBatches).toBe(6);
    // Batch number rotates by day
    expect(body.batch).toBeGreaterThanOrEqual(1);
    expect(body.batch).toBeLessThanOrEqual(6);
  });

  it('rotates to different batch on different days', async () => {
    const companies = Array.from({ length: 18 }, (_, i) => ({
      id: `c-${i}`,
      ticker: `TICK${i}`,
    }));
    prismaMock.company.findMany.mockResolvedValue(companies);

    vi.setSystemTime(new Date('2024-12-01T05:00:00Z'));
    const res1 = await GET(makeAuthRequest());
    const body1 = await res1.json();

    vi.setSystemTime(new Date('2024-12-02T05:00:00Z'));
    const res2 = await GET(makeAuthRequest());
    const body2 = await res2.json();

    // Different days should pick different batches
    expect(body1.batch).not.toBe(body2.batch);
  });

  it('only updates companies in the current batch slice', async () => {
    vi.setSystemTime(new Date('2024-12-01T05:00:00Z'));

    // 12 companies, 6 batches → 2 per batch
    const companies = Array.from({ length: 12 }, (_, i) => ({
      id: `c-${i}`,
      ticker: `TICK${i}`,
    }));
    prismaMock.company.findMany.mockResolvedValue(companies);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    // Batch 0 should process first 2 companies
    expect(body.companiesInBatch).toBe(2);
    expect(body.updated).toBe(2);
  });

  // --- Updates ---

  it('updates price, market cap, volume on company records', async () => {
    // Day 336, 336 % 6 = 0 → batch 0 (first company included)
    vi.setSystemTime(new Date('2024-12-01T05:00:00Z'));

    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'AAPL' }]);

    await GET(makeAuthRequest());

    expect(prismaMock.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          currentPrice: 195.0,
          marketCap: 3_000_000_000_000,
        }),
      })
    );
  });

  // --- Error handling ---

  it('handles errors per-ticker gracefully', async () => {
    vi.setSystemTime(new Date('2024-12-01T05:00:00Z'));

    // Need 12+ companies so batch 0 gets 2 companies (ceil(12/6)=2)
    const companies = Array.from({ length: 12 }, (_, i) => ({
      id: `c-${i}`,
      ticker: `TICK${i}`,
    }));
    // batch 0 will process companies[0] and companies[1]
    prismaMock.company.findMany.mockResolvedValue(companies);

    mockGetProfile
      .mockResolvedValueOnce(MOCK_FMP_PROFILE)
      .mockRejectedValueOnce(new Error('FMP error'));

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.updated).toBe(1);
    expect(body.errors).toBe(1);
  });

  it('handles empty company list', async () => {
    prismaMock.company.findMany.mockResolvedValue([]);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.updated).toBe(0);
  });

  it('handles Prisma errors gracefully', async () => {
    prismaMock.company.findMany.mockRejectedValue(new Error('DB connection lost'));

    const res = await GET(makeAuthRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe('DB connection lost');
  });

  it('handles 404 delisted tickers gracefully', async () => {
    // Day 336, 336 % 6 = 0 → batch 0 (first company included)
    vi.setSystemTime(new Date('2024-12-01T05:00:00Z'));

    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'DEAD' }]);
    mockGetProfile.mockRejectedValue(new Error('Not Found'));

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.errors).toBe(1);
  });
});
