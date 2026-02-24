/**
 * @module app/backtest/page
 * @description Next.js page component that renders an interactive backtesting interface for evaluating ML model prediction accuracy against historical SEC filing data with real-time API integration
 *
 * PURPOSE:
 * - Fetch backtest results from /api/backtest endpoint with ticker symbol and limit=20 parameter
 * - Display aggregate statistics including direction accuracy, average error percentages, and accuracy distribution across four tiers (excellent/good/fair/poor)
 * - Render detailed results table showing predicted vs actual 7-day returns for each filing with color-coded direction indicators
 * - Manage loading states, error handling, and conditional UI rendering based on API response success/failure
 *
 * DEPENDENCIES:
 * - react - useState for ticker input, loading state, results/summary data, and error messages; useEffect for component lifecycle
 * - @/components/ui/card - Provides Card, CardContent, CardHeader, CardTitle, CardDescription for structured layout sections
 * - @/components/ui/button - Provides Button component for navigation and backtest trigger action
 * - next/navigation - useRouter hook for programmatic navigation back to home page
 *
 * EXPORTS:
 * - BacktestPage (component, default) - Client-side page component that manages backtest workflow from ticker input through results display
 *
 * PATTERNS:
 * - Access at /backtest route; enter ticker symbol (auto-uppercased) and click 'Run Backtest' button
 * - Component fetches GET /api/backtest?ticker=AAPL&limit=20 and displays BacktestResult[] array plus BacktestSummary statistics
 * - Results table color-codes predicted/actual returns (green for positive, red for negative) and shows accuracy badges (excellent/good/fair/poor)
 * - Error state displays red-bordered card with error message from API response or generic failure message
 *
 * CLAUDE NOTES:
 * - Hardcoded limit=20 parameter restricts backtest to most recent 20 filings per ticker
 * - Accuracy tiers categorize predictions: excellent (<5% error), good (5-15%), fair (15-30%), poor (>30%)
 * - Direction accuracy counts correct/wrong sign predictions separately from magnitude accuracy metrics
 * - Empty results array triggers special message explaining 7-day waiting period needed for actual returns calculation
 * - All monetary values display with 2 decimal precision; percentages use fixed(2) formatting throughout
 */
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface BacktestResult {
  accessionNumber: string;
  ticker: string;
  filingType: string;
  filingDate: string;
  predicted7dReturn: number;
  actual7dReturn: number;
  error: number;
  errorPercent: number;
  correctDirection: boolean;
  accuracy: string;
}

interface BacktestSummary {
  totalFilings: number;
  ticker: string;
  filingType: string;
  directionAccuracy: string;
  correctDirections: number;
  wrongDirections: number;
  avgError: string;
  avgErrorPercent: string;
  accuracyDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  accuracyPercentages: {
    excellent: string;
    good: string;
    fair: string;
    poor: string;
  };
}

