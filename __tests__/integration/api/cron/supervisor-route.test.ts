import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the mock fn is available when vi.mock factory runs
const { mockRunSupervisorChecks } = vi.hoisted(() => ({
  mockRunSupervisorChecks: vi.fn(),
}));

vi.mock('@/lib/supervisor', () => ({
  runSupervisorChecks: mockRunSupervisorChecks,
}));

import { GET } from '@/app/api/cron/supervisor/route';
import { NextRequest } from 'next/server';

const CRON_URL = 'http://localhost:3000/api/cron/supervisor';

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest(CRON_URL, { headers });
}

function makeAuthRequest() {
  return makeRequest({ authorization: 'Bearer test-cron-secret' });
}

const HEALTHY_REPORT = {
  timestamp: new Date().toISOString(),
  stuckJobsFixed: 0,
  missingDailyFilings: false,
  missingAnalystUpdate: false,
  jobsTriggered: [],
  alerts: [],
  actions: [],
};

describe('GET /api/cron/supervisor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunSupervisorChecks.mockResolvedValue(HEALTHY_REPORT);
  });

  // --- Auth ---

  it('returns 401 without CRON_SECRET', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('accepts vercel-cron user agent', async () => {
    const req = makeRequest({ 'user-agent': 'vercel-cron/1.0' });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  // --- Success ---

  it('returns 200 with supervisor report', async () => {
    const res = await GET(makeAuthRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.report).toBeDefined();
    expect(body.report.stuckJobsFixed).toBe(0);
  });

  it('passes autoTriggerMissing=true to runSupervisorChecks', async () => {
    await GET(makeAuthRequest());

    expect(mockRunSupervisorChecks).toHaveBeenCalledWith(true);
  });

  it('returns alerts status when issues found', async () => {
    mockRunSupervisorChecks.mockResolvedValue({
      ...HEALTHY_REPORT,
      alerts: ['Missing daily filings'],
    });

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.status).toBe('alerts');
  });

  it('returns report JSON in response body', async () => {
    const reportWithIssues = {
      ...HEALTHY_REPORT,
      stuckJobsFixed: 2,
      missingDailyFilings: true,
      jobsTriggered: ['daily-filings-rss'],
      alerts: ['Missing daily filings'],
      actions: ['Fixed 2 stuck jobs'],
    };

    mockRunSupervisorChecks.mockResolvedValue(reportWithIssues);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.report.stuckJobsFixed).toBe(2);
    expect(body.report.missingDailyFilings).toBe(true);
    expect(body.report.jobsTriggered).toContain('daily-filings-rss');
  });

  // --- Error handling ---

  it('handles supervisor errors gracefully', async () => {
    mockRunSupervisorChecks.mockRejectedValue(new Error('Supervisor crashed'));

    const res = await GET(makeAuthRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.error).toBe('Supervisor crashed');
  });
});
