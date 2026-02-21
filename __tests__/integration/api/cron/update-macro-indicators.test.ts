/**
 * @module update-macro-indicators.test
 * @description Test suite for the update-macro-indicators cron job API endpoint
 *
 * PURPOSE:
 * - Validates authentication and authorization for the macro indicators cron job
 * - Tests fetching and calculation of market data (SPX, VIX, sector ETFs)
 * - Tests integration with FRED API for treasury rates and yield curve data
 * - Tests integration with FMP API for historical price and profile data
 * - Verifies database persistence of macro indicators with treasury fields
 * - Tests error handling for external API failures (FRED, FMP)
 * - Validates cron job tracking lifecycle (create, update, cleanup)
 * - Tests calculation of derived metrics (30-day treasury rate changes, returns)
 *
 * EXPORTS:
 * - Test suite: 'GET /api/cron/update-macro-indicators'
 * - Helper function: makeRequest() - Creates NextRequest with optional headers
 * - Helper function: makeAuthRequest() - Creates authenticated NextRequest
 * - Helper function: makeMockHistory() - Generates mock historical price data
 * - Mock data: MOCK_TREASURY_RATES - Current treasury rate fixture
 * - Mock data: MOCK_TREASURY_RATES_30D_AGO - Historical treasury rate fixture
 *
 * CLAUDE NOTES:
 * - Uses vi.hoisted() to ensure mocks are initialized before imports
 * - Mocks both @/lib/fmp-client and @/lib/fred-client for isolated testing
 * - Tests parallel data fetching from multiple external APIs
 * - Validates graceful degradation when external APIs fail
 * - Tests both complete failures and partial failures (e.g., today succeeds, 30d-ago fails)
 * - Covers edge cases: missing data, rate limiting, DB write failures
 * - Verifies job tracking cleanup of stuck jobs from previous runs
 * - Tests processing of 2 dates (today + yesterday) as per route implementation
 * - Mock history generator creates 45 days of data for return calculations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../../mocks/prisma';
import { MOCK_FMP_HISTORICAL_PRICES, MOCK_FMP_PROFILE } from '../../../fixtures/cron-data';

// Mock FMP client
const { mockGetProfile, mockGetHistoricalPrices } = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
  mockGetHistoricalPrices: vi.fn(),
}));
vi.mock('@/lib/fmp-client', () => ({
  default: {
    getProfile: mockGetProfile,
    getHistoricalPrices: mockGetHistoricalPrices,
  },
}));

// Mock FRED client
const { mockGetTreasuryRates } = vi.hoisted(() => ({
  mockGetTreasuryRates: vi.fn(),
}));
vi.mock('@/lib/fred-client', () => ({
  default: {
    getTreasuryRates: mockGetTreasuryRates,
  },
  getTreasuryRates: mockGetTreasuryRates,
}));

import { GET } from '@/app/api/cron/update-macro-indicators/route';
import { NextRequest } from 'next/server';

const CRON_URL = 'http://localhost:3000/api/cron/update-macro-indicators';

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest(CRON_URL, { headers });
}

function makeAuthRequest() {
  return makeRequest({ authorization: 'Bearer test-cron-secret' });
}

// Generate 45 days of mock historical prices
function makeMockHistory(ticker: string, latestClose: number) {
  const prices = [];
  const today = new Date();
  for (let i = 0; i < 45; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const close = latestClose * (1 - i * 0.001); // Slight daily decline for calculating returns
    prices.push({
      date: date.toISOString().split('T')[0],
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000000,
    });
  }
  return prices;
}

const MOCK_TREASURY_RATES = {
  fedFundsRate: 4.33,
  treasury3m: 4.28,
  treasury2y: 4.12,
  treasury10y: 4.50,
  yieldCurve2y10y: 0.38,
};

const MOCK_TREASURY_RATES_30D_AGO = {
  fedFundsRate: 4.33,
  treasury3m: 4.25,
  treasury2y: 4.08,
  treasury10y: 4.40,
  yieldCurve2y10y: 0.32,
};

describe('GET /api/cron/update-macro-indicators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default job tracking mocks
    prismaMock.cronJobRun.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.cronJobRun.create.mockResolvedValue({
      id: 'job-001',
      jobName: 'update-macro-indicators',
      status: 'running',
    });
    prismaMock.cronJobRun.update.mockResolvedValue({});
    prismaMock.macroIndicators.upsert.mockResolvedValue({});

    // Default FMP mocks
    mockGetHistoricalPrices.mockResolvedValue(makeMockHistory('SPY', 5500));
    mockGetProfile.mockResolvedValue({ ...MOCK_FMP_PROFILE, price: 14.5 }); // VIXY price

    // Default FRED mocks
    mockGetTreasuryRates
      .mockResolvedValueOnce(MOCK_TREASURY_RATES)       // today
      .mockResolvedValueOnce(MOCK_TREASURY_RATES_30D_AGO); // 30 days ago
  });

  // --- Auth ---

  it('returns 401 without CRON_SECRET', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 with wrong auth header', async () => {
    const res = await GET(makeRequest({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('accepts vercel-cron user agent', async () => {
    const res = await GET(makeRequest({ 'user-agent': 'vercel-cron/1.0' }));
    expect(res.status).toBe(200);
  });

  // --- Success cases ---

  it('returns 200 with macro data including treasury rates', async () => {
    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results).toHaveLength(2); // today + yesterday
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].spxClose).toBeDefined();
    expect(body.results[0].vixClose).toBeDefined();
  });

  it('stores macro indicators in database with treasury fields', async () => {
    await GET(makeAuthRequest());

    // Should upsert for both today and yesterday
    expect(prismaMock.macroIndicators.upsert).toHaveBeenCalledTimes(2);

    // Check the first call includes treasury data
    const firstCall = prismaMock.macroIndicators.upsert.mock.calls[0][0];
    expect(firstCall.create.fedFundsRate).toBe(4.33);
    expect(firstCall.create.treasury3m).toBe(4.28);
    expect(firstCall.create.treasury2y).toBe(4.12);
    expect(firstCall.create.treasury10y).toBe(4.50);
    expect(firstCall.create.yieldCurve2y10y).toBe(0.38);
  });

  it('calculates treasury10yChange30d from current and 30d-ago rates', async () => {
    await GET(makeAuthRequest());

    const firstCall = prismaMock.macroIndicators.upsert.mock.calls[0][0];
    // 4.50 - 4.40 = 0.10
    expect(firstCall.create.treasury10yChange30d).toBe(0.1);
  });

  it('fetches FRED data in parallel with FMP data', async () => {
    await GET(makeAuthRequest());

    // FRED should be called twice (today + 30d ago)
    expect(mockGetTreasuryRates).toHaveBeenCalledTimes(2);
    // FMP getHistoricalPrices should be called for SPY + VIXY + 4 sector ETFs
    expect(mockGetHistoricalPrices).toHaveBeenCalled();
    // FMP getProfile should be called for VIXY
    expect(mockGetProfile).toHaveBeenCalled();
  });

  // --- FRED failure handling ---

  it('stores null treasury values when FRED fails', async () => {
    mockGetTreasuryRates
      .mockReset()
      .mockRejectedValueOnce(new Error('FRED API down'))
      .mockRejectedValueOnce(new Error('FRED API down'));

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);

    // Treasury fields should be null
    const firstCall = prismaMock.macroIndicators.upsert.mock.calls[0][0];
    expect(firstCall.create.fedFundsRate).toBeNull();
    expect(firstCall.create.treasury10y).toBeNull();
    expect(firstCall.create.yieldCurve2y10y).toBeNull();
    expect(firstCall.create.treasury10yChange30d).toBeNull();
  });

  it('handles partial FRED failure (today succeeds, 30d-ago fails)', async () => {
    mockGetTreasuryRates
      .mockReset()
      .mockResolvedValueOnce(MOCK_TREASURY_RATES)
      .mockRejectedValueOnce(new Error('FRED timeout'));

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);

    const firstCall = prismaMock.macroIndicators.upsert.mock.calls[0][0];
    // Today's rates should be populated
    expect(firstCall.create.treasury10y).toBe(4.50);
    // But 30d change should be null (can't calculate without 30d-ago data)
    expect(firstCall.create.treasury10yChange30d).toBeNull();
  });

  // --- FMP failure handling ---

  it('handles FMP historical prices failure gracefully', async () => {
    mockGetHistoricalPrices.mockResolvedValue([]);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    // SPX close should be null when no data
    expect(body.results[0].spxClose).toBeNull();
  });

  it('handles VIX profile failure gracefully', async () => {
    mockGetProfile.mockRejectedValue(new Error('FMP rate limited'));

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results[0].vixClose).toBeNull();
  });

  // --- Job tracking ---

  it('creates and completes cronJobRun record', async () => {
    await GET(makeAuthRequest());

    expect(prismaMock.cronJobRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { jobName: 'update-macro-indicators', status: 'running' },
      })
    );
    expect(prismaMock.cronJobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'success' }),
      })
    );
  });

  it('handles per-date DB write failures gracefully', async () => {
    prismaMock.macroIndicators.upsert.mockRejectedValue(new Error('DB write failed'));

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    // Route still succeeds overall (per-date errors are caught individually)
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Both date results should show failure
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toBe('DB write failed');
  });

  it('marks job as failed when cronJobRun.update itself throws', async () => {
    // Make the final job update throw — triggers the outer catch
    prismaMock.cronJobRun.update
      .mockRejectedValueOnce(new Error('DB write failed on job update'))
      .mockResolvedValueOnce({}); // Allow the error handler's update to succeed

    const res = await GET(makeAuthRequest());
    expect(res.status).toBe(500);
  });

  it('cleans up stuck jobs before starting', async () => {
    await GET(makeAuthRequest());

    expect(prismaMock.cronJobRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jobName: 'update-macro-indicators',
          status: 'running',
        }),
      })
    );
  });

  // --- Sector ETFs ---

  it('fetches sector ETF data (XLK, XLF, XLE, XLV)', async () => {
    await GET(makeAuthRequest());

    const tickersCalled = mockGetHistoricalPrices.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(tickersCalled).toContain('SPY');
    expect(tickersCalled).toContain('VIXY');
    expect(tickersCalled).toContain('XLK');
    expect(tickersCalled).toContain('XLF');
    expect(tickersCalled).toContain('XLE');
    expect(tickersCalled).toContain('XLV');
  });
});
