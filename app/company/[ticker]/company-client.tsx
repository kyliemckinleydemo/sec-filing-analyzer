/**
 * @module app/company/[ticker]/page
 * @description Next.js client page component that fetches and displays a comprehensive company stock snapshot with live market data, price charts, analyst ratings, SEC filings, and news
 *
 * PURPOSE:
 * - Fetches company snapshot data from /api/company/[ticker]/snapshot endpoint on mount
 * - Renders live market metrics including current price, market cap, P/E ratio, 52-week range, and volume
 * - Displays dual-axis price chart comparing stock performance against S&P 500 with filing markers
 * - Shows analyst rating distribution bar chart with buy/hold/sell recommendations breakdown
 * - Lists recent SEC filings with concern levels and predicted 7-day returns from ML model
 * - Presents analyst activity timeline with upgrades/downgrades and target price changes
 * - Renders latest news articles with thumbnails and publication timestamps
 *
 * DEPENDENCIES:
 * - next/navigation - Provides useParams for ticker route parameter and useRouter for programmatic navigation
 * - @/components/ui/card - Shadcn card components for consistent layout containers
 * - @/components/ui/button - Shadcn button component for navigation and actions
 * - @/components/ui/badge - Shadcn badge component for visual tags and labels
 * - recharts - Chart library for rendering LineChart (price history) and AreaChart (analyst ratings) visualizations
 *
 * EXPORTS:
 * - CompanySnapshotPage (default component) - Full-page company overview rendering market data, charts, filings, and news with loading/error states
 *
 * PATTERNS:
 * - Access at /company/[ticker] route where ticker is stock symbol (e.g., /company/AAPL)
 * - Component fetches data on mount via useEffect triggered by ticker parameter change
 * - Click 'Chat with AI' button to navigate to /chat?ticker=[ticker] for interactive analysis
 * - Click 'Back' button or company in filings table to navigate between company pages
 * - Displays loading spinner with company ticker during initial data fetch
 * - Shows error card with navigation options if ticker not found or API fails
 *
 * CLAUDE NOTES:
 * - Implements dual-axis chart showing stock price against S&P 500 baseline with ReferenceDot markers for SEC filing dates
 * - Uses color-coded concern levels (red/yellow/green badges) on filings based on ML model predictions
 * - Calculates analyst upside percentage by comparing current price to mean analyst target price
 * - Displays 52-week range as both text and visual progress bar showing current price position
 * - Formats large numbers dynamically using B/M/K suffixes (e.g., $2.5T, $150M) for readability
 * - Price change shown as absolute dollar amount plus percentage with color coding (green positive, red negative)
 * - Analyst activity shows target price movements with arrow indicators and color-coded action types
 * - News articles rendered with optional thumbnail images and relative timestamps
 */
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, Legend } from 'recharts';

interface NewsArticle {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string | null;
  thumbnail?: string;
}

interface SnapshotData {
  company: {
    ticker: string;
    name: string;
    cik: string;
    sector?: string;
    industry?: string;
  };
  news: NewsArticle[];
  liveData: {
    currentPrice?: number;
    previousClose?: number;
    marketCap?: number;
    volume?: number;
    averageVolume?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    peRatio?: number;
    forwardPE?: number;
    dividendYield?: number;
    beta?: number;
    analystTargetPrice?: number;
    recommendations?: {
      strongBuy?: number;
      buy?: number;
      hold?: number;
      sell?: number;
      strongSell?: number;
    };
    profitMargins?: number;
    revenueGrowth?: number;
    returnOnEquity?: number;
    freeCashflow?: number;
  };
  fundamentals: {
    latestRevenue?: number;
    latestRevenueYoY?: number;
    latestNetIncome?: number;
    latestNetIncomeYoY?: number;
    latestEPS?: number;
    latestEPSYoY?: number;
    latestGrossMargin?: number;
    latestOperatingMargin?: number;
    latestQuarter?: string;
  };
  priceHistory: Array<{
    date: string;
    price: number;
    high?: number | null;
    low?: number | null;
    volume?: number | null;
  }>;
  spxHistory?: Array<{
    date: string;
    price: number;
  }>;
  filings: Array<{
    accessionNumber: string;
    filingType: string;
    filingDate: string;
    concernLevel?: number;
    predicted7dReturn?: number;
    predictionConfidence?: number;
  }>;
  analystActivity: Array<{
    id: string;
    activityDate: string;
    actionType: string;
    firm: string;
    analyst?: string;
    previousRating?: string;
    newRating?: string;
    previousTarget?: number;
    newTarget?: number;
  }>;
}

