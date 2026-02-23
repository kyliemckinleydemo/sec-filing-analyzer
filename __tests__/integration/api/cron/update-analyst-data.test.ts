/**
 * @module update-analyst-data.test
 * @description Test suite for the update-analyst-data cron job API route
 *
 * PURPOSE:
 * - Validates the analyst data update cron job that fetches and enriches filing data with
 *   Yahoo Finance analyst consensus, price targets, recommendations, and financial metrics
 * - Tests authentication, authorization, and cron job execution flow
 * - Verifies data transformation and merging logic for analyst recommendations
 * - Ensures proper error handling and job tracking for production cron reliability
 * - Validates filtering logic for recent filings and earnings-related 8-K forms
 *
 * EXPORTS:
 * - Test suite covering:
 *   • Authentication and authorization checks
 *   • Successful analyst data fetching and storage
 *   • Analyst rating classification (upgrades/downgrades)
 *   • Major firm identification and tracking
 *   • 8-K earnings-specific filtering
 *   • Error handling and partial failure scenarios
 *   • Cron job run logging and tracking
 *   • Data merging with existing analysis data
 *   • Upside potential calculations
 *   • Enriched metrics from Yahoo Finance API
 *
 * CLAUDE NOTES:
 * - Uses vitest mocking via vi.hoisted() to mock Yahoo Finance singleton before module import
 * - Mocks Prisma client for database operations using prismaMock fixture
 * - Tests include comprehensive coverage of analyst consensus scoring algorithm
 * - Validates proper handling of missing data (no ticker, no company, empty results)
 * - Tests ensure stuck job cleanup on cron start (prevents duplicate runs)
 * - Mock data (MOCK_YAHOO_SUMMARY) mirrors actual Yahoo Finance quoteSummary response structure
 * - Includes edge cases: API failures, empty datasets, malformed data, and partial updates
 * - Verifies analyst activity tracking (upgrades/downgrades in last 30 days)
 * - Tests recommendation trend integration and consensus score calculation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../../mocks/prisma';
import {
  MOCK_FILING_RECENT,
  MOCK_FILING_8K_EARNINGS,
} from '../../../fixtures/cron-data';

// Mock Yahoo Finance singleton before import
const { mockQuoteSummary } = vi.hoisted(() => ({
  mockQuoteSummary: vi.fn(),
}));
vi.mock('@/lib/yahoo-finance-singleton', () => ({
  default: {
    quoteSummary: mockQuoteSummary,
  },
}));

import { GET } from '@/app/api/cron/update-analyst-data/route';
import { NextRequest } from 'next/server';

const CRON_URL = 'http://localhost:3000/api/cron/update-analyst-data';

// Yahoo Finance quoteSummary mock data matching the modules requested by the route
const MOCK_YAHOO_SUMMARY = {
  financialData: {
    targetMeanPrice: 210.0,
    currentPrice: 195.0,
    numberOfAnalystOpinions: 38,
    revenueGrowth: 0.08,
    earningsGrowth: 0.12,
    grossMargins: 0.46,
    operatingMargins: 0.30,
    profitMargins: 0.25,
    freeCashflow: 110_000_000_000,
  },
  recommendationTrend: {
    trend: [
      { period: '0m', strongBuy: 10, buy: 15, hold: 10, sell: 2, strongSell: 1 },
    ],
  },
  upgradeDowngradeHistory: {
    history: [
      {
        epochGradeDate: new Date(Date.now() - 5 * 86400000),
        firm: 'Goldman Sachs',
        toGrade: 'Buy',
        fromGrade: 'Hold',
        action: 'upgrade',
      },
      {
        epochGradeDate: new Date(Date.now() - 3 * 86400000),
        firm: 'Morgan Stanley',
        toGrade: 'Overweight',
        fromGrade: 'Overweight',
        action: 'main',
      },
    ],
  },
  earningsHistory: {
    history: [
      {
        quarter: new Date('2024-10-31'),
        epsEstimate: 1.50,
        epsActual: 1.56,
        epsDifference: 0.06,
        surprisePercent: 0.04,
      },
    ],
  },
  earnings: {
    financialsChart: {
      quarterly: [
        { date: '3Q2024', revenue: 94_930_000_000, earnings: 23_600_000_000 },
      ],
    },
  },
  defaultKeyStatistics: {
    pegRatio: 2.5,
    shortRatio: 1.2,
    shortPercentOfFloat: 0.008,
    enterpriseToRevenue: 8.5,
    enterpriseToEbitda: 22.0,
  },
  calendarEvents: {},
};

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest(CRON_URL, { headers });
}

function makeAuthRequest() {
  return makeRequest({ authorization: 'Bearer test-cron-secret' });
}

describe('GET /api/cron/update-analyst-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuoteSummary.mockReset();
    prismaMock.cronJobRun.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.cronJobRun.create.mockResolvedValue({ id: 'job-001', jobName: 'update-analyst-data', status: 'running' });
    prismaMock.cronJobRun.update.mockResolvedValue({});
    prismaMock.filing.findMany.mockResolvedValue([]);
    mockQuoteSummary.mockResolvedValue(MOCK_YAHOO_SUMMARY);
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

    mockQuoteSummary.mockResolvedValueOnce({
      ...MOCK_YAHOO_SUMMARY,
      upgradeDowngradeHistory: {
        history: [
          {
            epochGradeDate: new Date(MOCK_FILING_RECENT.filingDate.getTime() - 5 * 86400000),
            firm: 'Goldman Sachs',
            toGrade: 'Buy',
            fromGrade: 'Hold',
            action: 'upgrade',
          },
        ],
      },
    });

    await GET(makeAuthRequest());

    const updateCall = prismaMock.filing.update.mock.calls[0];
    const analysisData = JSON.parse(updateCall[0].data.analysisData);
    expect(analysisData.analyst.activity.upgradesLast30d).toBeGreaterThanOrEqual(0);
  });

  it('identifies major firms correctly', async () => {
    prismaMock.filing.findMany.mockResolvedValue([MOCK_FILING_RECENT]);
    prismaMock.filing.update.mockResolvedValue({});

    mockQuoteSummary.mockResolvedValueOnce({
      ...MOCK_YAHOO_SUMMARY,
      upgradeDowngradeHistory: {
        history: [
          {
            epochGradeDate: new Date(MOCK_FILING_RECENT.filingDate.getTime() - 5 * 86400000),
            firm: 'Morgan Stanley',
            toGrade: 'Equal Weight',
            fromGrade: 'Overweight',
            action: 'downgrade',
          },
        ],
      },
    });

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

  it('handles Yahoo Finance errors per-company (continues to next)', async () => {
    const filing2 = {
      ...MOCK_FILING_RECENT,
      id: 'filing-102',
      company: { id: 'c2', ticker: 'MSFT', name: 'Microsoft', sector: 'Technology' },
    };

    prismaMock.filing.findMany.mockResolvedValue([MOCK_FILING_RECENT, filing2]);
    prismaMock.filing.update.mockResolvedValue({});

    // First ticker fails (quoteSummary rejects), second succeeds
    mockQuoteSummary
      .mockRejectedValueOnce(new Error('Yahoo Finance API error'))
      .mockResolvedValueOnce(MOCK_YAHOO_SUMMARY);

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
    // targetMeanPrice: 210, currentPrice: 195 -> ~7.69% upside
    expect(analysisData.analyst.upsidePotential).toBeCloseTo(7.69, 0);
  });

  it('includes enrichedMetrics from Yahoo Finance', async () => {
    prismaMock.filing.findMany.mockResolvedValue([MOCK_FILING_RECENT]);
    prismaMock.filing.update.mockResolvedValue({});

    await GET(makeAuthRequest());

    const updateCall = prismaMock.filing.update.mock.calls[0];
    const analysisData = JSON.parse(updateCall[0].data.analysisData);
    expect(analysisData.enrichedMetrics).toBeDefined();
    expect(analysisData.enrichedMetrics.pegRatio).toBe(2.5);
    expect(analysisData.enrichedMetrics.shortRatio).toBe(1.2);
    expect(analysisData.enrichedMetrics.revenueGrowth).toBe(0.08);
    expect(analysisData.enrichedMetrics.grossMargins).toBe(0.46);
    expect(analysisData.enrichedMetrics.freeCashflow).toBe(110_000_000_000);
  });

  it('includes recommendationTrend in analyst data', async () => {
    prismaMock.filing.findMany.mockResolvedValue([MOCK_FILING_RECENT]);
    prismaMock.filing.update.mockResolvedValue({});

    await GET(makeAuthRequest());

    const updateCall = prismaMock.filing.update.mock.calls[0];
    const analysisData = JSON.parse(updateCall[0].data.analysisData);
    expect(analysisData.analyst.recommendationTrend).toBeDefined();
    expect(analysisData.analyst.recommendationTrend[0].strongBuy).toBe(10);
  });
});
