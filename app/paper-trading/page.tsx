/**
 * @module app/paper-trading/page
 * @description Next.js client page displaying real-time paper trading portfolio performance with open positions, trade history, and performance metrics refreshed every 60 seconds
 *
 * PURPOSE:
 * - Fetch and auto-refresh portfolio data from /api/paper-trading/portfolio/{id} endpoint every minute
 * - Display portfolio overview showing total value, win rate, and available cash with color-coded gains/losses
 * - Render open positions table with entry/current prices, unrealized P&L percentages, and days held counter
 * - Show recent closed trades table with realized profit/loss and exit dates
 *
 * DEPENDENCIES:
 * - react - Provides useState for portfolio data/loading/error state and useEffect for 60-second polling interval
 *
 * EXPORTS:
 * - PaperTradingPage (component) - Default export rendering full portfolio dashboard with auto-refresh
 * - MetricCard (component) - Internal helper displaying title, value, subtitle with conditional green/red styling
 * - Position (interface) - Open position shape with ticker, shares, entry/current prices, P&L, days held, and ML predictions
 * - Trade (interface) - Closed trade shape with entry/exit prices, realized P&L, predicted vs actual returns
 * - PortfolioData (interface) - Complete API response shape containing portfolio summary, positions array, trades array, and statistics
 *
 * PATTERNS:
 * - Navigate to /paper-trading route to view dashboard; data automatically polls API every 60 seconds
 * - Portfolio ID is hardcoded as 'cmgu5ysgx0000boh27mxywid1' in PORTFOLIO_ID constant
 * - Component shows 'Loading portfolio...' state initially, then error banner on fetch failure, then full dashboard
 * - Tables use responsive Tailwind classes with hover effects and color-coded P&L (green for positive, red for negative)
 *
 * CLAUDE NOTES:
 * - Uses setInterval for 60-second auto-refresh with cleanup in useEffect return to prevent memory leaks
 * - Hardcoded portfolio ID prevents multi-user support - would need route params or auth context for production
 * - Open positions show 'X/7' days held indicating positions automatically close after 7 days
 * - No manual trade execution UI - appears to be read-only dashboard for automated trading system performance
 * - Empty states provide context: 'Waiting for next SEC filing' suggests trades trigger from SEC filings data
 */
'use client';

import { useEffect, useState } from 'react';

const PORTFOLIO_ID = 'cmgu5ysgx0000boh27mxywid1';

interface Position {
  ticker: string;
  shares: number;
  entryPrice: number;
  entryDate: string;
  currentPrice: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  daysHeld: number;
  predictedReturn: number;
  confidence: number;
}

interface Trade {
  ticker: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  realizedPnL: number;
  realizedPnLPct: number;
  predictedReturn: number;
  actualReturn: number;
  exitDate: string;
}

interface PortfolioData {
  portfolio: {
    name: string;
    startingCapital: number;
    currentCash: number;
    totalValue: number;
    totalReturn: number;
    winRate: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
  };
  openPositions: Position[];
  recentTrades: Trade[];
  stats: {
    modelAccuracy: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    avgHoldDays: number;
    bestTrade: Trade | null;
    worstTrade: Trade | null;
  };
}

export default function PaperTradingPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const fetchPortfolio = async () => {
    try {
      const response = await fetch(`/api/paper-trading/portfolio/${PORTFOLIO_ID}`);
      if (!response.ok) {
        throw new Error('Failed to fetch portfolio');
      }
      const portfolioData = await response.json();
      setData(portfolioData);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">Loading portfolio...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            Error: {error}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { portfolio, openPositions, recentTrades, stats } = data;
  const totalPositionValue = openPositions.reduce((sum, p) => sum + p.currentValue, 0);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{portfolio.name}</h1>
          <p className="text-gray-600">Paper Trading Performance Tracker</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Total Value"
            value={`$${portfolio.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtitle={`${portfolio.totalReturn >= 0 ? '+' : ''}${portfolio.totalReturn.toFixed(2)}% return`}
            positive={portfolio.totalReturn >= 0}
          />
          <MetricCard
            title="Win Rate"
            value={`${portfolio.winRate.toFixed(1)}%`}
            subtitle={`${portfolio.winningTrades}W / ${portfolio.losingTrades}L (${portfolio.totalTrades} total)`}
            positive={portfolio.winRate >= 50}
          />
          <MetricCard
            title="Cash Available"
            value={`$${portfolio.currentCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtitle={`${openPositions.length} open position${openPositions.length !== 1 ? 's' : ''}`}
          />
        </div>

        {/* Open Positions */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Open Positions ({openPositions.length})
          </h2>
          {openPositions.length === 0 ? (
            <p className="text-gray-500">No open positions. Waiting for next SEC filing...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Entry Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">P&L</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Days Held</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {openPositions.map((position, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                        {position.ticker}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-gray-700">
                        ${position.entryPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-gray-700">
                        ${position.currentPrice.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-right font-medium ${
                        position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        ${position.unrealizedPnL.toFixed(2)}<br/>
                        <span className="text-sm">({position.unrealizedPnLPct >= 0 ? '+' : ''}{position.unrealizedPnLPct.toFixed(2)}%)</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-gray-700">
                        {position.daysHeld}/7
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Trades */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Recent Trades
          </h2>
          {recentTrades.length === 0 ? (
            <p className="text-gray-500">No closed trades yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Entry</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Exit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">P&L</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentTrades.map((trade, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                        {trade.ticker}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-gray-700">
                        ${trade.entryPrice?.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-gray-700">
                        ${trade.exitPrice?.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-right font-medium ${
                        trade.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        ${trade.realizedPnL?.toFixed(2)}<br/>
                        <span className="text-sm">({trade.realizedPnLPct >= 0 ? '+' : ''}{trade.realizedPnLPct?.toFixed(2)}%)</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                        {new Date(trade.exitDate).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  positive?: boolean;
}

function MetricCard({ title, value, subtitle, positive }: MetricCardProps) {
  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
      <p className={`text-2xl font-bold ${
        positive === undefined ? 'text-gray-900' :
        positive ? 'text-green-600' : 'text-red-600'
      }`}>
        {value}
      </p>
      <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
    </div>
  );
}