export default function CompanySnapshotPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = params.ticker as string;
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;

    const fetchSnapshot = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/company/${ticker}/snapshot`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch company snapshot');
        }

        const result = await response.json();
        setData(result);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSnapshot();
  }, [ticker]);

  const formatMarketCap = (marketCap?: number) => {
    if (!marketCap) return 'N/A';
    if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(2)}T`;
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
    if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
    return `$${marketCap.toFixed(0)}`;
  };

  const formatCurrency = (value?: number, decimals = 2) => {
    if (value === null || value === undefined) return 'N/A';
    if (value >= 1e9) return `$${(value / 1e9).toFixed(decimals)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(decimals)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(decimals)}K`;
    return `$${value.toFixed(decimals)}`;
  };

  const formatPercent = (value?: number) => {
    if (value === null || value === undefined) return 'N/A';
    return `${(value * 100).toFixed(2)}%`;
  };

  const getActionColor = (actionType: string) => {
    if (actionType.toLowerCase().includes('upgrade') || actionType.toLowerCase().includes('initiated buy')) {
      return 'text-green-600 bg-green-50 border-green-200';
    }
    if (actionType.toLowerCase().includes('downgrade') || actionType.toLowerCase().includes('initiated sell')) {
      return 'text-red-600 bg-red-50 border-red-200';
    }
    return 'text-blue-600 bg-blue-50 border-blue-200';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-4">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <h2 className="text-2xl font-bold">Loading {ticker} snapshot...</h2>
          <p className="text-slate-600">Fetching live market data</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-3xl">🔍</span>
              {ticker ? ticker.toUpperCase() : 'Company'} Not Tracked
            </CardTitle>
            <CardDescription className="text-base">{error}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={() => router.push('/')} variant="outline" className="flex-1">
                ← Back to Home
              </Button>
              <Button onClick={() => router.push('/query')} variant="default" className="flex-1">
                Browse All Companies →
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { company, liveData, priceHistory, spxHistory, fundamentals, filings, analystActivity, news } = data;

  // Calculate price change
  const priceChange = liveData.currentPrice && liveData.previousClose
    ? liveData.currentPrice - liveData.previousClose
    : 0;
  const priceChangePercent = liveData.previousClose
    ? (priceChange / liveData.previousClose) * 100
    : 0;

  // Calculate analyst upside
  const analystUpside = liveData.currentPrice && liveData.analystTargetPrice
    ? ((liveData.analystTargetPrice - liveData.currentPrice) / liveData.currentPrice) * 100
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex gap-2 mb-4">
            <Button variant="outline" onClick={() => router.push('/')}>
              ← Back
            </Button>
            <Button
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
              onClick={() => router.push(`/chat?ticker=${company.ticker}`)}
            >
              💬 Chat with AI
            </Button>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">{company.name}</h1>
              <div className="flex items-center gap-3 text-lg text-slate-600">
                <span className="font-semibold">{company.ticker}</span>
                {company.sector && (
                  <>
                    <span>•</span>
                    <span>{company.sector}</span>
                  </>
                )}
                {company.industry && (
                  <>
                    <span>•</span>
                    <span className="text-sm">{company.industry}</span>
                  </>
                )}
              </div>
            </div>

            {/* Current Price */}
            {liveData.currentPrice && (
              <div className="text-right">
                <div className="text-4xl font-bold">${liveData.currentPrice.toFixed(2)}</div>
                <div className={`text-lg ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                </div>
                <div className="text-sm text-slate-500">Today</div>
              </div>
            )}
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Market Cap</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatMarketCap(liveData.marketCap)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>P/E Ratio</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{liveData.peRatio?.toFixed(2) || 'N/A'}</div>
              {liveData.forwardPE && (
                <div className="text-sm text-slate-500">Fwd: {liveData.forwardPE.toFixed(2)}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>52-Week Range</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold">
                ${liveData.fiftyTwoWeekLow?.toFixed(2) || 'N/A'} - ${liveData.fiftyTwoWeekHigh?.toFixed(2) || 'N/A'}
              </div>
              {liveData.currentPrice && liveData.fiftyTwoWeekLow && liveData.fiftyTwoWeekHigh && (
                <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{
                      width: `${((liveData.currentPrice - liveData.fiftyTwoWeekLow) / (liveData.fiftyTwoWeekHigh - liveData.fiftyTwoWeekLow)) * 100}%`
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Analyst Target</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${liveData.analystTargetPrice?.toFixed(2) || 'N/A'}</div>
              {analystUpside !== null && (
                <div className={`text-sm font-semibold ${analystUpside >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {analystUpside >= 0 ? '+' : ''}{analystUpside.toFixed(1)}% upside
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{formatMarketCap(liveData.volume)}</div>
              {liveData.averageVolume && (
                <div className="text-sm text-slate-500">Avg: {formatMarketCap(liveData.averageVolume)}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Beta</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{liveData.beta?.toFixed(2) || 'N/A'}</div>
              <div className="text-xs text-slate-500">vs Market</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Dividend Yield</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercent(liveData.dividendYield)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Profit Margin</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercent(liveData.profitMargins)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Latest Financials */}
        {fundamentals.latestQuarter && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Latest Financials - {fundamentals.latestQuarter}</CardTitle>
              <CardDescription>From most recent SEC filing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-slate-600 mb-1">Revenue</div>
                  <div className="text-2xl font-bold">{formatCurrency(fundamentals.latestRevenue)}</div>
                  {fundamentals.latestRevenueYoY !== null && fundamentals.latestRevenueYoY !== undefined && (
                    <div className={`text-sm font-semibold ${fundamentals.latestRevenueYoY >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fundamentals.latestRevenueYoY >= 0 ? '▲' : '▼'} {Math.abs(fundamentals.latestRevenueYoY).toFixed(1)}% YoY
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-sm text-slate-600 mb-1">Net Income</div>
                  <div className="text-2xl font-bold">{formatCurrency(fundamentals.latestNetIncome)}</div>
                  {fundamentals.latestNetIncomeYoY !== null && fundamentals.latestNetIncomeYoY !== undefined && (
                    <div className={`text-sm font-semibold ${fundamentals.latestNetIncomeYoY >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fundamentals.latestNetIncomeYoY >= 0 ? '▲' : '▼'} {Math.abs(fundamentals.latestNetIncomeYoY).toFixed(1)}% YoY
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-sm text-slate-600 mb-1">EPS</div>
                  <div className="text-2xl font-bold">${fundamentals.latestEPS?.toFixed(2) || 'N/A'}</div>
                  {fundamentals.latestEPSYoY !== null && fundamentals.latestEPSYoY !== undefined && (
                    <div className={`text-sm font-semibold ${fundamentals.latestEPSYoY >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fundamentals.latestEPSYoY >= 0 ? '▲' : '▼'} {Math.abs(fundamentals.latestEPSYoY).toFixed(1)}% YoY
                    </div>
                  )}
                </div>
              </div>

              {(fundamentals.latestGrossMargin !== null || fundamentals.latestOperatingMargin !== null) && (
                <div className="grid grid-cols-2 gap-6 mt-6 pt-6 border-t">
                  {fundamentals.latestGrossMargin !== null && fundamentals.latestGrossMargin !== undefined && (
                    <div>
                      <div className="text-sm text-slate-600 mb-1">Gross Margin</div>
                      <div className="text-xl font-bold">{formatPercent(fundamentals.latestGrossMargin / 100)}</div>
                    </div>
                  )}
                  {fundamentals.latestOperatingMargin !== null && fundamentals.latestOperatingMargin !== undefined && (
                    <div>
                      <div className="text-sm text-slate-600 mb-1">Operating Margin</div>
                      <div className="text-xl font-bold">{formatPercent(fundamentals.latestOperatingMargin / 100)}</div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 180-Day Performance vs S&P 500 */}
        {priceHistory && priceHistory.length > 0 && (() => {
          // Build normalized comparison data (% change from start)
          const spxMap = new Map((spxHistory || []).map(s => [s.date, s.price]));
          const basePrice = priceHistory[0].price;
          const firstSpxDate = priceHistory.find(p => spxMap.has(p.date))?.date;
          const baseSpx = firstSpxDate ? spxMap.get(firstSpxDate)! : null;

          // Build filing date set for markers
          const filingDates = new Set(filings.map(f => f.filingDate.split('T')[0]));

          const chartData = priceHistory.map(p => {
            const stockPct = ((p.price - basePrice) / basePrice) * 100;
            const spxPrice = spxMap.get(p.date);
            const spxPct = baseSpx && spxPrice ? ((spxPrice - baseSpx) / baseSpx) * 100 : null;
            return {
              date: p.date,
              stock: Math.round(stockPct * 100) / 100,
              spx: spxPct !== null ? Math.round(spxPct * 100) / 100 : null,
              stockPrice: p.price,
              spxPrice: spxPrice || null,
              hasFiling: filingDates.has(p.date),
              volume: p.volume,
            };
          });

          // Find filing data points for markers
          const filingPoints = chartData.filter(d => d.hasFiling);

          const lastStock = chartData[chartData.length - 1]?.stock ?? 0;
          const lastSpx = chartData[chartData.length - 1]?.spx ?? 0;

          return (
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>180-Day Performance vs S&P 500</CardTitle>
                    <CardDescription>
                      {company.ticker}{' '}
                      <span className={lastStock >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {lastStock >= 0 ? '+' : ''}{lastStock.toFixed(1)}%
                      </span>
                      {baseSpx !== null && (
                        <>
                          {' vs S&P 500 '}
                          <span className="text-orange-500 font-semibold">
                            {lastSpx >= 0 ? '+' : ''}{lastSpx.toFixed(1)}%
                          </span>
                        </>
                      )}
                    </CardDescription>
                  </div>
                  {filingPoints.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <span className="inline-block w-2 h-2 rounded-full bg-purple-500"></span>
                      SEC Filing
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        tickFormatter={(value) => {
                          const date = new Date(value + 'T00:00:00');
                          return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        }}
                        interval="preserveStartEnd"
                        minTickGap={40}
                      />
                      <YAxis
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        tickFormatter={(value) => `${value > 0 ? '+' : ''}${value.toFixed(0)}%`}
                      />
                      <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                      {/* Filing date markers */}
                      {filingPoints.map((fp, i) => (
                        <ReferenceLine
                          key={`filing-${i}`}
                          x={fp.date}
                          stroke="#a855f7"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                        />
                      ))}
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            const filing = d.hasFiling ? filings.find(f => f.filingDate.split('T')[0] === d.date) : null;
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
                                <p className="font-semibold text-gray-900 mb-2">
                                  {new Date(d.date + 'T00:00:00').toLocaleDateString()}
                                </p>
                                <div className="space-y-1 text-sm">
                                  <p className="text-blue-600 font-medium">
                                    {company.ticker}: {d.stock >= 0 ? '+' : ''}{d.stock.toFixed(2)}%
                                    <span className="text-gray-500 ml-1">(${d.stockPrice.toFixed(2)})</span>
                                  </p>
                                  {d.spx !== null && (
                                    <p className="text-orange-500 font-medium">
                                      S&P 500: {d.spx >= 0 ? '+' : ''}{d.spx.toFixed(2)}%
                                      {d.spxPrice && <span className="text-gray-500 ml-1">({d.spxPrice.toFixed(0)})</span>}
                                    </p>
                                  )}
                                  {filing && (
                                    <p className="text-purple-600 font-medium mt-1 pt-1 border-t">
                                      Filing: {filing.filingType}
                                      {filing.concernLevel != null && ` (Concern: ${filing.concernLevel.toFixed(1)})`}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="stock"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={false}
                        name={company.ticker}
                      />
                      {baseSpx !== null && (
                        <Line
                          type="monotone"
                          dataKey="spx"
                          stroke="#f97316"
                          strokeWidth={2}
                          dot={false}
                          strokeDasharray="6 3"
                          name="S&P 500"
                          connectNulls
                        />
                      )}
                      {/* Filing marker dots on the stock line */}
                      {filingPoints.map((fp, i) => (
                        <ReferenceDot
                          key={`dot-${i}`}
                          x={fp.date}
                          y={fp.stock}
                          r={5}
                          fill="#a855f7"
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      ))}
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value: string) => (
                          <span className="text-sm text-slate-600">{value}</span>
                        )}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Analyst Activity */}
        {analystActivity.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Recent Analyst Activity</CardTitle>
              <CardDescription>Last {analystActivity.length} analyst actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analystActivity.slice(0, 10).map((activity) => (
                  <div key={activity.id} className={`p-3 rounded-lg border ${getActionColor(activity.actionType)}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold">{activity.firm}</div>
                        <div className="text-sm">{activity.actionType}</div>
                        {activity.previousRating && activity.newRating && (
                          <div className="text-sm mt-1">
                            {activity.previousRating} → {activity.newRating}
                          </div>
                        )}
                        {activity.previousTarget && activity.newTarget && (
                          <div className="text-sm mt-1">
                            Target: ${activity.previousTarget.toFixed(2)} → ${activity.newTarget.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-slate-600">
                        {new Date(activity.activityDate).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {analystActivity.length > 10 && (
                <div className="text-center mt-4 text-sm text-slate-600">
                  + {analystActivity.length - 10} more analyst actions
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Analyst Recommendations */}
        {liveData.recommendations && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Analyst Recommendations</CardTitle>
              <CardDescription>Current analyst consensus</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {liveData.recommendations.strongBuy && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{liveData.recommendations.strongBuy}</div>
                    <div className="text-xs text-slate-600">Strong Buy</div>
                  </div>
                )}
                {liveData.recommendations.buy && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-500">{liveData.recommendations.buy}</div>
                    <div className="text-xs text-slate-600">Buy</div>
                  </div>
                )}
                {liveData.recommendations.hold && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">{liveData.recommendations.hold}</div>
                    <div className="text-xs text-slate-600">Hold</div>
                  </div>
                )}
                {liveData.recommendations.sell && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-500">{liveData.recommendations.sell}</div>
                    <div className="text-xs text-slate-600">Sell</div>
                  </div>
                )}
                {liveData.recommendations.strongSell && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{liveData.recommendations.strongSell}</div>
                    <div className="text-xs text-slate-600">Strong Sell</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent News */}
        {news && news.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Recent News</CardTitle>
              <CardDescription>Latest news and headlines</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {news.slice(0, 8).map((article, index) => (
                  <a
                    key={index}
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-3 p-3 border rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    {article.thumbnail && (
                      <img
                        src={article.thumbnail}
                        alt=""
                        className="w-20 h-20 object-cover rounded flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm line-clamp-2 mb-1">
                        {article.title}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <span>{article.publisher}</span>
                        {article.publishedAt && (
                          <>
                            <span>•</span>
                            <span>
                              {new Date(article.publishedAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                              })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>

              {news.length > 8 && (
                <div className="text-center mt-4 text-sm text-slate-600">
                  + {news.length - 8} more news articles
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Filings */}
        <Card>
          <CardHeader>
            <CardTitle>Recent SEC Filings</CardTitle>
            <CardDescription>Last {filings.length} filings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filings.slice(0, 5).map((filing) => (
                <div
                  key={filing.accessionNumber}
                  className="p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/filing/${filing.accessionNumber}`)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{filing.filingType}</div>
                      <div className="text-sm text-slate-600">
                        {new Date(filing.filingDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {filing.concernLevel !== null && filing.concernLevel !== undefined && (
                        <Badge variant="outline">
                          Concern: {filing.concernLevel.toFixed(1)}/10
                        </Badge>
                      )}
                      {filing.predicted7dReturn !== null && filing.predicted7dReturn !== undefined && (
                        <Badge className={filing.predicted7dReturn >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                          Pred: {filing.predicted7dReturn >= 0 ? '+' : ''}{filing.predicted7dReturn.toFixed(2)}%
                        </Badge>
                      )}
                      <Button variant="ghost" size="sm">View →</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filings.length > 5 && (
              <div className="text-center mt-4">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/company/${company.ticker}/filings`)}
                >
                  View All {filings.length} Filings →
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
