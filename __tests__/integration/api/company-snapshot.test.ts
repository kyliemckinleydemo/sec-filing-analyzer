/**
 * @module company-snapshot.test
 * @description Unit tests for the company snapshot API endpoint that aggregates
 * comprehensive company data including live market data, price history, filings,
 * and analyst activity.
 *
 * PURPOSE:
 * - Validates the GET /api/company/[ticker]/snapshot endpoint behavior
 * - Tests integration between Yahoo Finance API and database fallback data
 * - Ensures proper error handling for invalid/untracked tickers
 * - Verifies live data fetching and caching mechanisms
 * - Tests data aggregation from multiple sources (quote, chart, financials)
 * - Validates price history retrieval for both stock and S&P 500 index
 * - Ensures proper fallback to database when external APIs fail
 *
 * EXPORTS:
 * - Test suite: GET /api/company/[ticker]/snapshot
 *   - 404 response for untracked companies
 *   - Live data retrieval from Yahoo Finance
 *   - Database fallback when Yahoo Finance fails
 *   - S&P 500 historical data inclusion
 *   - Database fallback for price history (StockPrice, MacroIndicators)
 *   - SEC filings inclusion in response
 *   - Empty ticker validation
 *
 * CLAUDE NOTES:
 * - All Yahoo Finance calls go through Promise.allSettled for resilience
 * - Uses vi.hoisted() to properly mock the Yahoo Finance singleton
 * - Cache is cleared between tests to ensure isolation
 * - Mock data includes BigInt values for volume (matches Prisma schema)
 * - Tests both happy path (Yahoo data) and fallback path (DB data)
 * - Yahoo Finance dividendYield is returned as percentage (13.0 = 13%)
 * - Rate limiting middleware is mocked to allow all requests
 * - RSS parser is mocked to return empty news items by default
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../mocks/prisma';
import { cache } from '@/lib/cache';

// Mock dependencies before importing the route
vi.mock('@/lib/api-middleware', () => ({
  requireUnauthRateLimit: vi.fn().mockResolvedValue({ allowed: true, session: null }),
  addRateLimitHeaders: vi.fn().mockImplementation((res) => res),
}));

vi.mock('@/lib/rate-limit', () => ({
  generateFingerprint: vi.fn().mockReturnValue('test-fingerprint'),
  checkUnauthRateLimit: vi.fn().mockReturnValue({ limit: 20, remaining: 19, resetAt: Date.now() + 86400000 }),
}));

// Mock Yahoo Finance singleton - all calls go through Promise.allSettled
const { mockQuote, mockChart, mockQuoteSummary } = vi.hoisted(() => ({
  mockQuote: vi.fn(),
  mockChart: vi.fn(),
  mockQuoteSummary: vi.fn(),
}));
vi.mock('@/lib/yahoo-finance-singleton', () => ({
  default: {
    quote: mockQuote,
    chart: mockChart,
    quoteSummary: mockQuoteSummary,
  },
}));

// Mock rss-parser
vi.mock('rss-parser', () => ({
  default: vi.fn().mockImplementation(() => ({
    parseURL: vi.fn().mockResolvedValue({ items: [] }),
  })),
}));

import { GET } from '@/app/api/company/[ticker]/snapshot/route';
import { NextRequest } from 'next/server';

function makeRequest(ticker: string) {
  return new NextRequest(`http://localhost:3000/api/company/${ticker}/snapshot`);
}

const MOCK_COMPANY = {
  id: 'company-fmc',
  ticker: 'FMC',
  name: 'FMC CORP',
  cik: '0000037785',
  sector: 'Basic Materials',
  industry: 'Agricultural Chemicals',
  currentPrice: 14.43,
  marketCap: 1_800_000_000,
  peRatio: null,
  forwardPE: 5.68,
  fiftyTwoWeekHigh: 57,
  fiftyTwoWeekLow: 12.17,
  analystTargetPrice: 21.38,
  dividendYield: 0.13,
  beta: 0.66,
  volume: BigInt(2_000_000),
  averageVolume: BigInt(5_000_000),
  analystRating: null,
  analystRatingCount: null,
  earningsDate: null,
  latestRevenue: 1_000_000_000,
  latestRevenueYoY: 5.2,
  latestNetIncome: 100_000_000,
  latestNetIncomeYoY: -3.1,
  latestEPS: 0.82,
  latestEPSYoY: -2.5,
  latestGrossMargin: 45.2,
  latestOperatingMargin: 12.1,
  latestQuarter: 'Q3 2025',
  yahooFinanceData: null,
  yahooLastUpdated: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  filings: [
    {
      accessionNumber: '0000037785-26-000036',
      filingType: '8-K',
      filingDate: new Date('2026-02-04'),
      concernLevel: null,
      predicted7dReturn: null,
      predictionConfidence: null,
    },
    {
      accessionNumber: '0000037785-25-000134',
      filingType: '10-Q',
      filingDate: new Date('2025-10-30'),
      concernLevel: 5.5,
      predicted7dReturn: null,
      predictionConfidence: 0.85,
    },
  ],
};

const MOCK_YAHOO_QUOTE = {
  symbol: 'FMC',
  shortName: 'FMC CORP',
  regularMarketPrice: 15.0,
  regularMarketPreviousClose: 14.8,
  marketCap: 1_900_000_000,
  regularMarketVolume: 3_000_000,
  averageDailyVolume10Day: 5_000_000,
  fiftyTwoWeekHigh: 57.0,
  fiftyTwoWeekLow: 12.17,
  trailingPE: 18.5,
  dividendYield: 13.0, // Yahoo returns as percentage (13.0 = 13%)
  beta: 0.66,
};

describe('GET /api/company/[ticker]/snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.clear(); // Clear snapshot cache between tests
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    mockQuote.mockReset();
    mockChart.mockReset();
    mockQuoteSummary.mockReset();
    mockQuote.mockResolvedValue(null);
    mockChart.mockResolvedValue({ quotes: [] });
    mockQuoteSummary.mockResolvedValue({ financialData: { targetMeanPrice: 22.0 } });
  });

  it('returns 404 when company is not tracked', async () => {
    prismaMock.company.findUnique.mockResolvedValue(null);

    const res = await GET(makeRequest('ZZZZZ'), {
      params: Promise.resolve({ ticker: 'ZZZZZ' }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("don't track");
  });

  it('returns live data from Yahoo Finance when available', async () => {
    prismaMock.company.findUnique.mockResolvedValue(MOCK_COMPANY);
    prismaMock.stockPrice.findMany.mockResolvedValue([]);
    prismaMock.macroIndicators.findMany.mockResolvedValue([]);

    mockQuote.mockResolvedValue(MOCK_YAHOO_QUOTE);
    mockChart.mockResolvedValue({ quotes: [] });
    mockQuoteSummary.mockResolvedValue({ financialData: { targetMeanPrice: 22.0 } });

    const res = await GET(makeRequest('FMC'), {
      params: Promise.resolve({ ticker: 'FMC' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.liveData.currentPrice).toBe(15.0);
    expect(body.liveData.marketCap).toBe(1_900_000_000);
    expect(body.liveData.peRatio).toBe(18.5);
    expect(body.liveData.analystTargetPrice).toBe(22.0);
    expect(body.company.ticker).toBe('FMC');
    expect(body.company.name).toBe('FMC CORP');
  });

  it('falls back to DB data when Yahoo Finance fails completely', async () => {
    prismaMock.company.findUnique.mockResolvedValue(MOCK_COMPANY);
    prismaMock.stockPrice.findMany.mockResolvedValue([]);
    prismaMock.macroIndicators.findMany.mockResolvedValue([]);

    // All Yahoo Finance calls return null/empty
    mockQuote.mockResolvedValue(null);
    mockChart.mockResolvedValue({ quotes: [] });

    const res = await GET(makeRequest('FMC'), {
      params: Promise.resolve({ ticker: 'FMC' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Should fall back to DB values
    expect(body.liveData.currentPrice).toBe(14.43);
    expect(body.liveData.marketCap).toBe(1_800_000_000);
    expect(body.liveData.beta).toBe(0.66);
    expect(body.liveData.fiftyTwoWeekHigh).toBe(57);
    expect(body.liveData.volume).toBe(2_000_000);
  });

  it('returns spxHistory in the response', async () => {
    prismaMock.company.findUnique.mockResolvedValue(MOCK_COMPANY);
    prismaMock.stockPrice.findMany.mockResolvedValue([]);
    prismaMock.macroIndicators.findMany.mockResolvedValue([]);

    mockQuote.mockResolvedValue(MOCK_YAHOO_QUOTE);
    mockQuoteSummary.mockResolvedValue({ financialData: { targetMeanPrice: 22.0 } });

    // Stock chart (first call) then S&P 500 chart (second call)
    mockChart
      .mockResolvedValueOnce({
        quotes: [
          { date: new Date('2025-09-02'), open: 30.5, high: 32, low: 30, close: 31, volume: 1100000 },
          { date: new Date('2025-09-01'), open: 29.5, high: 31, low: 29, close: 30, volume: 1000000 },
        ],
      })
      .mockResolvedValueOnce({
        quotes: [
          { date: new Date('2025-09-02'), open: 5530, high: 5560, low: 5530, close: 5550, volume: 3100000000 },
          { date: new Date('2025-09-01'), open: 5480, high: 5520, low: 5480, close: 5500, volume: 3000000000 },
        ],
      });

    const res = await GET(makeRequest('FMC'), {
      params: Promise.resolve({ ticker: 'FMC' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.priceHistory).toHaveLength(2);
    expect(body.priceHistory[0].price).toBe(30);
    expect(body.spxHistory).toHaveLength(2);
    expect(body.spxHistory[0].price).toBe(5500);
  });

  it('falls back to StockPrice and MacroIndicators DB tables for price history', async () => {
    prismaMock.company.findUnique.mockResolvedValue(MOCK_COMPANY);

    // Yahoo Finance returns no data
    mockQuote.mockResolvedValue(null);
    mockChart.mockResolvedValue({ quotes: [] });

    // DB fallback data
    prismaMock.stockPrice.findMany.mockResolvedValue([
      { ticker: 'FMC', date: new Date('2025-10-01'), close: 28.5, high: 29, low: 28, volume: BigInt(900000) },
      { ticker: 'FMC', date: new Date('2025-10-02'), close: 29.0, high: 30, low: 28.5, volume: BigInt(950000) },
    ]);
    prismaMock.macroIndicators.findMany.mockResolvedValue([
      { date: new Date('2025-10-01'), spxClose: 5400 },
      { date: new Date('2025-10-02'), spxClose: 5450 },
    ]);

    const res = await GET(makeRequest('FMC'), {
      params: Promise.resolve({ ticker: 'FMC' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.priceHistory).toHaveLength(2);
    expect(body.priceHistory[0].price).toBe(28.5);
    expect(body.spxHistory).toHaveLength(2);
    expect(body.spxHistory[0].price).toBe(5400);
  });

  it('includes filings in the response', async () => {
    prismaMock.company.findUnique.mockResolvedValue(MOCK_COMPANY);
    prismaMock.stockPrice.findMany.mockResolvedValue([]);
    prismaMock.macroIndicators.findMany.mockResolvedValue([]);
    mockQuote.mockResolvedValue(MOCK_YAHOO_QUOTE);
    mockChart.mockResolvedValue({ quotes: [] });
    mockQuoteSummary.mockResolvedValue({ financialData: { targetMeanPrice: 22.0 } });

    const res = await GET(makeRequest('FMC'), {
      params: Promise.resolve({ ticker: 'FMC' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.filings).toHaveLength(2);
    expect(body.filings[0].filingType).toBe('8-K');
    expect(body.filings[1].concernLevel).toBe(5.5);
  });

  it('returns 400 for empty ticker', async () => {
    const res = await GET(makeRequest(''), {
      params: Promise.resolve({ ticker: '' }),
    });

    expect(res.status).toBe(400);
  });
});
