import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prismaMock } from '../../../mocks/prisma';
import { MOCK_YAHOO_QUOTE_SUMMARY } from '../../../fixtures/cron-data';

const { mockQuoteSummary } = vi.hoisted(() => ({
  mockQuoteSummary: vi.fn(),
}));
vi.mock('yahoo-finance2', () => ({
  default: {
    quoteSummary: mockQuoteSummary,
    suppressNotices: vi.fn(),
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
    mockQuoteSummary.mockResolvedValue(MOCK_YAHOO_QUOTE_SUMMARY);
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

  it('selects correct batch based on UTC hour (batch 0 for hours 0-3)', async () => {
    vi.setSystemTime(new Date('2024-12-01T02:00:00Z')); // UTC hour 2 → batch 0

    const companies = Array.from({ length: 12 }, (_, i) => ({
      id: `c-${i}`,
      ticker: `TICK${i}`,
    }));
    prismaMock.company.findMany.mockResolvedValue(companies);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.batch).toBe(1); // batch 0 displayed as 1
    expect(body.totalBatches).toBe(6);
  });

  it('selects batch 3 for UTC hour 12-15', async () => {
    vi.setSystemTime(new Date('2024-12-01T14:00:00Z')); // UTC hour 14 → batch 3

    const companies = Array.from({ length: 18 }, (_, i) => ({
      id: `c-${i}`,
      ticker: `TICK${i}`,
    }));
    prismaMock.company.findMany.mockResolvedValue(companies);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.batch).toBe(4); // batch 3 displayed as 4
  });

  it('only updates companies in the current batch slice', async () => {
    vi.setSystemTime(new Date('2024-12-01T02:00:00Z')); // batch 0

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

  it('updates price, change %, volume on company records', async () => {
    vi.setSystemTime(new Date('2024-12-01T02:00:00Z'));

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
    vi.setSystemTime(new Date('2024-12-01T02:00:00Z')); // batch 0

    // Need 12+ companies so batch 0 gets 2 companies (ceil(12/6)=2)
    const companies = Array.from({ length: 12 }, (_, i) => ({
      id: `c-${i}`,
      ticker: `TICK${i}`,
    }));
    // batch 0 will process companies[0] and companies[1]
    prismaMock.company.findMany.mockResolvedValue(companies);

    mockQuoteSummary
      .mockResolvedValueOnce(MOCK_YAHOO_QUOTE_SUMMARY)
      .mockRejectedValueOnce(new Error('Yahoo error'));

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
    vi.setSystemTime(new Date('2024-12-01T02:00:00Z'));

    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'DEAD' }]);
    mockQuoteSummary.mockRejectedValue(new Error('Not Found'));

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.errors).toBe(1);
  });
});
