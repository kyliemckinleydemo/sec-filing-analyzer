/**
 * @module app/api/backtest/route
 * @description API endpoint performing backtesting to evaluate prediction model accuracy by comparing predicted vs actual 7-day returns on historical SEC filings with financial data
 *
 * PURPOSE:
 * - Query filings from Prisma database filtered by optional ticker symbol, filing type, and presence of both predicted and actual return values
 * - Filter results to only include filings containing financial data (EPS, revenue, guidance) using hasFinancialData utility
 * - Calculate per-filing accuracy metrics including absolute error, error percentage, direction correctness, and accuracy labels
 * - Compute aggregate statistics including direction accuracy rate, average error, and distribution across 'Excellent/Good/Fair/Poor' accuracy tiers
 *
 * DEPENDENCIES:
 * - @/lib/prisma - Provides database client for querying Filing and Company tables with relational includes
 * - @/lib/accuracy-tracker - Supplies getAccuracyLabel function to categorize error percentages into human-readable tiers
 * - @/lib/filing-utils - Exports hasFinancialData validator checking if filing contains EPS, revenue, or guidance fields
 *
 * EXPORTS:
 * - GET (function) - Next.js route handler accepting ticker, limit (default 10), and optional filingType query params, returning JSON with backtestResults array and summary statistics object
 *
 * PATTERNS:
 * - Call via GET /api/backtest?ticker=AAPL&limit=10&filingType=10-K to test model accuracy on Apple's annual reports
 * - Endpoint returns 404 if ticker not found, 200 with empty results if no qualifying filings exist, or 500 on database/processing errors
 * - Response includes results array with per-filing metrics (error, errorPercent, correctDirection, accuracy label) plus summary with directionAccuracy percentage and accuracyDistribution counts
 *
 * CLAUDE NOTES:
 * - Fetches 3x the requested limit initially, then filters to only filings with financial data - this oversampling prevents returning fewer results than requested when many filings lack financial info
 * - Direction accuracy checks if prediction and actual have same sign (both positive or both negative), independent of magnitude - useful for trading signals even if magnitude predictions are imperfect
 * - Requires both predicted7dReturn and actual7dReturn to be non-null in database query - filings without completed prediction-observation cycles are excluded from backtest validation
 * - Error percentage calculation divides absolute error by absolute actual return, making it scale-invariant - a 2% error matters more on a 3% move than a 20% move
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { accuracyTracker } from '@/lib/accuracy-tracker';
import { hasFinancialData } from '@/lib/filing-utils';

/**
 * Backtest the prediction model against historical filings
 * v1.0: Only includes filings with financial data (EPS, revenue, guidance)
 *
 * GET /api/backtest?ticker=AAPL&limit=10
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const limit = parseInt(searchParams.get('limit') || '10');
    const filingType = searchParams.get('filingType'); // Optional filter

    // Build query
    const where: any = {};

    if (ticker) {
      const company = await prisma.company.findFirst({
        where: { ticker: ticker.toUpperCase() },
      });

      if (company) {
        where.companyId = company.id;
      } else {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
    }

    if (filingType) {
      where.filingType = filingType;
    }

    // Only include filings with predictions and actual returns
    where.predicted7dReturn = { not: null };
    where.actual7dReturn = { not: null };

    // Fetch filings with predictions
    const allFilings = await prisma.filing.findMany({
      where,
      include: {
        company: true,
      },
      orderBy: {
        filingDate: 'desc',
      },
      take: limit * 3, // Fetch more to filter for financial data
    });

    // v1.0: Filter to only filings with financial data
    const filings = allFilings
      .filter(filing => hasFinancialData(filing))
      .slice(0, limit);

    if (filings.length === 0) {
      return NextResponse.json({
        message: 'No filings with predictions and actual returns found',
        backtestResults: [],
        summary: null,
      });
    }

    // Calculate accuracy metrics for each filing
    const results = filings.map(filing => {
      const error = Math.abs((filing.predicted7dReturn || 0) - (filing.actual7dReturn || 0));
      const errorPercent = filing.actual7dReturn
        ? (error / Math.abs(filing.actual7dReturn)) * 100
        : 0;

      const predictionSign = (filing.predicted7dReturn || 0) > 0 ? 'positive' : 'negative';
      const actualSign = (filing.actual7dReturn || 0) > 0 ? 'positive' : 'negative';
      const correctDirection = predictionSign === actualSign;

      return {
        accessionNumber: filing.accessionNumber,
        ticker: filing.company.ticker,
        filingType: filing.filingType,
        filingDate: filing.filingDate,
        predicted7dReturn: filing.predicted7dReturn,
        actual7dReturn: filing.actual7dReturn,
        error,
        errorPercent,
        correctDirection,
        accuracy: accuracyTracker.getAccuracyLabel(errorPercent),
      };
    });

    // Calculate summary statistics
    const totalFilings = results.length;
    const correctDirections = results.filter(r => r.correctDirection).length;
    const directionAccuracy = (correctDirections / totalFilings) * 100;

    const avgError = results.reduce((sum, r) => sum + r.error, 0) / totalFilings;
    const avgErrorPercent = results.reduce((sum, r) => sum + r.errorPercent, 0) / totalFilings;

    const excellentCount = results.filter(r => r.accuracy === 'Excellent').length;
    const goodCount = results.filter(r => r.accuracy === 'Good').length;
    const fairCount = results.filter(r => r.accuracy === 'Fair').length;
    const poorCount = results.filter(r => r.accuracy === 'Poor').length;

    const summary = {
      totalFilings,
      ticker: ticker || 'All',
      filingType: filingType || 'All',
      directionAccuracy: directionAccuracy.toFixed(1) + '%',
      correctDirections,
      wrongDirections: totalFilings - correctDirections,
      avgError: avgError.toFixed(2) + '%',
      avgErrorPercent: avgErrorPercent.toFixed(1) + '%',
      accuracyDistribution: {
        excellent: excellentCount,
        good: goodCount,
        fair: fairCount,
        poor: poorCount,
      },
      accuracyPercentages: {
        excellent: ((excellentCount / totalFilings) * 100).toFixed(1) + '%',
        good: ((goodCount / totalFilings) * 100).toFixed(1) + '%',
        fair: ((fairCount / totalFilings) * 100).toFixed(1) + '%',
        poor: ((poorCount / totalFilings) * 100).toFixed(1) + '%',
      },
    };

    return NextResponse.json({
      backtestResults: results,
      summary,
    });
  } catch (error: any) {
    console.error('Error running backtest:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run backtest' },
      { status: 500 }
    );
  }
}
