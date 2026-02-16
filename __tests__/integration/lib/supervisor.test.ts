import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../mocks/prisma';

// Import after mocks
import { runSupervisorChecks } from '@/lib/supervisor';

describe('runSupervisorChecks()', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-001' }), { status: 200 })
    );
    // Default: no stuck jobs, recent successful runs, no high failure rate
    prismaMock.cronJobRun.findMany.mockResolvedValue([]);
    prismaMock.cronJobRun.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.cronJobRun.findFirst.mockResolvedValue({
      id: 'run-recent',
      jobName: 'daily-filings-rss',
      status: 'success',
      completedAt: new Date(),
    });
  });

  // --- Healthy state ---

  it('returns healthy report when all jobs ran recently', async () => {
    // findFirst called twice: once for daily-filings, once for analyst-data
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'success', completedAt: new Date() }) // daily-filings
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() }); // analyst-data

    // recent runs with no failures
    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([]) // stuck jobs (none)
      .mockResolvedValueOnce(
        Array(10).fill(null).map((_, i) => ({ id: `run-${i}`, status: 'success' }))
      ); // last 10 runs

    const report = await runSupervisorChecks(false);

    expect(report.stuckJobsFixed).toBe(0);
    expect(report.missingDailyFilings).toBe(false);
    expect(report.alerts).toHaveLength(0);
    expect(report.jobsTriggered).toHaveLength(0);
  });

  it('does not send email when all healthy', async () => {
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'success', completedAt: new Date() })
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });
    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        Array(10).fill(null).map((_, i) => ({ id: `run-${i}`, status: 'success' }))
      );

    await runSupervisorChecks(false);

    // fetch should NOT be called for email sending
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // --- Stuck jobs ---

  it('detects stuck jobs (running >10min) and marks them as failed', async () => {
    const stuckJob = {
      id: 'stuck-1',
      jobName: 'daily-filings-rss',
      status: 'running',
      startedAt: new Date(Date.now() - 15 * 60 * 1000),
    };

    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([stuckJob]) // stuck jobs
      .mockResolvedValueOnce([]); // last 10 runs
    prismaMock.cronJobRun.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'success', completedAt: new Date() })
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });

    // Mock the retry fetch
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Success' }), { status: 200 })
    );

    const report = await runSupervisorChecks(false);

    expect(report.stuckJobsFixed).toBe(1);
    expect(report.actions).toContain('Fixed 1 stuck jobs');
    expect(prismaMock.cronJobRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      })
    );
  });

  it('auto-retries stuck jobs via fetch', async () => {
    const stuckJob = {
      id: 'stuck-1',
      jobName: 'daily-filings-rss',
      status: 'running',
      startedAt: new Date(Date.now() - 15 * 60 * 1000),
    };

    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([stuckJob])
      .mockResolvedValueOnce([]);
    prismaMock.cronJobRun.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'success', completedAt: new Date() })
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Retried OK' }), { status: 200 })
    );

    const report = await runSupervisorChecks(false);

    expect(report.jobsTriggered).toContain('daily-filings-rss (retry)');
    // fetch called for retry + email alert
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/cron/daily-filings-rss'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  // --- Missing daily filings ---

  it('detects missing daily filings (>30h gap)', async () => {
    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([]) // no stuck jobs
      .mockResolvedValueOnce([]); // last 10 runs
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce(null) // daily-filings: NO recent success
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() }); // analyst OK

    const report = await runSupervisorChecks(false);

    expect(report.missingDailyFilings).toBe(true);
    expect(report.alerts).toEqual(
      expect.arrayContaining([
        expect.stringContaining('daily-filings-rss has not run successfully'),
      ])
    );
  });

  it('auto-triggers missing jobs when autoTriggerMissing=true', async () => {
    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce(null) // missing daily filings
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Triggered' }), { status: 200 })
    );

    const report = await runSupervisorChecks(true);

    expect(report.jobsTriggered).toContain('daily-filings-rss');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/cron/daily-filings-rss'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'supervisor-auto-trigger',
        }),
      })
    );
  });

  it('does NOT auto-trigger when autoTriggerMissing=false', async () => {
    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce(null) // missing daily filings
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });

    const report = await runSupervisorChecks(false);

    expect(report.missingDailyFilings).toBe(true);
    expect(report.jobsTriggered).not.toContain('daily-filings-rss');
  });

  // --- Missing analyst data ---

  it('detects missing analyst data (>48h) on weekdays', async () => {
    // Force to a weekday
    const wednesday = new Date('2024-12-04T12:00:00Z'); // Wednesday
    vi.setSystemTime(wednesday);

    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'success', completedAt: new Date() }) // daily filings OK
      .mockResolvedValueOnce(null); // analyst data missing

    const report = await runSupervisorChecks(false);

    expect(report.missingAnalystUpdate).toBe(true);
    expect(report.alerts).toEqual(
      expect.arrayContaining([
        expect.stringContaining('update-analyst-data has not run successfully'),
      ])
    );

    vi.useRealTimers();
  });

  it('skips analyst data check on weekends', async () => {
    const sunday = new Date('2024-12-01T12:00:00Z'); // Sunday
    vi.setSystemTime(sunday);

    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'success', completedAt: new Date() }) // daily filings
      .mockResolvedValueOnce(null); // analyst data missing

    const report = await runSupervisorChecks(false);

    // On weekend, missing analyst data should NOT be flagged
    expect(report.missingAnalystUpdate).toBe(false);

    vi.useRealTimers();
  });

  // --- High failure rate ---

  it('detects high failure rate (>50% in last 10 runs)', async () => {
    const runs = [
      ...Array(7).fill(null).map((_, i) => ({ id: `f-${i}`, status: 'failed' })),
      ...Array(3).fill(null).map((_, i) => ({ id: `s-${i}`, status: 'success' })),
    ];

    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([]) // no stuck jobs
      .mockResolvedValueOnce(runs); // 70% failure rate
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'success', completedAt: new Date() })
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });

    const report = await runSupervisorChecks(false);

    expect(report.alerts).toEqual(
      expect.arrayContaining([
        expect.stringContaining('High failure rate'),
      ])
    );
  });

  it('does not flag failure rate when under 50%', async () => {
    const runs = [
      ...Array(4).fill(null).map((_, i) => ({ id: `f-${i}`, status: 'failed' })),
      ...Array(6).fill(null).map((_, i) => ({ id: `s-${i}`, status: 'success' })),
    ];

    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(runs);
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'success', completedAt: new Date() })
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });

    const report = await runSupervisorChecks(false);

    expect(report.alerts.find(a => a.includes('High failure rate'))).toBeUndefined();
  });

  // --- Email alerts ---

  it('sends email alert via Resend when issues found', async () => {
    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce(null) // missing daily filings -> alert
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-001' }), { status: 200 })
    );

    await runSupervisorChecks(false);

    // Should have called fetch for email
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('[SEC Filing Analyzer]'),
      })
    );
  });

  // --- Error handling ---

  it('handles Prisma query errors gracefully', async () => {
    prismaMock.cronJobRun.findMany.mockRejectedValue(new Error('DB connection failed'));

    // Supervisor should throw and also try to send email alert
    await expect(runSupervisorChecks(false)).rejects.toThrow('DB connection failed');

    // Should still attempt to send failure email
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Supervisor Health Check Failed'),
      })
    );
  });

  it('handles fetch errors (auto-trigger) gracefully', async () => {
    const stuckJob = {
      id: 'stuck-1',
      jobName: 'daily-filings-rss',
      status: 'running',
      startedAt: new Date(Date.now() - 15 * 60 * 1000),
    };

    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([stuckJob])
      .mockResolvedValueOnce([]);
    prismaMock.cronJobRun.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'success', completedAt: new Date() })
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });

    // First fetch: retry fails, Second fetch: email
    fetchSpy
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'email-001' }), { status: 200 }));

    const report = await runSupervisorChecks(false);

    // Should have captured the error gracefully
    expect(report.actions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Error retrying daily-filings-rss'),
      ])
    );
  });

  it('handles Resend API errors gracefully', async () => {
    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce(null) // missing daily filings
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });

    fetchSpy.mockResolvedValue(
      new Response('Unauthorized', { status: 401 })
    );

    // Should NOT throw even if email fails
    const report = await runSupervisorChecks(false);
    expect(report.missingDailyFilings).toBe(true);
  });

  it('includes timestamp in report', async () => {
    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'success', completedAt: new Date() })
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });

    const report = await runSupervisorChecks(false);

    expect(report.timestamp).toBeDefined();
    expect(new Date(report.timestamp).getTime()).not.toBeNaN();
  });

  it('handles non-retryable stuck job names gracefully', async () => {
    const stuckJob = {
      id: 'stuck-1',
      jobName: 'update-stock-prices', // Not in the retry map
      status: 'running',
      startedAt: new Date(Date.now() - 15 * 60 * 1000),
    };

    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([stuckJob])
      .mockResolvedValueOnce([]);
    prismaMock.cronJobRun.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'success', completedAt: new Date() })
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });

    const report = await runSupervisorChecks(false);

    // Should mark as fixed but not try to retry (no jobPath)
    expect(report.stuckJobsFixed).toBe(1);
    expect(report.jobsTriggered).not.toContain('update-stock-prices (retry)');
  });

  it('handles auto-trigger fetch returning non-OK response', async () => {
    prismaMock.cronJobRun.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.cronJobRun.findFirst
      .mockResolvedValueOnce(null) // missing daily filings
      .mockResolvedValueOnce({ id: 'r2', status: 'success', completedAt: new Date() });

    fetchSpy
      .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 })) // trigger fails
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'email-001' }), { status: 200 })); // email OK

    const report = await runSupervisorChecks(true);

    expect(report.actions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Failed to trigger daily-filings-rss'),
      ])
    );
  });
});
