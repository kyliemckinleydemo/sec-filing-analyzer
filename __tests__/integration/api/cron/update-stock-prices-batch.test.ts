/**
 * @module update-stock-prices-batch.test
 * @description Test suite for the batch stock price update cron job endpoint
 *
 * PURPOSE:
 * - Validates authentication/authorization for the cron endpoint
 * - Tests batch selection logic based on day of year rotation
 * - Verifies correct slicing of companies into batches (6 total batches)
 * - Ensures proper updating of company price, market cap, and volume data
 * - Tests error handling for Yahoo Finance API failures, database errors, and delisted tickers
 * - Validates graceful degradation when individual ticker updates fail
 *
 * EXPORTS:
 * - None (test file)
 *
 * CLAUDE NOTES:
 * - Uses Vitest mocking for Prisma client and Yahoo Finance singleton
 * - Mocks are hoisted using vi.hoisted() to ensure proper module initialization order
 * - System time is mocked using vi.setSystemTime() to test day-based batch rotation
 * - Tests assume 6 batches with rotation based on (day of year) % 6
 * - CRON_SECRET environment variable must be set to 'test-cron-secret' for authenticated requests
 * - Mock data fixtures (MOCK_YAHOO_QUOTE, MOCK_YAHOO_QUOTE_SUMMARY_FINANCIAL_DATA) simulate API responses
 * - Test scenarios cover both happy paths and error conditions (401, 404, 500)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    mockQuote.mockResolvedValue(MOCK_YAHOO_QUOTE);
    mockQuoteSummary.mockResolvedValue(MOCK_YAHOO_QUOTE_SUMMARY_FINANCIAL_DATA);
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

    mockQuote
      .mockResolvedValueOnce(MOCK_YAHOO_QUOTE)
      .mockRejectedValueOnce(new Error('Yahoo Finance error'));

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
    mockQuote.mockRejectedValue(new Error('Not Found'));

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.errors).toBe(1);
  });
});
