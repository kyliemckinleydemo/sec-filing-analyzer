import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { GET } from '@/app/api/cron/update-stock-prices/route';
import { NextRequest } from 'next/server';

const CRON_URL = 'http://localhost:3000/api/cron/update-stock-prices';

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest(CRON_URL, { headers });
}

function makeAuthRequest() {
  return makeRequest({ authorization: 'Bearer test-cron-secret' });
}

describe('GET /api/cron/update-stock-prices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.company.findMany.mockResolvedValue([]);
    prismaMock.company.update.mockResolvedValue({});
    mockGetProfile.mockResolvedValue(MOCK_FMP_PROFILE);
  });

  // --- Auth ---

  it('returns 401 without CRON_SECRET', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid auth', async () => {
    const res = await GET(makeRequest({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  // --- Success ---

  it('returns 200 and updates stock prices for all companies', async () => {
    prismaMock.company.findMany.mockResolvedValue([
      { id: 'c1', ticker: 'AAPL' },
      { id: 'c2', ticker: 'MSFT' },
    ]);

    const res = await GET(makeAuthRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.results.updated).toBe(2);
  });

  it('updates company records with current price, market cap, peRatio', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'AAPL' }]);

    await GET(makeAuthRequest());

    expect(prismaMock.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          currentPrice: 195.0,
          marketCap: 3_000_000_000_000,
          peRatio: 31.5,
        }),
      })
    );
  });

  it('updates volume as BigInt', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'AAPL' }]);

    await GET(makeAuthRequest());

    expect(prismaMock.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          volume: BigInt(55000000),
        }),
      })
    );
  });

  // --- Error handling ---

  it('handles FMP errors per-ticker', async () => {
    prismaMock.company.findMany.mockResolvedValue([
      { id: 'c1', ticker: 'AAPL' },
      { id: 'c2', ticker: 'MSFT' },
    ]);

    mockGetProfile
      .mockRejectedValueOnce(new Error('FMP API error'))
      .mockResolvedValueOnce(MOCK_FMP_PROFILE);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results.errors).toBe(1);
    expect(body.results.updated).toBe(1);
  });

  it('handles empty company list', async () => {
    prismaMock.company.findMany.mockResolvedValue([]);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results.updated).toBe(0);
    expect(body.results.totalCompanies).toBe(0);
  });

  it('skips companies with no profile data', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'AAPL' }]);
    mockGetProfile.mockResolvedValue(null);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.results.skipped).toBe(1);
    expect(body.results.updated).toBe(0);
  });

  it('handles Prisma errors gracefully', async () => {
    prismaMock.company.findMany.mockRejectedValue(new Error('DB error'));

    const res = await GET(makeAuthRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe('DB error');
  });

  it('returns elapsed time in results', async () => {
    prismaMock.company.findMany.mockResolvedValue([]);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(typeof body.results.elapsedSeconds).toBe('number');
  });

  it('handles 404 errors silently for delisted tickers', async () => {
    prismaMock.company.findMany.mockResolvedValue([
      { id: 'c1', ticker: 'DELISTED' },
    ]);
    mockGetProfile.mockRejectedValue(new Error('Not Found (404)'));

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results.errors).toBe(1);
  });
});
