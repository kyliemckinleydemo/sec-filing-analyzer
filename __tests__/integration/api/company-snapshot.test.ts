import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../mocks/prisma';

// Mock dependencies before importing the route
vi.mock('@/lib/api-middleware', () => ({
  requireUnauthRateLimit: vi.fn().mockResolvedValue({ allowed: true, session: null }),
  addRateLimitHeaders: vi.fn().mockImplementation((res) => res),
}));

vi.mock('@/lib/rate-limit', () => ({
  generateFingerprint: vi.fn().mockReturnValue('test-fingerprint'),
  checkUnauthRateLimit: vi.fn().mockReturnValue({ limit: 20, remaining: 19, resetAt: Date.now() + 86400000 }),
}));

// Mock yahoo-finance2 - all calls go through Promise.allSettled
vi.mock('yahoo-finance2', () => ({
  default: {
    quote: vi.fn(),
    quoteSummary: vi.fn(),
    historical: vi.fn(),
    search: vi.fn(),
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
import yahooFinance from 'yahoo-finance2';

const yahooMock = vi.mocked(yahooFinance);

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

describe('GET /api/company/[ticker]/snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
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

    yahooMock.quote.mockResolvedValue({
      regularMarketPrice: 15.0,
      regularMarketPreviousClose: 14.8,
      marketCap: 1_900_000_000,
      regularMarketVolume: 3_000_000,
      fiftyTwoWeekHigh: 57,
      fiftyTwoWeekLow: 12.17,
    } as any);

    yahooMock.quoteSummary.mockResolvedValue({
      summaryDetail: { trailingPE: 18.5, forwardPE: 5.68, dividendYield: 0.13, beta: 0.66 },
      financialData: { targetMeanPrice: 22.0, profitMargins: 0.1, revenueGrowth: 0.05 },
      recommendationTrend: { trend: [{ strongBuy: 2, buy: 5, hold: 8, sell: 1, strongSell: 0 }] },
    } as any);

    yahooMock.historical.mockResolvedValue([]);

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

    // All Yahoo Finance calls fail
    yahooMock.quote.mockRejectedValue(new Error('Too Many Requests'));
    yahooMock.quoteSummary.mockRejectedValue(new Error('Too Many Requests'));
    yahooMock.historical.mockRejectedValue(new Error('Too Many Requests'));

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

  it('uses partial Yahoo data when some calls fail (allSettled resilience)', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      ...MOCK_COMPANY,
      currentPrice: null, // No DB fallback data either, to test partial Yahoo
    });
    prismaMock.stockPrice.findMany.mockResolvedValue([]);
    prismaMock.macroIndicators.findMany.mockResolvedValue([]);

    // Quote succeeds, summary fails, historical fails
    yahooMock.quote.mockResolvedValue({
      regularMarketPrice: 15.5,
      regularMarketPreviousClose: 15.0,
      marketCap: 1_950_000_000,
      regularMarketVolume: 2_500_000,
      fiftyTwoWeekHigh: 57,
      fiftyTwoWeekLow: 12.17,
    } as any);
    yahooMock.quoteSummary.mockRejectedValue(new Error('Too Many Requests'));
    yahooMock.historical.mockRejectedValue(new Error('Too Many Requests'));

    const res = await GET(makeRequest('FMC'), {
      params: Promise.resolve({ ticker: 'FMC' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Quote data should be present
    expect(body.liveData.currentPrice).toBe(15.5);
    expect(body.liveData.marketCap).toBe(1_950_000_000);
    // Summary data should be absent (not from DB fallback since quote succeeded)
    expect(body.liveData.peRatio).toBeUndefined();
  });

  it('returns spxHistory in the response', async () => {
    prismaMock.company.findUnique.mockResolvedValue(MOCK_COMPANY);
    prismaMock.stockPrice.findMany.mockResolvedValue([]);
    prismaMock.macroIndicators.findMany.mockResolvedValue([]);

    yahooMock.quote.mockResolvedValue({ regularMarketPrice: 15.0 } as any);
    yahooMock.quoteSummary.mockResolvedValue({} as any);

    // Stock historical
    yahooMock.historical.mockResolvedValueOnce([
      { date: new Date('2025-09-01'), close: 30, high: 31, low: 29, volume: 1000000 },
      { date: new Date('2025-09-02'), close: 31, high: 32, low: 30, volume: 1100000 },
    ]);
    // S&P 500 historical
    yahooMock.historical.mockResolvedValueOnce([
      { date: new Date('2025-09-01'), close: 5500, high: 5520, low: 5480, volume: 3000000000 },
      { date: new Date('2025-09-02'), close: 5550, high: 5560, low: 5530, volume: 3100000000 },
    ]);

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

    // Yahoo Finance completely fails
    yahooMock.quote.mockRejectedValue(new Error('Timeout'));
    yahooMock.quoteSummary.mockRejectedValue(new Error('Timeout'));
    yahooMock.historical.mockRejectedValue(new Error('Timeout'));

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
    yahooMock.quote.mockResolvedValue({ regularMarketPrice: 15 } as any);
    yahooMock.quoteSummary.mockResolvedValue({} as any);
    yahooMock.historical.mockResolvedValue([]);

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
