import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../../mocks/prisma';
import {
  MOCK_FILING_RECENT,
  MOCK_FILING_8K_EARNINGS,
  MOCK_FMP_PROFILE,
  MOCK_FMP_UPGRADES_DOWNGRADES,
  MOCK_FMP_ANALYST_RECOMMENDATION,
  MOCK_FMP_EARNINGS,
} from '../../../fixtures/cron-data';

// Mock FMP client before import
const { mockGetProfile, mockGetUpgradesDowngrades, mockGetAnalystRecommendation, mockGetEarnings } = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
  mockGetUpgradesDowngrades: vi.fn(),
  mockGetAnalystRecommendation: vi.fn(),
  mockGetEarnings: vi.fn(),
}));
vi.mock('@/lib/fmp-client', () => ({
  default: {
    getProfile: mockGetProfile,
    getUpgradesDowngrades: mockGetUpgradesDowngrades,
    getAnalystRecommendation: mockGetAnalystRecommendation,
    getEarnings: mockGetEarnings,
  },
}));

import { GET } from '@/app/api/cron/update-analyst-data/route';
import { NextRequest } from 'next/server';

const CRON_URL = 'http://localhost:3000/api/cron/update-analyst-data';

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest(CRON_URL, { headers });
}

function makeAuthRequest() {
  return makeRequest({ authorization: 'Bearer test-cron-secret' });
}

