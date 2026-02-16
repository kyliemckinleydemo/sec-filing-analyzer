import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../../mocks/prisma';
import { MOCK_COMPANY_AAPL_FULL, MOCK_COMPANY_MSFT_FULL, MOCK_YAHOO_QUOTE_SUMMARY } from '../../../fixtures/cron-data';

const { mockQuoteSummary } = vi.hoisted(() => ({
  mockQuoteSummary: vi.fn(),
}));
vi.mock('yahoo-finance2', () => ({
  default: {
    quoteSummary: mockQuoteSummary,
    suppressNotices: vi.fn(),
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
    mockQuoteSummary.mockResolvedValue(MOCK_YAHOO_QUOTE_SUMMARY);
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

  it('updates company records with current price, change, volume', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'AAPL' }]);

    await GET(makeAuthRequest());

    expect(prismaMock.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          currentPrice: 195.0,
          marketCap: 3_000_000_000_000,
          peRatio: 31.5,
          forwardPE: 28.2,
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

  it('handles yahoo-finance2 errors per-ticker', async () => {
    prismaMock.company.findMany.mockResolvedValue([
      { id: 'c1', ticker: 'AAPL' },
      { id: 'c2', ticker: 'MSFT' },
    ]);

    mockQuoteSummary
      .mockRejectedValueOnce(new Error('Yahoo API error'))
      .mockResolvedValueOnce(MOCK_YAHOO_QUOTE_SUMMARY);

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

  it('skips companies with no quote data', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'AAPL' }]);
    mockQuoteSummary.mockResolvedValue({
      price: null,
      summaryDetail: null,
      financialData: null,
    });

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
    mockQuoteSummary.mockRejectedValue(new Error('Not Found (404)'));

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results.errors).toBe(1);
  });
});
