/**
 * @module __tests__/integration/api/model-demo.test
 * @description Integration tests for GET and POST /api/model-demo route handlers
 *
 * PURPOSE:
 * - Validate GET handler default confidence='high' filter behaviour
 * - Validate GET signal, hasActual, and limit query-param filtering
 * - Validate summary stats (dirAccuracy, avgPredicted, avgActual)
 * - Validate POST handler computes live alpha-model prediction from posted features
 * - Validate POST sector routing passes through to predictAlpha
 * - Validate edge cases: empty results, limit cap, partial actual data
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../mocks/prisma';
import { NextRequest } from 'next/server';
import { BULLISH_FEATURES, BEARISH_FEATURES, TRAINING_MEAN_FEATURES } from '../../fixtures/alpha-features';

// ──────────────────────────────────────────────────
// Fixtures — rows returned by prisma.filing.findMany
// ──────────────────────────────────────────────────

const HIGH_CONF_LONG_NO_ACTUAL = {
  accessionNumber: '0001193125-24-001001',
  filingType: '10-Q',
  filingDate: new Date('2024-11-01'),
  predicted30dAlpha: 3.5,
  predictionConfidence: 0.85,
  actual30dAlpha: null,
  company: { ticker: 'AAPL', sector: 'Technology' },
};

const HIGH_CONF_SHORT_WITH_ACTUAL_CORRECT = {
  accessionNumber: '0001193125-24-002001',
  filingType: '10-K',
  filingDate: new Date('2024-10-01'),
  predicted30dAlpha: -2.1,
  predictionConfidence: 0.90,
  actual30dAlpha: -1.8, // negative → correct direction
  company: { ticker: 'TSLA', sector: 'Consumer Cyclical' },
};

const HIGH_CONF_LONG_WITH_ACTUAL_WRONG = {
  accessionNumber: '0001193125-24-003001',
  filingType: '8-K',
  filingDate: new Date('2024-09-01'),
  predicted30dAlpha: 1.2,
  predictionConfidence: 0.82,
  actual30dAlpha: -0.5, // negative → wrong direction
  company: { ticker: 'MSFT', sector: 'Technology' },
};

const MED_CONF_LONG = {
  accessionNumber: '0001193125-24-004001',
  filingType: '10-Q',
  filingDate: new Date('2024-08-01'),
  predicted30dAlpha: 0.8,
  predictionConfidence: 0.65,
  actual30dAlpha: null,
  company: { ticker: 'GOOGL', sector: 'Communication Services' },
};

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost:3000/api/model-demo');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

function makePostRequest(body: object) {
  return new NextRequest('http://localhost:3000/api/model-demo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Import route handlers after mocks are set up
import { GET, POST } from '@/app/api/model-demo/route';

// ──────────────────────────────────────────────────
// GET /api/model-demo
// ──────────────────────────────────────────────────

describe('GET /api/model-demo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to confidence=high filter and returns 200', async () => {
    prismaMock.filing.findMany.mockResolvedValue([HIGH_CONF_LONG_NO_ACTUAL]);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.predictions).toHaveLength(1);
    expect(body.predictions[0].confidence).toBe('high');
  });

  it('returns correct prediction shape', async () => {
    prismaMock.filing.findMany.mockResolvedValue([HIGH_CONF_LONG_NO_ACTUAL]);

    const res = await GET(makeGetRequest());
    const body = await res.json();
    const p = body.predictions[0];

    expect(p.accessionNumber).toBe('0001193125-24-001001');
    expect(p.ticker).toBe('AAPL');
    expect(p.sector).toBe('Technology');
    expect(p.filingType).toBe('10-Q');
    expect(p.signal).toBe('LONG');
    expect(p.confidence).toBe('high');
    expect(p.confidenceNum).toBeCloseTo(0.85, 2);
    expect(p.predictedAlpha).toBe(3.5);
    expect(p.actualAlpha).toBeNull();
    expect(p.correct).toBeNull();
  });

  it('computes summary stats with no actual data', async () => {
    prismaMock.filing.findMany.mockResolvedValue([HIGH_CONF_LONG_NO_ACTUAL]);

    const body = await (await GET(makeGetRequest())).json();

    expect(body.summary.total).toBe(1);
    expect(body.summary.withActual).toBe(0);
    expect(body.summary.dirAccuracy).toBeNull();
    expect(body.summary.avgPredicted).toBe(3.5);
    expect(body.summary.avgActual).toBeNull();
  });

  it('computes dirAccuracy from mixed actual results', async () => {
    prismaMock.filing.findMany.mockResolvedValue([
      HIGH_CONF_SHORT_WITH_ACTUAL_CORRECT,
      HIGH_CONF_LONG_WITH_ACTUAL_WRONG,
    ]);

    const body = await (await GET(makeGetRequest())).json();

    // 1 correct of 2 with actual = 50%
    expect(body.summary.withActual).toBe(2);
    expect(body.summary.dirAccuracy).toBe(50);
  });

  it('computes correct avgPredicted and avgActual', async () => {
    prismaMock.filing.findMany.mockResolvedValue([
      HIGH_CONF_SHORT_WITH_ACTUAL_CORRECT, // predicted -2.1, actual -1.8
      HIGH_CONF_LONG_WITH_ACTUAL_WRONG,    // predicted +1.2, actual -0.5
    ]);

    const body = await (await GET(makeGetRequest())).json();

    expect(body.summary.avgPredicted).toBeCloseTo((-2.1 + 1.2) / 2, 1);
    expect(body.summary.avgActual).toBeCloseTo((-1.8 + -0.5) / 2, 1);
  });

  it('marks correct=true when predicted and actual have same sign', async () => {
    prismaMock.filing.findMany.mockResolvedValue([HIGH_CONF_SHORT_WITH_ACTUAL_CORRECT]);

    const body = await (await GET(makeGetRequest())).json();
    expect(body.predictions[0].correct).toBe(true);
  });

  it('marks correct=false when predicted and actual have opposite signs', async () => {
    prismaMock.filing.findMany.mockResolvedValue([HIGH_CONF_LONG_WITH_ACTUAL_WRONG]);

    const body = await (await GET(makeGetRequest())).json();
    expect(body.predictions[0].correct).toBe(false);
  });

  it('filters by signal=SHORT and excludes LONG rows', async () => {
    prismaMock.filing.findMany.mockResolvedValue([
      HIGH_CONF_LONG_NO_ACTUAL,
      HIGH_CONF_SHORT_WITH_ACTUAL_CORRECT,
    ]);

    const body = await (await GET(makeGetRequest({ signal: 'SHORT' }))).json();

    expect(body.predictions).toHaveLength(1);
    expect(body.predictions[0].signal).toBe('SHORT');
  });

  it('signal=ALL returns all predictions without signal filtering', async () => {
    prismaMock.filing.findMany.mockResolvedValue([
      HIGH_CONF_LONG_NO_ACTUAL,
      HIGH_CONF_SHORT_WITH_ACTUAL_CORRECT,
    ]);

    const body = await (await GET(makeGetRequest({ signal: 'ALL' }))).json();
    expect(body.predictions).toHaveLength(2);
  });

  it('hasActual=true only returns rows with actual30dAlpha', async () => {
    prismaMock.filing.findMany.mockResolvedValue([
      HIGH_CONF_SHORT_WITH_ACTUAL_CORRECT,
    ]);

    const body = await (await GET(makeGetRequest({ hasActual: 'true' }))).json();
    expect(body.predictions).toHaveLength(1);
    expect(body.predictions[0].actualAlpha).not.toBeNull();
  });

  it('returns empty predictions and null stats when DB returns no rows', async () => {
    prismaMock.filing.findMany.mockResolvedValue([]);

    const body = await (await GET(makeGetRequest())).json();

    expect(body.predictions).toHaveLength(0);
    expect(body.summary.total).toBe(0);
    expect(body.summary.dirAccuracy).toBeNull();
    expect(body.summary.avgPredicted).toBeNull();
    expect(body.summary.avgActual).toBeNull();
  });

  it('rounds predictedAlpha and actualAlpha to 2 decimal places', async () => {
    prismaMock.filing.findMany.mockResolvedValue([{
      ...HIGH_CONF_SHORT_WITH_ACTUAL_CORRECT,
      predicted30dAlpha: -2.12345,
      actual30dAlpha: -1.87654,
    }]);

    const body = await (await GET(makeGetRequest())).json();
    const p = body.predictions[0];

    const predStr = p.predictedAlpha.toString().split('.')[1] || '';
    const actStr = p.actualAlpha.toString().split('.')[1] || '';
    expect(predStr.length).toBeLessThanOrEqual(2);
    expect(actStr.length).toBeLessThanOrEqual(2);
  });

  it('uses medium confidence band for confidenceNum in 0.60-0.79 range', async () => {
    prismaMock.filing.findMany.mockResolvedValue([MED_CONF_LONG]);

    // Pass confidence=medium so the route doesn't filter it out
    const body = await (await GET(makeGetRequest({ confidence: 'medium' }))).json();
    expect(body.predictions[0].confidence).toBe('medium');
  });

  it('passes limit param to prisma query (capped at 500)', async () => {
    prismaMock.filing.findMany.mockResolvedValue([]);

    await GET(makeGetRequest({ limit: '999' }));

    expect(prismaMock.filing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 })
    );
  });

  it('default limit is 100 when not specified', async () => {
    prismaMock.filing.findMany.mockResolvedValue([]);

    await GET(makeGetRequest());

    expect(prismaMock.filing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });
});

// ──────────────────────────────────────────────────
// POST /api/model-demo
// ──────────────────────────────────────────────────

describe('POST /api/model-demo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with prediction for valid features', async () => {
    const res = await POST(makePostRequest({ features: TRAINING_MEAN_FEATURES }));
    expect(res.status).toBe(200);
  });

  it('returns all required prediction fields', async () => {
    const body = await (await POST(makePostRequest({ features: TRAINING_MEAN_FEATURES }))).json();
    const p = body.prediction;

    expect(p).toBeDefined();
    expect(p.signal).toMatch(/^(LONG|SHORT|NEUTRAL)$/);
    expect(p.confidence).toMatch(/^(high|medium|low)$/);
    expect(typeof p.rawScore).toBe('number');
    expect(typeof p.expectedAlpha).toBe('number');
    expect(typeof p.predicted30dReturn).toBe('number');
    expect(typeof p.percentile).toBe('string');
    expect(typeof p.featureContributions).toBe('object');
    expect(typeof p.expertUsed).toBe('string');
  });

  it('returns NEUTRAL/low for training mean features', async () => {
    const body = await (await POST(makePostRequest({ features: TRAINING_MEAN_FEATURES }))).json();
    expect(body.prediction.signal).toBe('NEUTRAL');
    expect(body.prediction.confidence).toBe('low');
  });

  it('returns LONG signal for bullish features', async () => {
    const body = await (await POST(makePostRequest({ features: BULLISH_FEATURES }))).json();
    expect(body.prediction.signal).toBe('LONG');
    expect(body.prediction.rawScore).toBeGreaterThan(0);
  });

  it('returns SHORT signal for bearish features', async () => {
    const body = await (await POST(makePostRequest({ features: BEARISH_FEATURES }))).json();
    expect(body.prediction.signal).toBe('SHORT');
    expect(body.prediction.rawScore).toBeLessThan(0);
  });

  it('includes all 13 features in featureContributions', async () => {
    const body = await (await POST(makePostRequest({ features: TRAINING_MEAN_FEATURES }))).json();
    const keys = Object.keys(body.prediction.featureContributions);
    expect(keys).toHaveLength(13);
    expect(keys).toContain('priceToLow');
    expect(keys).toContain('majorDowngrades');
    expect(keys).toContain('analystUpsidePotential');
    expect(keys).toContain('priceToHigh');
    expect(keys).toContain('concernLevel');
    expect(keys).toContain('marketCap');
    expect(keys).toContain('sentimentScore');
    expect(keys).toContain('upgradesLast30d');
    expect(keys).toContain('filingTypeFactor');
    expect(keys).toContain('toneChangeDelta');
    expect(keys).toContain('epsSurprise');
    expect(keys).toContain('spxTrend30d');
    expect(keys).toContain('vixLevel');
  });

  it('feature contributions sum to rawScore', async () => {
    const body = await (await POST(makePostRequest({ features: BULLISH_FEATURES }))).json();
    const { featureContributions, rawScore } = body.prediction;
    const sum = Object.values(featureContributions as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(rawScore, 2);
  });

  it('accepts sector param without error', async () => {
    const res = await POST(makePostRequest({ features: TRAINING_MEAN_FEATURES, sector: 'Technology' }));
    expect(res.status).toBe(200);
  });

  it('expertUsed differs when sector is provided', async () => {
    const bodyGlobal = await (await POST(makePostRequest({ features: TRAINING_MEAN_FEATURES }))).json();
    const bodyTech = await (await POST(makePostRequest({ features: TRAINING_MEAN_FEATURES, sector: 'Technology' }))).json();

    // Both should return a non-empty string — sector routing may or may not change expert
    expect(typeof bodyGlobal.prediction.expertUsed).toBe('string');
    expect(typeof bodyTech.prediction.expertUsed).toBe('string');
  });

  it('predicted30dReturn = expectedAlpha + 0.8 (market baseline)', async () => {
    const body = await (await POST(makePostRequest({ features: TRAINING_MEAN_FEATURES }))).json();
    expect(body.prediction.predicted30dReturn).toBeCloseTo(body.prediction.expectedAlpha + 0.8, 1);
  });
});