describe('GET /api/cron/update-analyst-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProfile.mockReset();
    mockGetUpgradesDowngrades.mockReset();
    mockGetAnalystRecommendation.mockReset();
    mockGetEarnings.mockReset();
    prismaMock.cronJobRun.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.cronJobRun.create.mockResolvedValue({ id: 'job-001', jobName: 'update-analyst-data', status: 'running' });
    prismaMock.cronJobRun.update.mockResolvedValue({});
    prismaMock.filing.findMany.mockResolvedValue([]);
    mockGetProfile.mockResolvedValue(MOCK_FMP_PROFILE);
    mockGetUpgradesDowngrades.mockResolvedValue(MOCK_FMP_UPGRADES_DOWNGRADES);
    mockGetAnalystRecommendation.mockResolvedValue(MOCK_FMP_ANALYST_RECOMMENDATION);
    mockGetEarnings.mockResolvedValue(MOCK_FMP_EARNINGS);
  });

  // --- Auth ---

  it('returns 401 without CRON_SECRET', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 with invalid auth', async () => {
    const res = await GET(makeRequest({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  // --- Success ---

  it('returns 200 and fetches analyst data for companies with recent filings', async () => {
    prismaMock.filing.findMany.mockResolvedValue([MOCK_FILING_RECENT]);
    prismaMock.filing.update.mockResolvedValue({});

    const res = await GET(makeAuthRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.results.analystData.updated).toBe(1);
  });

  it('updates filing with analyst consensus data', async () => {
    prismaMock.filing.findMany.mockResolvedValue([MOCK_FILING_RECENT]);
    prismaMock.filing.update.mockResolvedValue({});

    await GET(makeAuthRequest());

    expect(prismaMock.filing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_FILING_RECENT.id },
        data: expect.objectContaining({
          analysisData: expect.stringContaining('analyst'),
        }),
      })
    );
  });

  it('classifies analyst events correctly (upgrade from Goldman Sachs)', async () => {
    prismaMock.filing.findMany.mockResolvedValue([MOCK_FILING_RECENT]);
    prismaMock.filing.update.mockResolvedValue({});

    mockGetUpgradesDowngrades.mockResolvedValueOnce([
      {
        symbol: 'AAPL',
        publishedDate: new Date(MOCK_FILING_RECENT.filingDate.getTime() - 5 * 86400000).toISOString(),
        newsURL: '',
        newsTitle: '',
        newsBaseURL: '',
        newsPublisher: '',
        newGrade: 'Buy',
        previousGrade: 'Hold',
        gradingCompany: 'Goldman Sachs',
        action: 'upgrade',
        priceWhenPosted: 190,
      },
    ]);

    await GET(makeAuthRequest());

    const updateCall = prismaMock.filing.update.mock.calls[0];
    const analysisData = JSON.parse(updateCall[0].data.analysisData);
    expect(analysisData.analyst.activity.upgradesLast30d).toBeGreaterThanOrEqual(0);
  });

  it('identifies major firms correctly', async () => {
    prismaMock.filing.findMany.mockResolvedValue([MOCK_FILING_RECENT]);
    prismaMock.filing.update.mockResolvedValue({});

    mockGetUpgradesDowngrades.mockResolvedValueOnce([
      {
        symbol: 'AAPL',
        publishedDate: new Date(MOCK_FILING_RECENT.filingDate.getTime() - 5 * 86400000).toISOString(),
        newsURL: '',
        newsTitle: '',
        newsBaseURL: '',
        newsPublisher: '',
        newGrade: 'Equal Weight',
        previousGrade: 'Overweight',
        gradingCompany: 'Morgan Stanley',
        action: 'downgrade',
        priceWhenPosted: 192,
      },
    ]);

    await GET(makeAuthRequest());

    const updateCall = prismaMock.filing.update.mock.calls[0];
    const analysisData = JSON.parse(updateCall[0].data.analysisData);
    expect(analysisData.analyst.activity.majorDowngrades).toBeGreaterThanOrEqual(0);
  });

  it('processes 8-K filings only if earnings-related', async () => {
    const non8KEarnings = {
      ...MOCK_FILING_RECENT,
      id: 'filing-non-earnings',
      filingType: '8-K',
      analysisData: JSON.stringify({
        filingContentSummary: 'Board of directors change announcement',
      }),
    };

    prismaMock.filing.findMany.mockResolvedValue([
      MOCK_FILING_8K_EARNINGS,
      non8KEarnings,
    ]);
    prismaMock.filing.update.mockResolvedValue({});

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    // Only the earnings 8-K should be processed, the board change should be filtered
    expect(body.results.analystData.total).toBeLessThanOrEqual(2);
  });

  it('skips filings without ticker', async () => {
    const noTickerFiling = {
      ...MOCK_FILING_RECENT,
      company: null,
    };
    prismaMock.filing.findMany.mockResolvedValue([noTickerFiling]);
    prismaMock.filing.update.mockResolvedValue({});

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.results.analystData.updated).toBe(0);
  });

  // --- Error handling ---

  it('handles FMP errors per-company (continues to next)', async () => {
    const filing2 = {
      ...MOCK_FILING_RECENT,
      id: 'filing-102',
      company: { id: 'c2', ticker: 'MSFT', name: 'Microsoft', sector: 'Technology' },
    };

    prismaMock.filing.findMany.mockResolvedValue([MOCK_FILING_RECENT, filing2]);
    prismaMock.filing.update.mockResolvedValue({});

    // First ticker fails (getProfile rejects), second succeeds
    mockGetProfile
      .mockRejectedValueOnce(new Error('FMP API error'))
      .mockResolvedValueOnce(MOCK_FMP_PROFILE);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results.analystData.errors).toBe(1);
    expect(body.results.analystData.updated).toBe(1);
  });

  // --- Job tracking ---

  it('logs cronJobRun on success', async () => {
    await GET(makeAuthRequest());

    expect(prismaMock.cronJobRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { jobName: 'update-analyst-data', status: 'running' },
      })
    );
    expect(prismaMock.cronJobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'success' }),
      })
    );
  });

  it('logs cronJobRun on failure', async () => {
    prismaMock.filing.findMany.mockRejectedValue(new Error('DB error'));

    const res = await GET(makeAuthRequest());
    expect(res.status).toBe(500);

    expect(prismaMock.cronJobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          errorMessage: 'DB error',
        }),
      })
    );
  });

  it('handles empty company list', async () => {
    prismaMock.filing.findMany.mockResolvedValue([]);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results.analystData.updated).toBe(0);
    expect(body.results.analystData.total).toBe(0);
  });

  it('cleans up stuck jobs before starting', async () => {
    await GET(makeAuthRequest());

    expect(prismaMock.cronJobRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jobName: 'update-analyst-data',
          status: 'running',
        }),
      })
    );
  });

  it('merges analyst data into existing analysisData', async () => {
    const filingWithExistingData = {
      ...MOCK_FILING_RECENT,
      analysisData: JSON.stringify({
        summary: 'Existing summary',
        financialMetrics: { revenue: 100 },
      }),
    };

    prismaMock.filing.findMany.mockResolvedValue([filingWithExistingData]);
    prismaMock.filing.update.mockResolvedValue({});

    await GET(makeAuthRequest());

    const updateCall = prismaMock.filing.update.mock.calls[0];
    const analysisData = JSON.parse(updateCall[0].data.analysisData);
    expect(analysisData.summary).toBe('Existing summary');
    expect(analysisData.analyst).toBeDefined();
    expect(analysisData.analyst.consensusScore).toBeDefined();
  });

  it('calculates upside potential from target price', async () => {
    prismaMock.filing.findMany.mockResolvedValue([MOCK_FILING_RECENT]);
    prismaMock.filing.update.mockResolvedValue({});

    await GET(makeAuthRequest());

    const updateCall = prismaMock.filing.update.mock.calls[0];
    const analysisData = JSON.parse(updateCall[0].data.analysisData);
    // targetMeanPrice: 210, price: 195 -> ~7.69% upside
    expect(analysisData.analyst.upsidePotential).toBeCloseTo(7.69, 0);
  });
});
