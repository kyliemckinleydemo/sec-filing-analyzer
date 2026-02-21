```typescript
/**
 * @module daily-filings-rss.test
 * @description Test suite for the daily filings RSS feed cron job API endpoint.
 * 
 * PURPOSE:
 * - Validates authentication and authorization for the cron endpoint
 * - Tests daily filings ingestion from SEC RSS feeds
 * - Verifies catch-up mode triggering when filings are stale (>2 days old)
 * - Ensures proper job tracking (cronJobRun creation, updates, error handling)
 * - Tests supervisor checks integration after job completion
 * - Validates prediction cache flushing for affected companies
 * - Tests daily index supplementation to fill RSS feed gaps
 * - Verifies deduplication between RSS and daily index sources
 * - Tests weekend and holiday handling for daily index fetching
 * - Validates graceful error handling for individual filing failures
 * - Tests stuck job cleanup before job execution
 * 
 * EXPORTS:
 * - Test suite: GET /api/cron/daily-filings-rss
 *   - Auth: Unauthorized access, CRON_SECRET validation, Vercel cron user agent
 *   - Success: RSS feed processing, filing storage, multiple sources
 *   - Catch-up: Stale filing detection, missed days backfill, hybrid mode
 *   - Job tracking: cronJobRun lifecycle, success/failure logging
 *   - Prediction cache: Selective flushing for affected companies
 *   - Daily index: Yesterday's supplement, deduplication, error handling
 *   - Edge cases: Empty feeds, Prisma errors, weekend handling
 * 
 * CLAUDE NOTES:
 * - Comprehensive mocking setup for Prisma, SEC RSS client, and supervisor
 * - Uses vitest for test framework with beforeEach cleanup
 * - Tests both "daily mode" (recent filings exist) and "catch-up mode" (stale data)
 * - Validates that Yahoo Finance updates are skipped (handled by separate cron)
 * - Daily index supplementation only runs on weekdays in daily mode
 * - Prediction cache flush is scoped to only companies with new filings
 * - Time-based tests use vi.setSystemTime() for deterministic weekday/weekend testing
 * - Tests verify individual filing errors don't fail entire job
 * - Validates supervisor integration runs after successful completion
 */
```

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../../mocks/prisma';
import { MOCK_RSS_FILING, MOCK_RSS_FILING_2 } from '../../../fixtures/cron-data';

