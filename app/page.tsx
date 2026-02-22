/**
 * @module page
 * @description Main home/landing page component for the StockHuntr application
 * 
 * PURPOSE:
 * - Serves dual purpose as authenticated user dashboard and marketing landing page
 * - Provides quick access to key features: watchlist, recent filings, top signals, and search
 * - Displays personalized content for logged-in users (dashboard view)
 * - Shows comprehensive marketing content for non-authenticated visitors (landing view)
 * - Acts as the primary entry point and navigation hub for the application
 * 
 * EXPORTS:
 * - default: Home - Main page component that conditionally renders dashboard or marketing content
 * 
 * CLAUDE NOTES:
 * - Client component using Next.js 13+ App Router ('use client' directive)
 * - Implements conditional rendering based on authentication state
 * - Dashboard view includes: user stats, watchlist with real-time prices, recent filings feed, top trading signals
 * - Marketing view includes: hero section, feature highlights, AI chat showcase, comparison tables, legal disclaimers
 * - Integrates multiple API endpoints: /api/auth/me, /api/watchlist, /api/filings/latest, /api/filings/top-signals, /api/stock-prices
 * - Features autocomplete search with debounced API calls to /api/companies/search
 * - Uses custom components: Button, Card variants, CompanySnapshotTooltip
 * - Implements real-time stock price updates and filing status indicators
 * - Contains extensive TypeScript interfaces for type safety across API responses
 * - Responsive design with grid layouts optimized for mobile and desktop
 * - Includes alpha predictions, concern levels, and analyst tracking features
 * - Marketing content emphasizes AI-powered analysis, 30-day alpha predictions, and chat functionality
 */

'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { CompanySnapshotTooltip } from '@/components/CompanySnapshotTooltip';
import { safeFormatPrice, safeFormatPercent } from '@/lib/format-utils';

interface User {
  id: string;
  email: string;
  name?: string;
  tier: string;
}

interface CompanySnapshot {
  currentPrice?: number | null;
  marketCap?: number | null;
  peRatio?: number | null;
  dividendYield?: number | null;
  beta?: number | null;
  latestRevenue?: number | null;
  latestRevenueYoY?: number | null;
  latestNetIncome?: number | null;
  latestNetIncomeYoY?: number | null;
  latestGrossMargin?: number | null;
  latestOperatingMargin?: number | null;
  latestQuarter?: string | null;
  analystTargetPrice?: number | null;
}

interface WatchlistItem {
  id: string;
  ticker: string;
  companyName: string;
  addedAt: string;
  company?: CompanySnapshot;
}

interface RecentFiling {
  id: string;
  ticker: string;
  companyName: string;
  formType: string;
  filedAt: string;
  filingDate?: string; // API returns this field
  accessionNumber: string;
  filed_at?: string;
  companySnapshot?: CompanySnapshot;
  predicted30dAlpha?: number | null;
  predictionConfidence?: number | null;
  concernLevel?: number | null;
}

interface TopSignal {
  ticker: string;
  companyName: string;
  formType: string;
  filingDate: string;
  accessionNumber: string;
  predicted30dAlpha: number;
  predictionConfidence: number;
}

interface StockPrice {
  ticker: string;
  currentPrice: number;
  change: number;
  changePercent: number;
}

