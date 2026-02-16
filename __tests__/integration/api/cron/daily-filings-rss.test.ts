import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../../mocks/prisma';
import { MOCK_RSS_FILING, MOCK_RSS_FILING_2, MOCK_YAHOO_FINANCIALS } from '../../../fixtures/cron-data';

// Mock external dependencies
vi.mock('@/lib/sec-rss-client', () => ({
  secRSSClient: {
    fetchRecentFilingsFromRSS: vi.fn().mockResolvedValue([]),
    fetchMissedDays: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/yahoo-finance-client', () => ({
  yahooFinanceClient: {
    getCompanyFinancials: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/lib/supervisor', () => ({
  runSupervisorChecks: vi.fn().mockResolvedValue({
    timestamp: new Date().toISOString(),
    stuckJobsFixed: 0,
    missingDailyFilings: false,
    missingAnalystUpdate: false,
    jobsTriggered: [],
    alerts: [],
    actions: [],
  }),
}));

import { GET } from '@/app/api/cron/daily-filings-rss/route';
import { secRSSClient } from '@/lib/sec-rss-client';
import { yahooFinanceClient } from '@/lib/yahoo-finance-client';
import { runSupervisorChecks } from '@/lib/supervisor';
import { NextRequest } from 'next/server';

const CRON_URL = 'http://localhost:3000/api/cron/daily-filings-rss';

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest(CRON_URL, { headers });
}

function makeAuthRequest() {
  return makeRequest({ authorization: 'Bearer test-cron-secret' });
}

describe('GET /api/cron/daily-filings-rss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks for job tracking
    prismaMock.cronJobRun.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.cronJobRun.create.mockResolvedValue({ id: 'job-001', jobName: 'daily-filings-rss', status: 'running' });
    prismaMock.cronJobRun.update.mockResolvedValue({});
    prismaMock.cronJobRun.findFirst.mockResolvedValue(null);
    // Return a recent filing so the route stays in daily mode (not catch-up)
    prismaMock.filing.findFirst.mockResolvedValue({
      filingDate: new Date(), // today → no catch-up needed
    });
    prismaMock.filing.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.prediction.deleteMany.mockResolvedValue({ count: 0 });
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([]);
  });

  // --- Auth ---

  it('returns 401 without CRON_SECRET authorization header', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 with wrong authorization header', async () => {
    const res = await GET(makeRequest({ authorization: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
  });

  it('accepts vercel-cron user agent', async () => {
    const req = makeRequest({ 'user-agent': 'vercel-cron/1.0' });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  // --- Success cases ---

  it('returns 200 and processes new filings from RSS feed', async () => {
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([
      MOCK_RSS_FILING,
      MOCK_RSS_FILING_2,
    ] as any);

    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});
    prismaMock.company.findUnique.mockResolvedValue(null);

    const res = await GET(makeAuthRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.results.fetched).toBe(2);
  });

  it('creates filing records in DB for new filings', async () => {
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([MOCK_RSS_FILING] as any);
    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});
    prismaMock.company.findUnique.mockResolvedValue(null);

    await GET(makeAuthRequest());

    expect(prismaMock.company.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ticker: 'AAPL' },
        create: expect.objectContaining({ ticker: 'AAPL', cik: '0000320193' }),
      })
    );
    expect(prismaMock.filing.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accessionNumber: '0001193125-24-050001' },
      })
    );
  });

  it('fetches stock prices via yahooFinanceClient for new filings', async () => {
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([MOCK_RSS_FILING] as any);
    vi.mocked(yahooFinanceClient.getCompanyFinancials).mockResolvedValue(MOCK_YAHOO_FINANCIALS as any);

    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});
    prismaMock.company.findUnique.mockResolvedValue({ id: 'company-001' });
    prismaMock.company.update.mockResolvedValue({});
    prismaMock.companySnapshot.create.mockResolvedValue({});

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(yahooFinanceClient.getCompanyFinancials).toHaveBeenCalledWith('AAPL');
    expect(body.results.yahooFinanceUpdates).toBe(1);
  });

  it('updates company records with latest price data', async () => {
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([MOCK_RSS_FILING] as any);
    vi.mocked(yahooFinanceClient.getCompanyFinancials).mockResolvedValue(MOCK_YAHOO_FINANCIALS as any);

    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});
    prismaMock.company.findUnique.mockResolvedValue({ id: 'company-001' });
    prismaMock.company.update.mockResolvedValue({});
    prismaMock.companySnapshot.create.mockResolvedValue({});

    await GET(makeAuthRequest());

    expect(prismaMock.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ticker: 'AAPL' },
        data: expect.objectContaining({
          currentPrice: 195.0,
          marketCap: 3_000_000_000_000,
        }),
      })
    );
  });

  it('creates historical company snapshot', async () => {
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([MOCK_RSS_FILING] as any);
    vi.mocked(yahooFinanceClient.getCompanyFinancials).mockResolvedValue(MOCK_YAHOO_FINANCIALS as any);

    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});
    prismaMock.company.findUnique.mockResolvedValue({ id: 'company-001' });
    prismaMock.company.update.mockResolvedValue({});
    prismaMock.companySnapshot.create.mockResolvedValue({});

    await GET(makeAuthRequest());

    expect(prismaMock.companySnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'company-001',
          triggerType: 'daily_cron',
        }),
      })
    );
  });

  // --- Job tracking ---

  it('logs cronJobRun on success', async () => {
    await GET(makeAuthRequest());

    expect(prismaMock.cronJobRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { jobName: 'daily-filings-rss', status: 'running' },
      })
    );
    expect(prismaMock.cronJobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'success' }),
      })
    );
  });

  it('logs cronJobRun on failure', async () => {
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockRejectedValue(new Error('RSS fetch failed'));
    // Need to mock filing.findFirst for catch-up check
    prismaMock.filing.findFirst.mockResolvedValue({ filingDate: new Date() });

    const res = await GET(makeAuthRequest());
    expect(res.status).toBe(500);

    expect(prismaMock.cronJobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          errorMessage: 'RSS fetch failed',
        }),
      })
    );
  });

  it('runs supervisor checks after completion', async () => {
    await GET(makeAuthRequest());

    expect(runSupervisorChecks).toHaveBeenCalledWith(false);
  });

  // --- Edge cases ---

  it('handles empty RSS feed (no new filings)', async () => {
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([]);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results.fetched).toBe(0);
    expect(body.results.stored).toBe(0);
  });

  it('handles Yahoo Finance errors for individual tickers (continues processing)', async () => {
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([
      MOCK_RSS_FILING,
      MOCK_RSS_FILING_2,
    ] as any);
    vi.mocked(yahooFinanceClient.getCompanyFinancials)
      .mockRejectedValueOnce(new Error('Yahoo rate limit'))
      .mockResolvedValueOnce(MOCK_YAHOO_FINANCIALS as any);

    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});
    prismaMock.company.findUnique.mockResolvedValue({ id: 'company-001' });
    prismaMock.company.update.mockResolvedValue({});
    prismaMock.companySnapshot.create.mockResolvedValue({});

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results.yahooFinanceErrors).toBe(1);
    expect(body.results.yahooFinanceUpdates).toBe(1);
  });

  it('handles Prisma errors for individual filings gracefully', async () => {
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([
      MOCK_RSS_FILING,
      MOCK_RSS_FILING_2,
    ] as any);

    prismaMock.company.upsert
      .mockRejectedValueOnce(new Error('Unique constraint violation'))
      .mockResolvedValueOnce({ id: 'company-002' });
    prismaMock.filing.upsert.mockResolvedValue({});
    prismaMock.company.findUnique.mockResolvedValue(null);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    // Should still succeed overall (individual errors are logged)
    expect(body.success).toBe(true);
    expect(body.results.stored).toBe(1);
  });

  it('flushes prediction cache after processing', async () => {
    await GET(makeAuthRequest());

    expect(prismaMock.filing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { predicted7dReturn: { not: null } },
        data: expect.objectContaining({
          predicted7dReturn: null,
          predictionConfidence: null,
        }),
      })
    );
    expect(prismaMock.prediction.deleteMany).toHaveBeenCalledWith({});
  });

  it('cleans up stuck jobs before starting', async () => {
    await GET(makeAuthRequest());

    expect(prismaMock.cronJobRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jobName: 'daily-filings-rss',
          status: 'running',
        }),
      })
    );
  });
});
