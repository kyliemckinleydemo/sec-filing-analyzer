import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../../mocks/prisma';

vi.mock('yahoo-finance2', () => ({
  default: {
    quote: vi.fn(),
    chart: vi.fn(),
  },
}));

import { PaperTradingEngine } from '@/lib/paper-trading';
import type { TradeSignal } from '@/lib/paper-trading';
import yahooFinance from 'yahoo-finance2';

const PORTFOLIO_ID = 'portfolio-001';

const MOCK_PORTFOLIO = {
  id: PORTFOLIO_ID,
  name: 'Test Portfolio',
  isActive: true,
  startingCapital: 100_000,
  currentCash: 100_000,
  totalValue: 100_000,
  maxPositionSize: 0.10,
  minConfidence: 0.60,
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
};

const VALID_SIGNAL: TradeSignal = {
  ticker: 'AAPL',
  filingId: 'filing-001',
  predictedReturn: 2.5,
  confidence: 0.85,
  direction: 'LONG',
};

describe('PaperTradingEngine.evaluateTradeSignal', () => {
  let engine: PaperTradingEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new PaperTradingEngine(PORTFOLIO_ID);
  });

  it('rejects signal when portfolio is inactive', async () => {
    prismaMock.paperPortfolio.findUnique.mockResolvedValue({
      ...MOCK_PORTFOLIO,
      isActive: false,
    });

    const result = await engine.evaluateTradeSignal(VALID_SIGNAL);
    expect(result).toBe(false);
  });

  it('rejects signal when portfolio not found', async () => {
    prismaMock.paperPortfolio.findUnique.mockResolvedValue(null);

    const result = await engine.evaluateTradeSignal(VALID_SIGNAL);
    expect(result).toBe(false);
  });

  it('rejects signal below confidence threshold', async () => {
    prismaMock.paperPortfolio.findUnique.mockResolvedValue(MOCK_PORTFOLIO);
    prismaMock.paperTrade.findFirst.mockResolvedValue(null);

    const lowConfSignal = { ...VALID_SIGNAL, confidence: 0.4 };
    const result = await engine.evaluateTradeSignal(lowConfSignal);
    expect(result).toBe(false);
  });

  it('rejects signal when existing open position exists', async () => {
    prismaMock.paperPortfolio.findUnique.mockResolvedValue(MOCK_PORTFOLIO);
    prismaMock.paperTrade.findFirst.mockResolvedValue({
      id: 'trade-existing',
      ticker: 'AAPL',
      status: 'OPEN',
    });

    const result = await engine.evaluateTradeSignal(VALID_SIGNAL);
    expect(result).toBe(false);
  });

  it('rejects signal when predicted return < 0.5%', async () => {
    prismaMock.paperPortfolio.findUnique.mockResolvedValue(MOCK_PORTFOLIO);
    prismaMock.paperTrade.findFirst.mockResolvedValue(null);

    const smallReturnSignal = { ...VALID_SIGNAL, predictedReturn: 0.3 };
    const result = await engine.evaluateTradeSignal(smallReturnSignal);
    expect(result).toBe(false);
  });

  it('accepts valid signal meeting all criteria', async () => {
    prismaMock.paperPortfolio.findUnique.mockResolvedValue(MOCK_PORTFOLIO);
    prismaMock.paperTrade.findFirst.mockResolvedValue(null);

    const result = await engine.evaluateTradeSignal(VALID_SIGNAL);
    expect(result).toBe(true);
  });
});

describe('PaperTradingEngine.closeTrade', () => {
  let engine: PaperTradingEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new PaperTradingEngine(PORTFOLIO_ID);
  });

  it('calculates LONG P&L correctly (shares * exitPrice - entryValue - commissions)', async () => {
    const mockTrade = {
      id: 'trade-001',
      portfolioId: PORTFOLIO_ID,
      ticker: 'AAPL',
      direction: 'LONG',
      entryPrice: 150,
      shares: 10,
      entryValue: 1500, // 10 * 150
      entryCommission: 1.0,
      predictedReturn: 2.0,
      status: 'OPEN',
      notes: 'Test trade',
    };

    prismaMock.paperTrade.findUnique.mockResolvedValue(mockTrade);
    prismaMock.paperTrade.update.mockResolvedValue({});
    prismaMock.paperPortfolio.findUnique.mockResolvedValue(MOCK_PORTFOLIO);
    prismaMock.paperPortfolio.update.mockResolvedValue({});

    // Current price is $160 (up from $150 entry)
    vi.mocked(yahooFinance.quote).mockResolvedValue({
      regularMarketPrice: 160,
    } as any);

    const result = await engine.closeTrade('trade-001');
    expect(result.success).toBe(true);

    // P&L: exitValue(10*160=1600) - entryValue(1500) - entryCommission(1) - exitCommission(1) = 98
    expect(result.details.realizedPnL).toBeCloseTo(98, 2);
  });

  it('calculates SHORT P&L correctly (entryValue - exitValue - commissions)', async () => {
    const mockTrade = {
      id: 'trade-002',
      portfolioId: PORTFOLIO_ID,
      ticker: 'TSLA',
      direction: 'SHORT',
      entryPrice: 200,
      shares: 5,
      entryValue: 1000, // 5 * 200
      entryCommission: 1.0,
      predictedReturn: -3.0,
      status: 'OPEN',
      notes: 'Short trade',
    };

    prismaMock.paperTrade.findUnique.mockResolvedValue(mockTrade);
    prismaMock.paperTrade.update.mockResolvedValue({});
    prismaMock.paperPortfolio.findUnique.mockResolvedValue(MOCK_PORTFOLIO);
    prismaMock.paperPortfolio.update.mockResolvedValue({});

    // Current price is $180 (down from $200 entry — profitable short)
    vi.mocked(yahooFinance.quote).mockResolvedValue({
      regularMarketPrice: 180,
    } as any);

    const result = await engine.closeTrade('trade-002');
    expect(result.success).toBe(true);

    // P&L: entryValue(1000) - exitValue(5*180=900) - entryCommission(1) - exitCommission(1) = 98
    expect(result.details.realizedPnL).toBeCloseTo(98, 2);
  });

  it('fails for non-existent trade', async () => {
    prismaMock.paperTrade.findUnique.mockResolvedValue(null);

    const result = await engine.closeTrade('nonexistent-trade');
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/not found|already closed/i);
  });

  it('fails for already closed trade', async () => {
    prismaMock.paperTrade.findUnique.mockResolvedValue({
      id: 'trade-003',
      status: 'CLOSED',
    });

    const result = await engine.closeTrade('trade-003');
    expect(result.success).toBe(false);
  });

  it('fails for pending trade without entry data', async () => {
    prismaMock.paperTrade.findUnique.mockResolvedValue({
      id: 'trade-004',
      status: 'OPEN',
      entryPrice: null,
      shares: null,
      entryValue: null,
    });

    const result = await engine.closeTrade('trade-004');
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/pending/i);
  });
});
