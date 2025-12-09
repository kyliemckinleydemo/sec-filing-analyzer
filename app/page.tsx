'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { Navigation } from '@/components/Navigation';

interface User {
  id: string;
  email: string;
  name?: string;
  tier: string;
}

interface WatchlistItem {
  id: string;
  ticker: string;
  companyName: string;
  addedAt: string;
}

interface RecentFiling {
  id: string;
  ticker: string;
  companyName: string;
  formType: string;
  filedAt: string;
  accessionNumber: string;
  filed_at?: string;
}

interface StockPrice {
  ticker: string;
  currentPrice: number;
  change: number;
  changePercent: number;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [recentFilings, setRecentFilings] = useState<RecentFiling[]>([]);
  const [stockPrices, setStockPrices] = useState<Record<string, StockPrice>>({});
  const router = useRouter();

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchWatchlist();
      fetchRecentFilings();
    }
  }, [user]);

  useEffect(() => {
    if (watchlist.length > 0) {
      fetchStockPrices();
    }
  }, [watchlist]);

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
        <Navigation />
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
        <Navigation />

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
                  onClick={() => router.push('/chat')}
                  variant="outline"
                  className="w-full justify-start border-white/45 text-left"
                >
                  <span className="mr-2">💬</span>
                  <div>
                    <div className="font-semibold">AI Chat</div>
                    <div className="text-xs text-muted-foreground">Ask questions about filings in plain English</div>
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
                <CardTitle className="text-xl text-white">Your Watchlist</CardTitle>
                <CardDescription>
                  {watchlist.length === 0 ? 'Start tracking companies' : `Tracking ${watchlist.length} companies`}
                </CardDescription>
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
                              <div className="font-semibold text-white">{item.ticker}</div>
                              <div className="text-sm text-muted-foreground">{item.companyName}</div>
                            </div>
                            {price ? (
                              <div className="text-right mr-3">
                                <div className="font-semibold text-white">${price.currentPrice.toFixed(2)}</div>
                                <div className={`text-xs ${price.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {price.change >= 0 ? '▲' : '▼'} {Math.abs(price.changePercent).toFixed(2)}%
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
                    // Handle both filedAt and filed_at field names
                    const filingDate = filing.filed_at || filing.filedAt;
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
                            <div className="font-semibold text-white">{filing.ticker}</div>
                            <div className="text-sm text-muted-foreground">{filing.companyName}</div>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-primary/20 border border-primary text-primary">
                            {filing.formType}
                          </span>
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
      <Navigation />

      <main className="container mx-auto px-6 py-12 pb-16">
        {/* Hero Section */}
        <section className="py-12 grid md:grid-cols-[1.15fr_1fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(15,23,42,0.85)] border border-white/40 text-muted-foreground text-xs uppercase tracking-[0.12em] mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
              AI-Powered SEC Filing Intelligence
            </div>

            <h1 className="text-5xl font-bold tracking-tight mb-3">
              Chat with SEC filings. Get risk scores. See 7-day predictions.
            </h1>

            <p className="text-muted-foreground mb-5 max-w-xl">
              Analyze <strong className="text-gray-200">10-K, 10-Q, and 8-K</strong> filings in plain English. Get
              AI-powered risk analysis, watchlist alerts, and 7-day stock performance
              predictions across <strong className="text-gray-200">640+ US companies</strong>.
            </p>

            <div className="flex flex-wrap gap-2 mb-5">
              <span className="text-xs px-2.5 py-1.5 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-600 text-gray-200">
                ⚠️ Analyst Tracking & Risk Scoring
              </span>
              <span className="text-xs px-2.5 py-1.5 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-600 text-gray-200">
                💬 AI Chat with Filings
              </span>
              <span className="text-xs px-2.5 py-1.5 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-600 text-gray-200">
                📈 7-day Stock Predictions
              </span>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <Button
                onClick={() => router.push('/profile')}
                className="bg-gradient-to-br from-primary to-secondary text-[#0b1120] font-semibold shadow-[0_14px_30px_rgba(34,197,94,0.36)] hover:brightness-110"
              >
                Start Free
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
                      <span>7-day return prediction</span>
                      <span>+3.2% expected</span>
                    </div>
                    <div className="h-8 rounded-lg bg-gradient-to-r from-secondary to-primary opacity-85"></div>
                    <div className="flex justify-between items-center text-[0.7rem] text-muted-foreground mt-1">
                      <span>Predicted vs actual tracked over time</span>
                      <span className="px-2 py-0.5 rounded-full bg-green-900/20 border border-green-600 text-green-300">Signal: Buy / Watch</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features - Compact Version for Marketing Page */}
        <section className="mt-16 pt-14 pb-14 border-t border-[rgba(31,41,55,0.85)]">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Everything you need to analyze SEC filings</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              AI-powered analysis, natural-language chat, smart alerts, and 7-day predictions.
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
                <CardTitle className="text-white">Chat with Filings</CardTitle>
                <CardDescription>
                  Ask questions in plain English and get instant answers from SEC documents
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary flex items-center justify-center mb-3 text-2xl">
                  📈
                </div>
                <CardTitle className="text-white">7-Day Predictions</CardTitle>
                <CardDescription>
                  ML-powered stock performance predictions with transparent reasoning
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          <div className="text-center mt-10">
            <Button
              onClick={() => router.push('/profile')}
              size="lg"
              className="bg-gradient-to-br from-primary to-secondary text-[#0b1120] font-semibold shadow-[0_14px_30px_rgba(34,197,94,0.36)] hover:brightness-110"
            >
              Get Started Free
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
