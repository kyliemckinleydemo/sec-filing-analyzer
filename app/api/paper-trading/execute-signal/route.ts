/**
 * @module app/api/paper-trading/execute-signal/route
 * @description Next.js API route that receives ML-generated trade signals and executes paper trades through the PaperTradingEngine with validation and criteria evaluation
 *
 * PURPOSE:
 * - Receives POST requests containing ML model predictions (ticker, direction, confidence) for a specific SEC filing
 * - Validates required fields (portfolioId, ticker, filingId) and returns 400 error if missing
 * - Evaluates whether trade signal meets criteria via PaperTradingEngine.evaluateTradeSignal()
 * - Executes approved trades using PaperTradingEngine.executeTrade() and returns trade details with ID
 *
 * DEPENDENCIES:
 * - next/server - Provides NextResponse for API route responses with JSON serialization
 * - @/lib/paper-trading - Imports PaperTradingEngine class for trade execution and TradeSignal type definition
 *
 * EXPORTS:
 * - dynamic (const) - Next.js config forcing dynamic rendering to prevent route caching
 * - POST (function) - Async handler accepting Request with TradeSignal body, returns NextResponse with execution result
 *
 * PATTERNS:
 * - POST to /api/paper-trading/execute-signal with JSON body: { portfolioId, ticker, filingId, predictedReturn, confidence, direction, marketCap? }
 * - Response contains { executed: boolean, trade?: object, tradeId?: string, reason?: string }
 * - Returns 400 if portfolioId/ticker/filingId missing, 500 on engine errors
 * - Instantiate PaperTradingEngine(portfolioId) then call evaluateTradeSignal() before executeTrade()
 *
 * CLAUDE NOTES:
 * - Two-phase execution: evaluateTradeSignal() gates whether trade proceeds, preventing low-confidence signals from executing
 * - TradeSignal destructured from body excludes portfolioId which is passed separately to engine constructor
 * - Returns executed: false with reason string rather than error status when signal fails criteria or execution
 * - marketCap is optional field allowing position sizing based on company size
 */
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
