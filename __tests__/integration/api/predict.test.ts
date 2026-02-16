import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../mocks/prisma';
import { MOCK_FILING_WITH_COMPANY, MOCK_FILING_WITH_CACHED_PREDICTION, MOCK_FILING_NO_COMPANY_DATA } from '../../fixtures/filing-data';

// Mock dependencies before importing the route
vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue(null),
  createSessionToken: vi.fn(),
  verifySessionToken: vi.fn(),
  generateMagicLinkToken: vi.fn(),
}));

vi.mock('@/lib/api-middleware', () => ({
  requireUnauthRateLimit: vi.fn().mockResolvedValue({ allowed: true, session: null }),
}));

vi.mock('@/lib/accuracy-tracker', () => ({
  accuracyTracker: {
    checkAccuracy: vi.fn().mockResolvedValue(null),
    updateActualReturn: vi.fn(),
    checkAlphaAccuracy: vi.fn().mockResolvedValue(null),
    updateActual30dAlpha: vi.fn(),
  },
}));

vi.mock('@/lib/predictions', () => ({
  predictionEngine: {
    predict: vi.fn().mockResolvedValue({
      predicted7dReturn: 0.5,
      confidence: 0.55,
      factors: [],
    }),
  },
}));

vi.mock('@/lib/paper-trading', () => ({
  PaperTradingEngine: vi.fn().mockImplementation(() => ({
    evaluateTradeSignal: vi.fn().mockResolvedValue(false),
    executeTrade: vi.fn(),
  })),
}));

// Import the route handler after mocks are set up
import { GET } from '@/app/api/predict/[accession]/route';
import { NextRequest } from 'next/server';

function makeRequest(accession: string) {
  return new NextRequest(`http://localhost:3000/api/predict/${accession}`);
}

describe('GET /api/predict/[accession]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.paperPortfolio.findFirst.mockResolvedValue(null);
  });

  it('returns 404 when filing not found', async () => {
    prismaMock.filing.findUnique.mockResolvedValue(null);

    const res = await GET(makeRequest('0001193125-24-999999'), {
      params: Promise.resolve({ accession: '0001193125-24-999999' }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Filing not found');
  });

  it('generates alpha prediction for filing with company data', async () => {
    prismaMock.filing.findUnique.mockResolvedValue(MOCK_FILING_WITH_COMPANY);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.filing.update.mockResolvedValue({});
    prismaMock.prediction.create.mockResolvedValue({});

    const res = await GET(makeRequest('0001193125-24-012345'), {
      params: Promise.resolve({ accession: '0001193125-24-012345' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.prediction).toBeDefined();
    expect(body.prediction.signal).toMatch(/^(LONG|SHORT|NEUTRAL)$/);
    expect(body.prediction.confidence).toMatch(/^(high|medium|low)$/);
    expect(typeof body.prediction.expectedAlpha).toBe('number');
    expect(body.prediction.modelVersion).toBe('alpha-v1.0');
    expect(body.filing.company).toBe('AAPL');
  });

  it('returns cached prediction when predicted30dAlpha already exists', async () => {
    prismaMock.filing.findUnique.mockResolvedValue(MOCK_FILING_WITH_CACHED_PREDICTION);
    prismaMock.prediction.findFirst.mockResolvedValue({
      features: JSON.stringify({ priceToLow: 0.5, majorDowngrades: 0.2 }),
    });

    const res = await GET(makeRequest('0001193125-24-023456'), {
      params: Promise.resolve({ accession: '0001193125-24-023456' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.prediction.expectedAlpha).toBe(2.5);
    expect(body.prediction.predicted30dReturn).toBe(3.3);
    expect(body.prediction.modelVersion).toBe('alpha-v1.0');

    // Should NOT have written to the DB (cached)
    expect(prismaMock.filing.update).not.toHaveBeenCalled();
    expect(prismaMock.prediction.create).not.toHaveBeenCalled();
  });

  it('normalizes accession number by adding dashes', async () => {
    prismaMock.filing.findUnique.mockResolvedValue(MOCK_FILING_WITH_COMPANY);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.filing.update.mockResolvedValue({});
    prismaMock.prediction.create.mockResolvedValue({});

    // Pass accession without dashes
    await GET(makeRequest('000119312524012345'), {
      params: Promise.resolve({ accession: '000119312524012345' }),
    });

    // The prisma query should use the normalized (dashed) format
    expect(prismaMock.filing.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accessionNumber: '0001193125-24-012345' },
      })
    );
  });

  it('stores prediction in DB after generation', async () => {
    prismaMock.filing.findUnique.mockResolvedValue(MOCK_FILING_WITH_COMPANY);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.filing.update.mockResolvedValue({});
    prismaMock.prediction.create.mockResolvedValue({});

    await GET(makeRequest('0001193125-24-012345'), {
      params: Promise.resolve({ accession: '0001193125-24-012345' }),
    });

    expect(prismaMock.filing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accessionNumber: '0001193125-24-012345' },
        data: expect.objectContaining({
          predicted30dReturn: expect.any(Number),
          predicted30dAlpha: expect.any(Number),
          predictionConfidence: expect.any(Number),
        }),
      })
    );

    expect(prismaMock.prediction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filingId: 'filing-001',
          modelVersion: 'alpha-v1.0',
          predictedReturn: expect.any(Number),
          confidence: expect.any(Number),
        }),
      })
    );
  });

  it('falls back to legacy prediction engine when company data insufficient', async () => {
    prismaMock.filing.findUnique.mockResolvedValue(MOCK_FILING_NO_COMPANY_DATA);
    prismaMock.analystActivity.findMany.mockResolvedValue([]);
    prismaMock.filing.update.mockResolvedValue({});
    prismaMock.prediction.create.mockResolvedValue({});

    const { predictionEngine } = await import('@/lib/predictions');

    const res = await GET(makeRequest('0001193125-24-034567'), {
      params: Promise.resolve({ accession: '0001193125-24-034567' }),
    });

    expect(res.status).toBe(200);
    expect(predictionEngine.predict).toHaveBeenCalled();
  });
});