// Mock external dependencies
vi.mock('@/lib/sec-rss-client', () => ({
  secRSSClient: {
    fetchRecentFilingsFromRSS: vi.fn().mockResolvedValue([]),
    fetchMissedDays: vi.fn().mockResolvedValue([]),
    fetchFromDailyIndex: vi.fn().mockResolvedValue([]),
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

  it('skips Yahoo Finance calls (handled by dedicated cron)', async () => {
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([MOCK_RSS_FILING] as any);

    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    // Yahoo Finance updates should be 0 since we removed them from this cron
    expect(body.results.yahooFinanceUpdates).toBe(0);
    expect(body.results.yahooFinanceErrors).toBe(0);
  });

  // --- Catch-up mode ---

  it('triggers catch-up mode when most recent filing is >2 days old', async () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    prismaMock.filing.findFirst.mockResolvedValue({ filingDate: fiveDaysAgo });

    vi.mocked(secRSSClient.fetchMissedDays).mockResolvedValue([MOCK_RSS_FILING] as any);
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([MOCK_RSS_FILING_2] as any);

    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results.mode).toBe('catchup');
    // Should fetch both catch-up filings AND today's RSS filings
    expect(secRSSClient.fetchMissedDays).toHaveBeenCalled();
    expect(secRSSClient.fetchRecentFilingsFromRSS).toHaveBeenCalled();
    expect(body.results.fetched).toBe(2); // 1 from catch-up + 1 from RSS
  });

  it('always fetches today RSS filings even in catch-up mode', async () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    prismaMock.filing.findFirst.mockResolvedValue({ filingDate: threeDaysAgo });

    vi.mocked(secRSSClient.fetchMissedDays).mockResolvedValue([]);
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([MOCK_RSS_FILING] as any);

    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    // Even though catch-up returned nothing, today's RSS filings should still be fetched
    expect(secRSSClient.fetchRecentFilingsFromRSS).toHaveBeenCalled();
    expect(body.results.fetched).toBe(1);
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

  it('flushes prediction cache only for affected companies', async () => {
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([
      MOCK_RSS_FILING,
    ] as any);
    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});

    await GET(makeAuthRequest());

    // Should scope prediction flush to only the affected company
    expect(prismaMock.filing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: { in: ['company-001'] },
          predicted7dReturn: { not: null },
        },
        data: expect.objectContaining({
          predicted7dReturn: null,
          predictionConfidence: null,
        }),
      })
    );
    expect(prismaMock.prediction.deleteMany).toHaveBeenCalledWith({
      where: {
        filing: {
          companyId: { in: ['company-001'] },
        },
      },
    });
  });

  it('skips prediction flush when no new filings are stored', async () => {
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([]);

    await GET(makeAuthRequest());

    // Should NOT flush predictions when no filings were stored
    expect(prismaMock.filing.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.prediction.deleteMany).not.toHaveBeenCalled();
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

  // --- Daily index supplement ---

  it('supplements RSS with yesterday daily index in daily mode', async () => {
    // Set to a weekday so yesterday is also a weekday
    const wednesday = new Date('2026-02-18T15:00:00Z'); // Wednesday
    vi.setSystemTime(wednesday);

    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([MOCK_RSS_FILING] as any);
    vi.mocked(secRSSClient.fetchFromDailyIndex).mockResolvedValue([MOCK_RSS_FILING_2] as any);

    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    // RSS returned 1, daily index returned 1 (different accession) = 2 total
    expect(body.results.fetched).toBe(2);
    expect(secRSSClient.fetchFromDailyIndex).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('deduplicates filings from RSS and daily index', async () => {
    const wednesday = new Date('2026-02-18T15:00:00Z');
    vi.setSystemTime(wednesday);

    // Same filing in both RSS and daily index
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([MOCK_RSS_FILING] as any);
    vi.mocked(secRSSClient.fetchFromDailyIndex).mockResolvedValue([MOCK_RSS_FILING] as any);

    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    // Should deduplicate by accessionNumber — only 1 unique filing
    expect(body.results.fetched).toBe(1);

    vi.useRealTimers();
  });

  it('handles daily index failure gracefully', async () => {
    const wednesday = new Date('2026-02-18T15:00:00Z');
    vi.setSystemTime(wednesday);

    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([MOCK_RSS_FILING] as any);
    vi.mocked(secRSSClient.fetchFromDailyIndex).mockRejectedValue(new Error('SEC server error'));

    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    // Should still succeed with just RSS filings
    expect(body.success).toBe(true);
    expect(body.results.fetched).toBe(1);

    vi.useRealTimers();
  });

  it('skips daily index on weekends (Saturday yesterday)', async () => {
    // Set to Sunday so yesterday is Saturday
    const sunday = new Date('2026-02-22T15:00:00Z'); // Sunday
    vi.setSystemTime(sunday);

    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([]);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    // Should NOT call daily index on weekends
    expect(secRSSClient.fetchFromDailyIndex).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('does not call daily index in catch-up mode', async () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    prismaMock.filing.findFirst.mockResolvedValue({ filingDate: fiveDaysAgo });

    vi.mocked(secRSSClient.fetchMissedDays).mockResolvedValue([MOCK_RSS_FILING] as any);
    vi.mocked(secRSSClient.fetchRecentFilingsFromRSS).mockResolvedValue([]);

    prismaMock.company.upsert.mockResolvedValue({ id: 'company-001' });
    prismaMock.filing.upsert.mockResolvedValue({});

    await GET(makeAuthRequest());

    // Daily index supplement only runs in daily mode, not catch-up
    expect(secRSSClient.fetchFromDailyIndex).not.toHaveBeenCalled();
  });
});