interface CompanySuggestion {
  ticker: string;
  name: string;
  filingCount: number;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [recentFilings, setRecentFilings] = useState<RecentFiling[]>([]);
  const [stockPrices, setStockPrices] = useState<Record<string, StockPrice>>({});
  const [topSignals, setTopSignals] = useState<TopSignal[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchWatchlist();
      fetchRecentFilings();
      fetchTopSignals();
    }
  }, [user]);

  useEffect(() => {
    if (watchlist.length > 0) {
      fetchStockPrices();
    }
  }, [watchlist]);

  // Autocomplete search
  useEffect(() => {
    if (searchInput.length < 1) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/companies/search?q=${encodeURIComponent(searchInput)}`);
        const data = await response.json();
        setSuggestions(data.companies || []);
      } catch (error) {
        console.error('Error fetching suggestions:', error);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleSearch = (ticker: string) => {
    router.push(`/latest-filings?ticker=${ticker}`);
  };

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();
      if (data.user) {
        setUser(data.user);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWatchlist = async () => {
    try {
      const response = await fetch('/api/watchlist');
      const data = await response.json();
      if (data.watchlist) {
        setWatchlist(data.watchlist.slice(0, 6)); // Show top 6
      }
    } catch (error) {
      console.error('Error fetching watchlist:', error);
    }
  };

  const fetchRecentFilings = async () => {
    try {
      const response = await fetch('/api/filings/latest?limit=8');
      const data = await response.json();
      if (data.filings) {
        setRecentFilings(data.filings);
      }
    } catch (error) {
      console.error('Error fetching recent filings:', error);
    }
  };

  const fetchTopSignals = async () => {
    try {
      const response = await fetch('/api/filings/top-signals');
      const data = await response.json();
      if (data.signals) {
        setTopSignals(data.signals);
      }
    } catch (error) {
      console.error('Error fetching top signals:', error);
    }
  };

  const fetchStockPrices = async () => {
    try {
      const tickers = watchlist.map(item => item.ticker).join(',');
      const response = await fetch(`/api/stock-prices?tickers=${tickers}`);
      const data = await response.json();
      if (data.prices) {
        const priceMap: Record<string, StockPrice> = {};
        data.prices.forEach((price: StockPrice) => {
          priceMap[price.ticker] = price;
        });
        setStockPrices(priceMap);
      }
    } catch (error) {
      console.error('Error fetching stock prices:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Show dashboard for authenticated users
  if (user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">

        <main className="container mx-auto px-6 py-8">
          {/* Welcome Section */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">
              Welcome back{user.name ? `, ${user.name}` : ''}!
            </h1>
            <p className="text-muted-foreground">
              Here's what's happening with your tracked companies and the latest SEC filings.
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid md:grid-cols-4 gap-4 mb-8">
            <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs text-muted-foreground">Tracked Companies</CardDescription>
                <CardTitle className="text-3xl font-bold text-white">{watchlist.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs text-muted-foreground">Account Tier</CardDescription>
                <CardTitle className="text-2xl font-bold text-primary capitalize">{user.tier}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs text-muted-foreground">Coverage</CardDescription>
                <CardTitle className="text-3xl font-bold text-white">640+</CardTitle>
              </CardHeader>
            </Card>
            <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs text-muted-foreground">Filing Types</CardDescription>
                <CardTitle className="text-xl font-bold text-white">10-K, 10-Q, 8-K</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Prominent Search Section */}
          <Card className="bg-gradient-to-r from-blue-600 to-blue-700 border-0 mb-8 overflow-visible">
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <h2 className="text-3xl font-bold text-white mb-2">
                  🔍 Search SEC Filings
                </h2>
                <p className="text-blue-100 text-lg">
                  Find AI-powered predictions for any company
                </p>
              </div>

              <div className="max-w-2xl mx-auto relative">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Enter ticker (e.g., AAPL, MSFT) or company name..."
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value.toUpperCase());
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    className="w-full h-14 px-5 pr-24 text-lg rounded-lg border-2 border-white/20 focus:border-white/40 bg-white/95 text-slate-900 outline-none"
                  />
                  <Button
                    onClick={() => searchInput && handleSearch(searchInput)}
                    className="absolute right-2 top-2 h-10 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Search
                  </Button>
                </div>

                {/* Autocomplete Suggestions */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute w-full mt-2 bg-white rounded-lg shadow-2xl z-50 max-h-80 overflow-y-auto">
                    {suggestions.map((company) => (
                      <div
                        key={company.ticker}
                        className="p-4 hover:bg-slate-50 cursor-pointer border-b last:border-b-0 transition-colors"
                        onClick={() => {
                          handleSearch(company.ticker);
                          setShowSuggestions(false);
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-bold text-blue-600 text-lg">{company.ticker}</div>
                            <div className="text-sm text-slate-600">{company.name}</div>
                          </div>
                          <div className="text-sm text-slate-500">
                            {company.filingCount} filings
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            {/* Quick Actions */}
            <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
              <CardHeader>
                <CardTitle className="text-xl text-white">Quick Actions</CardTitle>
                <CardDescription>Jump into analysis and exploration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={() => router.push('/latest-filings')}
                  variant="outline"
                  className="w-full justify-start border-white/45 text-left"
                >
                  <span className="mr-2">📰</span>
                  <div>
                    <div className="font-semibold">View Latest Filings</div>
                    <div className="text-xs text-muted-foreground">Browse recent SEC filings from all companies</div>
                  </div>
                </Button>
                <Button
                  onClick={() => router.push('/query')}
                  variant="outline"
                  className="w-full justify-start border-white/45 text-left"
                >
                  <span className="mr-2">🔍</span>
                  <div>
                    <div className="font-semibold">Search Companies</div>
                    <div className="text-xs text-muted-foreground">Find and analyze any tracked company</div>
                  </div>
                </Button>
                <Button
                  onClick={() => router.push('/query')}
                  variant="outline"
                  className="w-full justify-start border-white/45 text-left"
                >
                  <span className="mr-2">💬</span>
                  <div>
                    <div className="font-semibold">Ask the Market</div>
                    <div className="text-xs text-muted-foreground">Screen stocks or ask AI about filings</div>
                  </div>
                </Button>
                <Button
                  onClick={() => router.push('/watchlist')}
                  variant="outline"
                  className="w-full justify-start border-white/45 text-left"
                >
                  <span className="mr-2">⭐</span>
                  <div>
                    <div className="font-semibold">Manage Watchlist</div>
                    <div className="text-xs text-muted-foreground">Add or remove tracked companies</div>
                  </div>
                </Button>
              </CardContent>
            </Card>

            {/* Your Watchlist */}
            <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl text-white">Your Watchlist</CardTitle>
                    <CardDescription>
                      {watchlist.length === 0 ? 'Start tracking companies' : `Tracking ${watchlist.length} companies`}
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => router.push('/watchlist')}
                    variant="outline"
                    size="sm"
                    className="border-white/45"
                  >
                    Manage
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {watchlist.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">You haven't added any companies to your watchlist yet.</p>
                    <Button
                      onClick={() => router.push('/watchlist')}
                      className="bg-gradient-to-br from-primary to-secondary text-[#0b1120] font-semibold hover:brightness-110"
                    >
                      Add Companies
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {watchlist.map((item) => {
                      const price = stockPrices[item.ticker];
                      return (
                        <button
                          key={item.id}
                          onClick={() => router.push(`/company/${item.ticker}/filings`)}
                          className="w-full text-left p-3 rounded-lg bg-[rgba(15,23,42,0.6)] border border-white/10 hover:border-primary/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <CompanySnapshotTooltip
                                ticker={item.ticker}
                                companyName={item.companyName}
                                snapshot={item.company || {}}
                              >
                                <div className="font-semibold text-primary underline decoration-dotted decoration-primary/60 hover:decoration-solid transition-all cursor-pointer">{item.ticker}</div>
                              </CompanySnapshotTooltip>
                              <div className="text-sm text-muted-foreground">{item.companyName}</div>
                            </div>
                            {price ? (
                              <div className="text-right mr-3">
                                <div className="font-semibold text-white">{safeFormatPrice(price.currentPrice)}</div>
                                <div className={`text-xs ${price.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {price.change >= 0 ? '▲' : '▼'} {safeFormatPercent(Math.abs(price.changePercent))}
                                </div>
                              </div>
                            ) : (
                              <div className="text-right mr-3">
                                <div className="text-xs text-muted-foreground">Loading...</div>
                              </div>
                            )}
                            <span className="text-primary">→</span>
                          </div>
                        </button>
                      );
                    })}
                    {watchlist.length >= 6 && (
                      <Button
                        onClick={() => router.push('/watchlist')}
                        variant="outline"
                        className="w-full border-white/45 mt-3"
                      >
                        View All
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Signals */}
          {topSignals.length > 0 && (
            <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18] mb-8">
              <CardHeader>
                <CardTitle className="text-xl text-white">Top Signals</CardTitle>
                <CardDescription>Strongest LONG/SHORT signals from the last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  {/* LONG signals */}
                  <div>
                    <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-3">LONG</h3>
                    <div className="space-y-2">
                      {topSignals
                        .filter((s) => s.predicted30dAlpha > 0)
                        .map((signal) => (
                          <button
                            key={signal.accessionNumber}
                            onClick={() => router.push(`/filing/${signal.accessionNumber}`)}
                            className="w-full text-left p-3 rounded-lg bg-green-500/5 border border-green-500/20 hover:border-green-500/40 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-primary">{signal.ticker}</span>
                                <span className="text-xs text-muted-foreground ml-2">{signal.formType}</span>
                              </div>
                              <span className="text-sm font-bold text-green-400">
                                +{signal.predicted30dAlpha.toFixed(1)}%
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {signal.companyName} · {new Date(signal.filingDate).toLocaleDateString()}
                            </div>
                          </button>
                        ))}
                      {topSignals.filter((s) => s.predicted30dAlpha > 0).length === 0 && (
                        <p className="text-sm text-muted-foreground">No LONG signals</p>
                      )}
                    </div>
                  </div>
                  {/* SHORT signals */}
                  <div>
                    <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3">SHORT</h3>
                    <div className="space-y-2">
                      {topSignals
                        .filter((s) => s.predicted30dAlpha < 0)
                        .map((signal) => (
                          <button
                            key={signal.accessionNumber}
                            onClick={() => router.push(`/filing/${signal.accessionNumber}`)}
                            className="w-full text-left p-3 rounded-lg bg-red-500/5 border border-red-500/20 hover:border-red-500/40 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-primary">{signal.ticker}</span>
                                <span className="text-xs text-muted-foreground ml-2">{signal.formType}</span>
                              </div>
                              <span className="text-sm font-bold text-red-400">
                                {signal.predicted30dAlpha.toFixed(1)}%
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {signal.companyName} · {new Date(signal.filingDate).toLocaleDateString()}
                            </div>
                          </button>
                        ))}
                      {topSignals.filter((s) => s.predicted30dAlpha < 0).length === 0 && (
                        <p className="text-sm text-muted-foreground">No SHORT signals</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Filings */}
          <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-white">Recent SEC Filings</CardTitle>
                  <CardDescription>Latest filings across all tracked companies</CardDescription>
                </div>
                <Button
                  onClick={() => router.push('/latest-filings')}
                  variant="outline"
                  className="border-white/45"
                >
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentFilings.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No recent filings available.</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-3">
                  {recentFilings.map((filing) => {
                    // Handle different field names from API
                    const filingDate = (filing as any).filingDate || filing.filed_at || filing.filedAt;
                    const dateObj = new Date(filingDate);
                    const isValidDate = !isNaN(dateObj.getTime());

                    return (
                      <button
                        key={filing.id}
                        onClick={() => router.push(`/filing/${filing.accessionNumber}`)}
                        className="text-left p-4 rounded-lg bg-[rgba(15,23,42,0.6)] border border-white/10 hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <CompanySnapshotTooltip
                              ticker={filing.ticker}
                              companyName={filing.companyName}
                              snapshot={filing.companySnapshot || {}}
                            >
                              <div className="font-semibold text-primary underline decoration-dotted decoration-primary/60 hover:decoration-solid transition-all cursor-pointer">{filing.ticker}</div>
                            </CompanySnapshotTooltip>
                            <div className="text-sm text-muted-foreground">{filing.companyName}</div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/20 border border-primary text-primary">
                              {filing.formType}
                            </span>
                            {filing.predicted30dAlpha != null && filing.predictionConfidence != null && filing.predictionConfidence > 0 && (
                              filing.predictionConfidence > 0.6 ? (
                                filing.predicted30dAlpha > 0 ? (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500 text-green-400">
                                    LONG +{filing.predicted30dAlpha.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500 text-red-400">
                                    SHORT {filing.predicted30dAlpha.toFixed(1)}%
                                  </span>
                                )
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-muted-foreground">
                                  NEUTRAL
                                </span>
                              )
                            )}
                            {filing.concernLevel != null && filing.concernLevel > 6 && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${filing.concernLevel > 8 ? 'bg-red-500/20 border border-red-500 text-red-400' : 'bg-orange-500/20 border border-orange-500 text-orange-400'}`}>
                                Concern: {filing.concernLevel.toFixed(1)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {isValidDate ? `Filed ${dateObj.toLocaleDateString()}` : 'Recently filed'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Show marketing page for non-authenticated users
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">

      <main className="container mx-auto px-6 py-12 pb-16">
        {/* Hero Section */}
        <section className="py-12 grid md:grid-cols-[1.15fr_1fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(15,23,42,0.85)] border border-white/40 text-muted-foreground text-xs uppercase tracking-[0.12em] mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
              AI-Powered SEC Filing Intelligence
            </div>

            <h1 className="text-5xl font-bold tracking-tight mb-3">
              Chat with SEC filings. Get risk scores. See 30-day alpha predictions.
            </h1>

            <p className="text-muted-foreground mb-5 max-w-xl">
              Analyze <strong className="text-gray-200">10-K, 10-Q, and 8-K</strong> filings in plain English. Get
              AI-powered risk analysis, watchlist alerts, and 30-day alpha
              predictions across <strong className="text-gray-200">640+ US companies</strong>.
            </p>

            <div className="flex flex-wrap gap-2 mb-5">
              <span className="text-xs px-2.5 py-1.5 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-600 text-gray-200">
                ⚠️ Analyst Tracking & Risk Scoring
              </span>
              <span className="text-xs px-2.5 py-1.5 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-600 text-gray-200">
                💬 Ask the Market
              </span>
              <span className="text-xs px-2.5 py-1.5 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-600 text-gray-200">
                📈 30-Day Alpha Predictions
              </span>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <Button
                onClick={() => router.push('/profile')}
                size="lg"
                className="bg-gradient-to-br from-primary to-secondary text-[#0b1120] font-semibold shadow-[0_14px_30px_rgba(34,197,94,0.36)] hover:brightness-110 text-base px-8"
              >
                Join now - it's free!
              </Button>
              <Button
                onClick={() => router.push('/latest-filings')}
                variant="outline"
                className="border-white/45 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.15),transparent)]"
              >
                View Live Filings Feed →
              </Button>
            </div>

            <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                640+ companies tracked
              </span>
              <span>Real-time SEC feed</span>
              <span>0–10 AI concern score (LOW → CRITICAL)</span>
            </div>
          </div>

          {/* Visual Panel */}
          <div className="relative">
            <div className="absolute inset-[-14%] bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.27),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(34,197,94,0.22),transparent_55%)] opacity-90 blur-md pointer-events-none -z-10"></div>

            <div className="rounded-3xl bg-[radial-gradient(circle_at_top_left,#020617_0%,#020617_55%,#020617_100%)] border border-white/35 shadow-[0_18px_45px_rgba(15,23,42,0.9)] p-5">
              <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-600">
                  <span className="font-semibold text-gray-200">AAPL</span>
                  <span className="text-[0.7rem] px-2 py-0.5 rounded-full bg-[rgba(31,41,55,0.9)]">10-Q</span>
                </div>
                <span>Filed 3 hours ago · Live from EDGAR</span>
              </div>

              <div className="grid md:grid-cols-[1.35fr_0.9fr] gap-4">
                {/* Filing Snippet */}
                <div className="rounded-xl bg-[rgba(15,23,42,0.9)] border border-gray-600 p-4 text-xs text-muted-foreground relative">
                  <div className="absolute top-2 right-3 text-[0.7rem] text-gray-500 bg-[rgba(15,23,42,0.95)] px-2 py-0.5 rounded-full border border-gray-600">
                    SEC Filing · 10-Q
                  </div>
                  <p className="mb-3">
                    "Net sales increased 8% driven primarily by iPhone and Services
                    growth. Gross margin expanded due to a more favorable product mix
                    and supply chain efficiencies…"
                  </p>
                  <div className="p-2.5 rounded-lg bg-white/[0.03] border border-dashed border-white/60 text-gray-200">
                    AI: Elevated concern around <strong>regulatory risk</strong>,
                    <strong> margin compression</strong>, and
                    <strong> executive compensation</strong> language.
                  </div>
                  <div className="flex flex-wrap gap-1 mt-3">
                    <span className="text-[0.7rem] px-2 py-0.5 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-700">Management sentiment</span>
                    <span className="text-[0.7rem] px-2 py-0.5 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-700">Earnings surprise</span>
                    <span className="text-[0.7rem] px-2 py-0.5 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-700">Litigation & breaches</span>
                  </div>
                </div>

                {/* Risk Card */}
                <div className="rounded-xl bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.1),rgba(15,23,42,0.96))] border border-gray-600 p-4 text-xs">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-muted-foreground mb-1">AI Concern Level</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold leading-none">6.8</span>
                        <span className="text-[0.7rem] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/50">Moderate risk</span>
                      </div>
                    </div>
                    <div className="text-right text-[0.7rem] text-muted-foreground">
                      Analyst rating:
                      <div className="text-primary">↑ Upgrade</div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="h-2 rounded-full bg-gradient-to-r from-primary via-yellow-500 via-orange-500 to-red-500 relative">
                      <div className="absolute top-1/2 w-0.5 h-3.5 rounded-full bg-white -translate-y-1/2 left-[72%] shadow-[0_0_0_4px_rgba(15,23,42,0.8)]"></div>
                    </div>
                    <div className="flex justify-between text-[0.7rem] text-muted-foreground mt-1">
                      <span>LOW</span>
                      <span>CRITICAL</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-3">
                    <span className="text-[0.7rem] px-1.5 py-0.5 rounded-full border border-gray-700 bg-[rgba(15,23,42,0.95)]">Litigation</span>
                    <span className="text-[0.7rem] px-1.5 py-0.5 rounded-full border border-gray-700 bg-[rgba(15,23,42,0.95)]">Exec changes</span>
                    <span className="text-[0.7rem] px-1.5 py-0.5 rounded-full border border-gray-700 bg-[rgba(15,23,42,0.95)]">Cybersecurity</span>
                  </div>

                  <div className="mt-2 p-2 rounded-lg border border-gray-700 bg-[rgba(15,23,42,0.96)]">
                    <div className="flex justify-between text-[0.7rem] text-muted-foreground mb-1">
                      <span>30-day alpha prediction</span>
                      <span>+2.1% alpha expected</span>
                    </div>
                    <div className="h-8 rounded-lg bg-gradient-to-r from-secondary to-primary opacity-85"></div>
                    <div className="flex justify-between items-center text-[0.7rem] text-muted-foreground mt-1">
                      <span>Predicted vs actual tracked over time</span>
                      <span className="px-2 py-0.5 rounded-full bg-green-900/20 border border-green-600 text-green-300">Signal: LONG</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Ask the Market Showcase */}
        <section className="mt-16 pt-14 pb-14 border-t border-[rgba(31,41,55,0.85)]">
          <div className="grid md:grid-cols-[1fr_1.1fr] gap-10 items-start">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(15,23,42,0.85)] border border-white/40 text-muted-foreground text-xs uppercase tracking-[0.12em] mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                Ask the Market
              </div>
              <h2 className="text-3xl font-bold tracking-tight mb-3">Ask anything about any filing.</h2>
              <p className="text-muted-foreground mb-5 max-w-md">
                No jargon. No digging through 200-page documents. Just ask a question in plain English and get a clear, cited answer from the actual SEC filing.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => router.push('/query')}
                  size="lg"
                  className="bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-semibold shadow-[0_14px_30px_rgba(34,211,238,0.25)] hover:brightness-110"
                >
                  Ask the Market
                </Button>
              </div>
            </div>

            {/* Example Questions */}
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-medium">Try asking questions like these:</div>
              {[
                { q: "What were Apple's key risk factors in their latest 10-K?", icon: "🔍" },
                { q: "Did Tesla mention any new factory plans in their 8-K?", icon: "🏭" },
                { q: "Summarize Microsoft's revenue growth from their last 10-Q", icon: "📊" },
                { q: "What did NVIDIA say about AI chip demand in their earnings filing?", icon: "🤖" },
                { q: "Are there any executive compensation changes in Amazon's proxy?", icon: "💰" },
                { q: "Compare JPMorgan's loan loss provisions quarter over quarter", icon: "🏦" },
                { q: "Which healthcare companies flagged supply chain risks in recent filings?", icon: "🏥" },
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => router.push('/query')}
                  className="w-full text-left p-3 rounded-lg bg-[rgba(15,23,42,0.8)] border border-white/10 hover:border-cyan-500/40 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">{item.icon}</span>
                    <span className="text-sm text-gray-300 group-hover:text-white transition-colors">"{item.q}"</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Features - Compact Version for Marketing Page */}
        <section className="mt-0 pt-14 pb-14 border-t border-[rgba(31,41,55,0.85)]">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Everything you need to analyze SEC filings</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              AI-powered analysis, natural-language chat, smart alerts, and 30-day alpha predictions.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary flex items-center justify-center mb-3 text-2xl">
                  ⚠️
                </div>
                <CardTitle className="text-white">AI Risk Analysis</CardTitle>
                <CardDescription>
                  0–10 concern scoring, analyst tracking, and enhanced risk detection
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary flex items-center justify-center mb-3 text-2xl">
                  💬
                </div>
                <CardTitle className="text-white">Ask the Market</CardTitle>
                <CardDescription>
                  Ask questions in plain English and get instant, cited answers from 10-K, 10-Q, and 8-K documents
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary flex items-center justify-center mb-3 text-2xl">
                  📈
                </div>
                <CardTitle className="text-white">30-Day Alpha Predictions</CardTitle>
                <CardDescription>
                  Alpha model predictions — stock return minus S&P 500 — with transparent reasoning
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          <div className="text-center mt-10">
            <Button
              onClick={() => router.push('/profile')}
              size="lg"
              className="bg-gradient-to-br from-primary to-secondary text-[#0b1120] font-semibold shadow-[0_14px_30px_rgba(34,197,94,0.36)] hover:brightness-110 text-base px-8"
            >
              Join now - it's free!
            </Button>
          </div>
        </section>

        {/* Additional Features */}
        <section className="mt-0 pt-14 pb-5 border-t border-[rgba(31,41,55,0.85)]">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Watchlist Alerts */}
            <div className="rounded-xl bg-[rgba(15,23,42,0.96)] border border-white/[0.18] p-4 relative overflow-hidden">
              <div className="absolute inset-[-40%] bg-[radial-gradient(circle_at_0_0,rgba(34,211,238,0.16),transparent_55%)] opacity-90 pointer-events-none"></div>
              <div className="relative z-10">
                <div className="w-7 h-7 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-700 flex items-center justify-center mb-2">⭐</div>
                <h3 className="font-semibold mb-2">Watchlist & Alerts</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Stay informed with personalized email alerts for your tracked stocks, sectors, and themes.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  <li>Morning & evening digest emails (8am & 6pm ET)</li>
                  <li>Track companies, sectors, or individual tickers</li>
                  <li>New filings, predictions, & analyst activity</li>
                  <li>Customizable thresholds & delivery preferences</li>
                </ul>
              </div>
            </div>

            {/* Visual Insights */}
            <div className="rounded-xl bg-[rgba(15,23,42,0.96)] border border-white/[0.18] p-4 relative overflow-hidden">
              <div className="absolute inset-[-40%] bg-[radial-gradient(circle_at_0_0,rgba(34,211,238,0.16),transparent_55%)] opacity-90 pointer-events-none"></div>
              <div className="relative z-10">
                <div className="w-7 h-7 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-700 flex items-center justify-center mb-2">📊</div>
                <h3 className="font-semibold mb-2">Visual Insights</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Clear visualizations show how predictions and risk levels perform over time—so you can build intuition for the signals.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  <li>Bar charts: predicted vs actual returns</li>
                  <li>Line charts: performance over time</li>
                  <li>Real-time filing feed (640+ companies tracked)</li>
                  <li>Color-coded accuracy indicators</li>
                </ul>
              </div>
            </div>

            {/* Stock Predictions */}
            <div className="rounded-xl bg-[rgba(15,23,42,0.96)] border border-white/[0.18] p-4 relative overflow-hidden">
              <div className="absolute inset-[-40%] bg-[radial-gradient(circle_at_0_0,rgba(34,211,238,0.16),transparent_55%)] opacity-90 pointer-events-none"></div>
              <div className="relative z-10">
                <div className="w-7 h-7 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-700 flex items-center justify-center mb-2">📈</div>
                <h3 className="font-semibold mb-2">Stock Predictions</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Data-driven predictions of 30-day forward alpha (stock return vs S&P 500), with transparent model reasoning.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  <li>30-day alpha predictions with confidence scores</li>
                  <li>Transparent model reasoning & feature breakdown</li>
                  <li>Prediction vs actual comparison charts</li>
                  <li>LONG/SHORT/NEUTRAL signals based on magnitude</li>
                </ul>
              </div>
            </div>

            {/* Live Feed */}
            <div className="rounded-xl bg-[rgba(15,23,42,0.96)] border border-white/[0.18] p-4 relative overflow-hidden">
              <div className="absolute inset-[-40%] bg-[radial-gradient(circle_at_0_0,rgba(34,211,238,0.16),transparent_55%)] opacity-90 pointer-events-none"></div>
              <div className="relative z-10">
                <div className="w-7 h-7 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-700 flex items-center justify-center mb-2">📰</div>
                <h3 className="font-semibold mb-2">Live SEC Filing Feed</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  See filings as they hit EDGAR, right alongside AI analysis, chat, and performance signals.
                </p>
                <p className="text-sm text-gray-200 mb-1">Example:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4 mb-2">
                  <li>AAPL · 10-Q · Filed 3 hours ago</li>
                  <li>MSFT · 8-K · Filed 1 day ago</li>
                  <li>TSLA · 10-K · Filed 4 days ago</li>
                </ul>
                <p className="text-sm text-gray-200">Jump straight from the feed into AI chat, scoring, and predictions.</p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-5 pt-14 pb-14 border-t border-[rgba(31,41,55,0.85)]">
          <div className="mb-5">
            <h2 className="text-3xl font-bold tracking-tight mb-2">How StockHuntr fits into your workflow.</h2>
            <p className="text-muted-foreground max-w-lg">
              From filing drop to trading decision, StockHuntr shortens the path
              from raw text to actionable understanding.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-600 bg-[rgba(15,23,42,0.96)] p-4">
              <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-xs mb-2">1</div>
              <h3 className="font-semibold mb-1">Pick a company or latest filing</h3>
              <p className="text-sm text-muted-foreground">
                Search by ticker or select from the real-time filings feed. Go
                straight into the most recent 10-K, 10-Q, or 8-K.
              </p>
            </div>

            <div className="rounded-xl border border-gray-600 bg-[rgba(15,23,42,0.96)] p-4">
              <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-xs mb-2">2</div>
              <h3 className="font-semibold mb-1">Run AI analysis or just ask questions</h3>
              <p className="text-sm text-muted-foreground">
                Let Claude AI score risk, surface key themes, and summarize the
                filing—or chat directly with the document in plain English.
              </p>
            </div>

            <div className="rounded-xl border border-gray-600 bg-[rgba(15,23,42,0.96)] p-4">
              <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-xs mb-2">3</div>
              <h3 className="font-semibold mb-1">Track signals & get alerts</h3>
              <p className="text-sm text-muted-foreground">
                Add names to your watchlist, monitor alpha predictions and risk
                scores, and receive email digests when something important changes.
              </p>
            </div>
          </div>
        </section>

        {/* Why use */}
        <section className="mt-5 pt-14 pb-14 border-t border-[rgba(31,41,55,0.85)]">
          <div className="mb-5">
            <h2 className="text-3xl font-bold tracking-tight mb-2">Why use StockHuntr?</h2>
            <p className="text-muted-foreground max-w-lg">
              Traditional terminals are expensive and don't explain their
              signals. Free tools just dump raw filings. StockHuntr sits in
              between.
            </p>
          </div>

          <div className="grid md:grid-cols-[1.3fr_1fr] gap-5">
            <div className="text-sm text-muted-foreground">
              <p className="mb-3">
                <strong className="text-gray-200">Bloomberg costs $2K+/month</strong> with no built-in ML
                predictions or conversational AI analysis of filings.
              </p>
              <p className="mb-4">
                <strong className="text-gray-200">Free tools</strong> show raw SEC documents with little or no
                financial insight, making it hard to quickly see what changed.
              </p>
              <div className="mt-3 p-3 rounded-xl bg-[rgba(15,23,42,0.95)] border border-gray-700">
                <strong className="text-gray-200">Our tool:</strong> AI risk scoring + stock predictions +
                smart alerts + natural language chat.<br />
                <span className="text-muted-foreground">
                  All at a fraction of traditional terminal costs.
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-gray-600 bg-[rgba(15,23,42,0.96)] p-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[rgba(31,41,55,0.9)]">
                    <th className="text-left py-2 text-muted-foreground uppercase tracking-wider">Feature</th>
                    <th className="text-left py-2 text-muted-foreground uppercase tracking-wider">StockHuntr</th>
                    <th className="text-left py-2 text-muted-foreground uppercase tracking-wider">Terminals</th>
                    <th className="text-left py-2 text-muted-foreground uppercase tracking-wider">Free EDGAR</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[rgba(31,41,55,0.9)]">
                    <td className="py-2">AI risk scoring</td>
                    <td className="text-primary">✓</td>
                    <td className="text-white/70">–</td>
                    <td className="text-white/70">–</td>
                  </tr>
                  <tr className="border-b border-[rgba(31,41,55,0.9)]">
                    <td className="py-2">30-day alpha predictions</td>
                    <td className="text-primary">✓</td>
                    <td className="text-white/70">–</td>
                    <td className="text-white/70">–</td>
                  </tr>
                  <tr className="border-b border-[rgba(31,41,55,0.9)]">
                    <td className="py-2">Ask the Market (AI chat)</td>
                    <td className="text-primary">✓</td>
                    <td className="text-white/70">–</td>
                    <td className="text-white/70">–</td>
                  </tr>
                  <tr className="border-b border-[rgba(31,41,55,0.9)]">
                    <td className="py-2">Real-time SEC feed</td>
                    <td className="text-primary">✓</td>
                    <td className="text-primary">✓</td>
                    <td className="text-primary">✓</td>
                  </tr>
                  <tr>
                    <td className="py-2">Price</td>
                    <td className="text-primary">Free</td>
                    <td className="text-white/70">$2K+/month</td>
                    <td className="text-primary">Free (raw)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Legal */}
        <section className="mt-5 pt-14 pb-14 border-t border-[rgba(31,41,55,0.85)]">
          <div className="mb-5">
            <h2 className="text-3xl font-bold tracking-tight mb-2">Important legal disclaimers.</h2>
            <p className="text-muted-foreground max-w-lg">
              Clear, explicit about what StockHuntr is—and isn't. Please review
              carefully before relying on any output.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-600 bg-[radial-gradient(circle_at_top_left,rgba(248,250,252,0.05),rgba(15,23,42,0.98))] p-5 grid md:grid-cols-[1.2fr_1fr] gap-4 text-sm">
            <div>
              <h3 className="font-semibold text-base mb-2 text-gray-200">⚖️ For educational & research purposes only</h3>
              <p className="text-muted-foreground mb-3">
                This platform is designed to help users learn about SEC filings,
                financial analysis techniques, and machine learning applications in
                finance. It is <span className="text-gray-200 font-semibold">NOT</span> intended to
                provide investment advice or trading recommendations. Nothing on
                this platform constitutes investment, financial, or trading advice.
              </p>

              <h4 className="font-semibold mb-1.5 text-gray-200">Your responsibilities</h4>
              <p className="text-muted-foreground mb-2">By using this service, you acknowledge that:</p>
              <ul className="text-muted-foreground space-y-1 list-disc pl-4 mb-3">
                <li>You are solely responsible for your investment decisions.</li>
                <li>You will conduct your own due diligence before making any trades.</li>
                <li>You understand the risks of stock market investing.</li>
                <li>You will not rely on this tool for investment decisions.</li>
                <li>You may lose some or all of your money if you trade based on predictions from this platform.</li>
              </ul>
              <p className="text-muted-foreground">
                Stock markets are unpredictable and you could lose some or all of
                your invested capital. This platform is not regulated by the SEC,
                FINRA, or any other financial regulatory authority. We are not
                registered as an investment adviser or broker-dealer.
              </p>
            </div>

            <div className="flex items-start justify-end">
              <Button
                onClick={() => router.push('/faq')}
                variant="outline"
                className="border-white/60 bg-[rgba(15,23,42,0.95)]"
              >
                <span className="mr-2">📄</span>
                View full terms & legal disclaimers
              </Button>
            </div>
          </div>

          {/* Closing CTA */}
          <div className="mt-5 p-5 rounded-2xl bg-[radial-gradient(circle_at_left,rgba(34,197,94,0.16),rgba(15,23,42,0.98))] border border-gray-700 flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-md">
              <h3 className="text-xl font-semibold mb-1">Ready to see AI-powered SEC analysis in action?</h3>
              <p className="text-sm text-muted-foreground">
                Analyze a live filing, ask questions in plain English, and compare
                our 30-day alpha predictions to what actually happens in the market.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => router.push('/query')}
                className="bg-gradient-to-br from-primary to-secondary text-[#0b1120] font-semibold shadow-[0_14px_30px_rgba(34,197,94,0.36)] hover:brightness-110"
              >
                Analyze a Filing
              </Button>
              <Button
                onClick={() => router.push('/latest-filings')}
                variant="outline"
                className="border-white/45 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.15),transparent)]"
              >
                Browse Latest Filings →
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[rgba(31,41,55,0.9)] py-6 mt-8 text-muted-foreground text-xs">
        <div className="container mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <strong>StockHuntr</strong> · AI-powered SEC filing intelligence.<br />
            <span>SEC data sourced from EDGAR. Not investment advice.</span>
          </div>
          <nav className="flex flex-wrap gap-4">
            <button onClick={() => router.push('/')}>Home</button>
            <button onClick={() => router.push('/latest-filings')}>Latest Filings</button>
            <button onClick={() => router.push('/faq')}>FAQ</button>
            <button onClick={() => router.push('/faq')}>Terms</button>
            <button onClick={() => router.push('/faq')}>Privacy</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}
