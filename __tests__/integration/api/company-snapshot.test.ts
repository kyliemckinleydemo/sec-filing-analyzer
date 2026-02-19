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

// Mock FMP client - all calls go through Promise.allSettled
const { mockGetProfile, mockGetHistoricalPrices } = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
  mockGetHistoricalPrices: vi.fn(),
}));
vi.mock('@/lib/fmp-client', () => ({
  default: {
    getProfile: mockGetProfile,
    getHistoricalPrices: mockGetHistoricalPrices,
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

const MOCK_FMP_PROFILE = {
  symbol: 'FMC',
  companyName: 'FMC CORP',
  price: 15.0,
  mktCap: 1_900_000_000,
  beta: 0.66,
  volAvg: 5_000_000,
  volume: 3_000_000,
  lastDiv: 1.95,
  range: '12.17-57.00',
  sector: 'Basic Materials',
  industry: 'Agricultural Chemicals',
  exchangeShortName: 'NYSE',
  currency: 'USD',
  pe: 18.5,
  targetMeanPrice: 22.0,
  dividendYield: 0.13,
  previousClose: 14.8,
};

describe('GET /api/company/[ticker]/snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.clear(); // Clear snapshot cache between tests
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    mockGetProfile.mockReset();
    mockGetHistoricalPrices.mockReset();
    mockGetProfile.mockResolvedValue(null);
    mockGetHistoricalPrices.mockResolvedValue([]);
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

  it('returns live data from FMP when available', async () => {
    prismaMock.company.findUnique.mockResolvedValue(MOCK_COMPANY);
    prismaMock.stockPrice.findMany.mockResolvedValue([]);
    prismaMock.macroIndicators.findMany.mockResolvedValue([]);

    mockGetProfile.mockResolvedValue(MOCK_FMP_PROFILE);
    mockGetHistoricalPrices.mockResolvedValue([]);

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

  it('falls back to DB data when FMP fails completely', async () => {
    prismaMock.company.findUnique.mockResolvedValue(MOCK_COMPANY);
    prismaMock.stockPrice.findMany.mockResolvedValue([]);
    prismaMock.macroIndicators.findMany.mockResolvedValue([]);

    // All FMP calls return null/empty
    mockGetProfile.mockResolvedValue(null);
    mockGetHistoricalPrices.mockResolvedValue([]);

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

    mockGetProfile.mockResolvedValue(MOCK_FMP_PROFILE);

    // Stock historical (first call)
    mockGetHistoricalPrices
      .mockResolvedValueOnce([
        { date: '2025-09-02', open: 30.5, high: 32, low: 30, close: 31, volume: 1100000 },
        { date: '2025-09-01', open: 29.5, high: 31, low: 29, close: 30, volume: 1000000 },
      ])
      // S&P 500 historical (second call)
      .mockResolvedValueOnce([
        { date: '2025-09-02', open: 5530, high: 5560, low: 5530, close: 5550, volume: 3100000000 },
        { date: '2025-09-01', open: 5480, high: 5520, low: 5480, close: 5500, volume: 3000000000 },
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

    // FMP returns no data
    mockGetProfile.mockResolvedValue(null);
    mockGetHistoricalPrices.mockResolvedValue([]);

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
    mockGetProfile.mockResolvedValue(MOCK_FMP_PROFILE);
    mockGetHistoricalPrices.mockResolvedValue([]);

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
