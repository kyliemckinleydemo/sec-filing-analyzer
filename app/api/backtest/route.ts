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
