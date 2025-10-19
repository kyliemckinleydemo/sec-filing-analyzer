import { NextResponse } from 'next/server';
import { PaperTradingEngine, TradeSignal } from '@/lib/paper-trading';

export const dynamic = 'force-dynamic';

/**
 * Execute a paper trading signal
 *
 * Called after ML model analyzes a filing
 * POST /api/paper-trading/execute-signal
 *
 * Body:
 * {
 *   portfolioId: string,
 *   ticker: string,
 *   filingId: string,
 *   predictedReturn: number,
 *   confidence: number,
 *   direction: 'LONG' | 'SHORT',
 *   marketCap?: number
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { portfolioId, ...signal } = body as { portfolioId: string } & TradeSignal;

    if (!portfolioId || !signal.ticker || !signal.filingId) {
      return NextResponse.json(
        { error: 'Missing required fields: portfolioId, ticker, filingId' },
        { status: 400 }
      );
    }

    const engine = new PaperTradingEngine(portfolioId);

    // Evaluate if we should trade
    const shouldTrade = await engine.evaluateTradeSignal(signal);

    if (!shouldTrade) {
      return NextResponse.json({
        executed: false,
        reason: 'Signal did not meet trading criteria'
      });
    }

    // Execute the trade
    const result = await engine.executeTrade(signal);

    if (result.success) {
      return NextResponse.json({
        executed: true,
        trade: result.details,
        tradeId: result.tradeId
      });
    } else {
      return NextResponse.json({
        executed: false,
        reason: result.reason
      });
    }

  } catch (error: any) {
    console.error('[Paper Trading] Error executing signal:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