export default function BacktestPage() {
  const router = useRouter();
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BacktestResult[] | null>(null);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runBacktest = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/backtest?ticker=${ticker}&limit=20`);

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Backtest API returned an error');
        setResults(null);
        setSummary(null);
        return;
      }

      const data = await response.json();
      setResults(data.backtestResults);
      setSummary(data.summary);
    } catch (error) {
      console.error('Error running backtest:', error);
      setError('Failed to run backtest. Please try again.');
      setResults(null);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="container mx-auto max-w-6xl">
        <Button
          variant="outline"
          onClick={() => router.push('/')}
          className="mb-4"
        >
          ← Back to Home
        </Button>

        <h1 className="text-4xl font-bold mb-2">📊 Model Backtesting</h1>
        <p className="text-lg text-slate-600 mb-8">
          Test prediction accuracy against historical filings
        </p>

        {/* Input Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Run Backtest</CardTitle>
            <CardDescription>Enter a ticker to backtest the model</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="Enter ticker (e.g., AAPL)"
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-500"
              />
              <Button onClick={runBacktest} disabled={loading || !ticker}>
                {loading ? 'Running...' : 'Run Backtest'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="mb-6 border-2 border-red-200 bg-red-50">
            <CardContent className="py-4">
              <p className="text-red-700">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Summary Statistics */}
        {summary && (
          <Card className="mb-6 border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardHeader>
              <CardTitle className="text-2xl">📈 Summary Statistics</CardTitle>
              <CardDescription>
                {summary.ticker} • {summary.totalFilings} Filings • {summary.filingType}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg border border-blue-200">
                  <p className="text-sm text-slate-600 mb-1">Direction Accuracy</p>
                  <p className="text-3xl font-bold text-blue-600">{summary.directionAccuracy}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {summary.correctDirections} correct / {summary.wrongDirections} wrong
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-blue-200">
                  <p className="text-sm text-slate-600 mb-1">Avg Error</p>
                  <p className="text-3xl font-bold text-slate-700">{summary.avgError}</p>
                  <p className="text-xs text-slate-500 mt-1">Absolute difference</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-blue-200">
                  <p className="text-sm text-slate-600 mb-1">Avg Error %</p>
                  <p className="text-3xl font-bold text-slate-700">{summary.avgErrorPercent}</p>
                  <p className="text-xs text-slate-500 mt-1">Relative to actual</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-blue-200">
                  <p className="text-sm text-slate-600 mb-1">Total Filings</p>
                  <p className="text-3xl font-bold text-indigo-600">{summary.totalFilings}</p>
                  <p className="text-xs text-slate-500 mt-1">With predictions</p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold mb-3">Accuracy Distribution</h4>
                <div className="grid md:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-slate-600">Excellent (&lt;5% error)</p>
                    <p className="text-xl font-bold text-green-600">
                      {summary.accuracyDistribution.excellent} ({summary.accuracyPercentages.excellent})
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Good (5-15% error)</p>
                    <p className="text-xl font-bold text-blue-600">
                      {summary.accuracyDistribution.good} ({summary.accuracyPercentages.good})
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Fair (15-30% error)</p>
                    <p className="text-xl font-bold text-yellow-600">
                      {summary.accuracyDistribution.fair} ({summary.accuracyPercentages.fair})
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Poor (&gt;30% error)</p>
                    <p className="text-xl font-bold text-red-600">
                      {summary.accuracyDistribution.poor} ({summary.accuracyPercentages.poor})
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Table */}
        {results && results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Detailed Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3">Filing Date</th>
                      <th className="text-left py-2 px-3">Type</th>
                      <th className="text-right py-2 px-3">Predicted</th>
                      <th className="text-right py-2 px-3">Actual</th>
                      <th className="text-right py-2 px-3">Error</th>
                      <th className="text-center py-2 px-3">Direction</th>
                      <th className="text-center py-2 px-3">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => (
                      <tr
                        key={result.accessionNumber}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="py-2 px-3">
                          {new Date(result.filingDate).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-3">{result.filingType}</td>
                        <td className={`text-right py-2 px-3 font-semibold ${
                          result.predicted7dReturn > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {result.predicted7dReturn > 0 ? '+' : ''}{result.predicted7dReturn.toFixed(2)}%
                        </td>
                        <td className={`text-right py-2 px-3 font-semibold ${
                          result.actual7dReturn > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {result.actual7dReturn > 0 ? '+' : ''}{result.actual7dReturn.toFixed(2)}%
                        </td>
                        <td className="text-right py-2 px-3">{result.error.toFixed(2)}%</td>
                        <td className="text-center py-2 px-3">
                          {result.correctDirection ? '✅' : '❌'}
                        </td>
                        <td className="text-center py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            result.accuracy === 'Excellent' ? 'bg-green-100 text-green-700' :
                            result.accuracy === 'Good' ? 'bg-blue-100 text-blue-700' :
                            result.accuracy === 'Fair' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {result.accuracy}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {results && results.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-slate-600">
              No filings with predictions and actual returns found for {ticker}.
              <br />
              Predictions need 7+ days to calculate actual returns.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
