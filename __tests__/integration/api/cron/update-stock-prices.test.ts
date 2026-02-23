/**
 * @module update-stock-prices.test
 * @description Test suite for the stock price update cron job API endpoint
 *
 * PURPOSE:
 * - Validates authentication and authorization for the cron endpoint
 * - Tests successful stock price updates from Yahoo Finance API
 * - Verifies correct data transformation and storage (price, volume, market cap, PE ratio, etc.)
 * - Ensures proper handling of missing data, API failures, and edge cases
 * - Validates error handling for delisted tickers and database errors
 *
 * EXPORTS:
 * - None (test file)
 *
 * CLAUDE NOTES:
 * - Uses Vitest mocking to stub Prisma client and Yahoo Finance API calls
 * - Tests cover authentication via Bearer token (CRON_SECRET)
 * - Validates BigInt conversion for volume field
 * - Tests percentage-to-ratio conversion for dividendYield (0.5% → 0.005)
 * - Verifies graceful degradation when quoteSummary fails (analystTargetPrice → null)
 * - Tests batch processing with per-ticker error isolation
 * - Validates 52-week high/low and analyst target price updates
 * - Mock fixtures imported from '../../../fixtures/cron-data'
 * - prismaMock imported from '../../../mocks/prisma'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../../mocks/prisma';
import { MOCK_YAHOO_QUOTE, MOCK_YAHOO_QUOTE_SUMMARY_FINANCIAL_DATA } from '../../../fixtures/cron-data';

const { mockQuote, mockQuoteSummary } = vi.hoisted(() => ({
  mockQuote: vi.fn(),
  mockQuoteSummary: vi.fn(),
}));
vi.mock('@/lib/yahoo-finance-singleton', () => ({
  default: {
    quote: mockQuote,
    quoteSummary: mockQuoteSummary,
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
    mockQuote.mockResolvedValue(MOCK_YAHOO_QUOTE);
    mockQuoteSummary.mockResolvedValue(MOCK_YAHOO_QUOTE_SUMMARY_FINANCIAL_DATA);
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

  it('updates 52-week high and low from Yahoo Finance quote', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'AAPL' }]);

    await GET(makeAuthRequest());

    expect(prismaMock.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fiftyTwoWeekHigh: 199.62,
          fiftyTwoWeekLow: 164.08,
        }),
      })
    );
  });

  it('updates analystTargetPrice from quoteSummary financialData', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'AAPL' }]);

    await GET(makeAuthRequest());

    expect(prismaMock.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          analystTargetPrice: 210.0,
        }),
      })
    );
  });

  it('sets analystTargetPrice to null when quoteSummary fails', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'AAPL' }]);
    mockQuoteSummary.mockRejectedValue(new Error('quoteSummary failed'));

    await GET(makeAuthRequest());

    expect(prismaMock.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          analystTargetPrice: null,
        }),
      })
    );
  });

  it('converts dividendYield from percentage to ratio', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'AAPL' }]);

    await GET(makeAuthRequest());

    expect(prismaMock.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dividendYield: 0.005, // 0.5% / 100 = 0.005
        }),
      })
    );
  });

  // --- Error handling ---

  it('handles Yahoo Finance errors per-ticker', async () => {
    prismaMock.company.findMany.mockResolvedValue([
      { id: 'c1', ticker: 'AAPL' },
      { id: 'c2', ticker: 'MSFT' },
    ]);

    mockQuote
      .mockRejectedValueOnce(new Error('Yahoo Finance API error'))
      .mockResolvedValueOnce(MOCK_YAHOO_QUOTE);

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
    mockQuote.mockResolvedValue(null);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.results.skipped).toBe(1);
    expect(body.results.updated).toBe(0);
  });

  it('skips companies with no regularMarketPrice', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', ticker: 'AAPL' }]);
    mockQuote.mockResolvedValue({ ...MOCK_YAHOO_QUOTE, regularMarketPrice: undefined });

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
    mockQuote.mockRejectedValue(new Error('Not Found (404)'));

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results.errors).toBe(1);
  });
});
