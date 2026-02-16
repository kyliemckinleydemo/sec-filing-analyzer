import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../../mocks/prisma';
import { MOCK_PAPER_PORTFOLIO } from '../../../fixtures/cron-data';

// Mock PaperTradingEngine - track constructor calls manually
const { mockCloseExpiredPositions, mockUpdatePortfolioMetrics, engineConstructorCalls } = vi.hoisted(() => ({
  mockCloseExpiredPositions: vi.fn().mockResolvedValue(0),
  mockUpdatePortfolioMetrics: vi.fn().mockResolvedValue(undefined),
  engineConstructorCalls: [] as string[],
}));

vi.mock('@/lib/paper-trading', () => {
  function PaperTradingEngine(portfolioId: string) {
    engineConstructorCalls.push(portfolioId);
    return {
      closeExpiredPositions: mockCloseExpiredPositions,
      updatePortfolioMetrics: mockUpdatePortfolioMetrics,
    };
  }
  return { PaperTradingEngine };
});

import { GET } from '@/app/api/cron/paper-trading-close-positions/route';
import { NextRequest } from 'next/server';

const CRON_URL = 'http://localhost:3000/api/cron/paper-trading-close-positions';

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest(CRON_URL, { headers });
}

function makeAuthRequest() {
  return makeRequest({ authorization: 'Bearer test-cron-secret' });
}

describe('GET /api/cron/paper-trading-close-positions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    engineConstructorCalls.length = 0;
    prismaMock.paperPortfolio.findMany.mockResolvedValue([]);
    mockCloseExpiredPositions.mockResolvedValue(0);
    mockUpdatePortfolioMetrics.mockResolvedValue(undefined);
  });

  // --- Auth ---

  it('returns 401 without CRON_SECRET', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid auth', async () => {
    const res = await GET(makeRequest({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  // --- Success ---

  it('returns 200 and closes expired positions', async () => {
    prismaMock.paperPortfolio.findMany.mockResolvedValue([MOCK_PAPER_PORTFOLIO]);
    mockCloseExpiredPositions.mockResolvedValue(3);

    const res = await GET(makeAuthRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.results.positionsClosed).toBe(3);
    expect(body.results.portfolios).toBe(1);
  });

  it('updates portfolio metrics after closing positions', async () => {
    prismaMock.paperPortfolio.findMany.mockResolvedValue([MOCK_PAPER_PORTFOLIO]);

    await GET(makeAuthRequest());

    expect(mockUpdatePortfolioMetrics).toHaveBeenCalled();
  });

  it('creates PaperTradingEngine with correct portfolio ID', async () => {
    prismaMock.paperPortfolio.findMany.mockResolvedValue([MOCK_PAPER_PORTFOLIO]);

    await GET(makeAuthRequest());

    expect(engineConstructorCalls).toContain('portfolio-001');
  });

  it('processes multiple portfolios', async () => {
    const portfolio2 = { ...MOCK_PAPER_PORTFOLIO, id: 'portfolio-002', name: 'Conservative' };
    prismaMock.paperPortfolio.findMany.mockResolvedValue([MOCK_PAPER_PORTFOLIO, portfolio2]);
    mockCloseExpiredPositions.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.results.positionsClosed).toBe(3);
    expect(body.results.portfolios).toBe(2);
  });

  // --- Edge cases ---

  it('handles no expired positions gracefully', async () => {
    prismaMock.paperPortfolio.findMany.mockResolvedValue([MOCK_PAPER_PORTFOLIO]);
    mockCloseExpiredPositions.mockResolvedValue(0);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results.positionsClosed).toBe(0);
  });

  it('handles no active portfolios', async () => {
    prismaMock.paperPortfolio.findMany.mockResolvedValue([]);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results.portfolios).toBe(0);
    expect(body.results.positionsClosed).toBe(0);
  });

  it('handles engine errors per portfolio (continues to next)', async () => {
    const portfolio2 = { ...MOCK_PAPER_PORTFOLIO, id: 'portfolio-002', name: 'Conservative' };
    prismaMock.paperPortfolio.findMany.mockResolvedValue([MOCK_PAPER_PORTFOLIO, portfolio2]);

    mockCloseExpiredPositions
      .mockRejectedValueOnce(new Error('Yahoo Finance error'))
      .mockResolvedValueOnce(2);

    const res = await GET(makeAuthRequest());
    const body = await res.json();

    // Should still succeed, processing portfolio2 after portfolio1 error
    expect(body.success).toBe(true);
    expect(body.results.positionsClosed).toBe(2);
  });

  it('handles Prisma error (fatal)', async () => {
    prismaMock.paperPortfolio.findMany.mockRejectedValue(new Error('DB error'));

    const res = await GET(makeAuthRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe('DB error');
  });
});
