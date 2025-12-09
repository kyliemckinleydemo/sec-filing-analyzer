'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { UserMenu } from '@/components/UserMenu';

export default function Home() {
  const [ticker, setTicker] = useState('');
  const router = useRouter();

  const handleSearch = () => {
    if (ticker) {
      router.push(`/company/${ticker.toUpperCase()}/filings`);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-[18px] bg-[#020617] border-b border-white/[0.24]">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[radial-gradient(circle_at_20%_0%,#22d3ee_0%,#22c55e_45%,#0f172a_100%)] flex items-center justify-center text-sm font-bold text-[#0b1120] shadow-[0_10px_30px_rgba(34,197,94,0.45)]">
              SH
            </div>
            <div>
              <div className="font-bold text-base tracking-wide">StockHuntr</div>
              <div className="text-[10px] uppercase tracking-[0.12em] px-2.5 py-0.5 rounded-full border border-white/40 text-muted-foreground inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_0_4px_rgba(34,197,94,0.4)]"></span>
                AI-Powered SEC Filings
              </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-5 text-sm text-muted-foreground">
            <button onClick={() => router.push('/')} className="hover-underline">Home</button>
            <button onClick={() => router.push('/query')} className="hover-underline">Analyze Filing</button>
            <button onClick={() => router.push('/latest-filings')} className="hover-underline">Latest Filings</button>
            <button onClick={() => router.push('/faq')} className="hover-underline">FAQ</button>
          </nav>

          <div className="flex items-center gap-3">
            <UserMenu />
            <Button
              onClick={() => router.push('/profile')}
              className="bg-gradient-to-br from-primary to-secondary text-[#0b1120] font-semibold shadow-[0_14px_30px_rgba(34,197,94,0.36)] hover:brightness-110"
            >
              Start Free
            </Button>
          </div>
        </div>
      </header>

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

        {/* Who it's for */}
        <section className="mt-5 pt-14 pb-14 border-t border-[rgba(31,41,55,0.85)]">
          <div className="mb-5">
            <h2 className="text-3xl font-bold tracking-tight mb-2">Built for investors, analysts, and learners.</h2>
            <p className="text-muted-foreground max-w-lg">
              StockHuntr turns dense SEC filings into clear, AI-powered insights—
              whether you're managing your own portfolio, running a book, or
              exploring filings for research and education.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-600 bg-[radial-gradient(circle_at_top,rgba(30,64,175,0.35),rgba(15,23,42,0.95))] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.7)]">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Use Case</div>
              <h3 className="font-semibold mb-1.5">Retail & active investors</h3>
              <p className="text-sm text-gray-200">
                See risk levels and 7-day predictions before you trade. Quickly
                surface what actually changed in the latest 10-K, 10-Q, or 8-K—
                without reading 200 pages line by line.
              </p>
            </div>

            <div className="rounded-xl border border-gray-600 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.3),rgba(15,23,42,0.95))] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.7)]">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Use Case</div>
              <h3 className="font-semibold mb-1.5">Analysts & portfolio managers</h3>
              <p className="text-sm text-gray-200">
                Track analyst upgrades/downgrades around filings, compare predicted
                vs actual returns, and monitor risk signals across your coverage
                universe in one place.
              </p>
            </div>

            <div className="rounded-xl border border-gray-600 bg-[radial-gradient(circle_at_top,rgba(234,179,8,0.32),rgba(15,23,42,0.95))] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.7)]">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Use Case</div>
              <h3 className="font-semibold mb-1.5">Students & researchers</h3>
              <p className="text-sm text-gray-200">
                Explore SEC data, sentiment, and ML predictions as a live lab for
                finance, accounting, and data science—grounded in real filings and
                real market outcomes.
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mt-5 pt-14 pb-14 border-t border-[rgba(31,41,55,0.85)]">
          <div className="mb-5">
            <h2 className="text-3xl font-bold tracking-tight mb-2">Everything you need in one SEC AI terminal.</h2>
            <p className="text-muted-foreground max-w-lg">
              AI analysis, natural-language chat, smart alerts, visual performance
              insights, and 7-day stock predictions—powered by Claude AI and live
              SEC data.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {/* AI Analysis */}
            <div className="rounded-xl bg-[rgba(15,23,42,0.96)] border border-white/[0.18] p-4 relative overflow-hidden">
              <div className="absolute inset-[-40%] bg-[radial-gradient(circle_at_0_0,rgba(34,211,238,0.16),transparent_55%)] opacity-90 pointer-events-none"></div>
              <div className="relative z-10">
                <div className="w-7 h-7 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-700 flex items-center justify-center mb-2">⚠️</div>
                <h3 className="font-semibold mb-2">AI Analysis & Risk Scoring</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Claude AI analyzes filings with comprehensive 0–10 concern level scoring (LOW to CRITICAL), highlighting what matters most.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  <li>Analyst upgrades/downgrades 30 days before filing</li>
                  <li>0–10 concern level scoring (LOW to CRITICAL)</li>
                  <li>Enhanced risk analysis (breaches, litigation, exec changes)</li>
                  <li>Management sentiment & tone shifts</li>
                  <li>Earnings surprise detection (beat/miss)</li>
                </ul>
              </div>
            </div>

            {/* Chat */}
            <div className="rounded-xl bg-[rgba(15,23,42,0.96)] border border-white/[0.18] p-4 relative overflow-hidden">
              <div className="absolute inset-[-40%] bg-[radial-gradient(circle_at_0_0,rgba(34,211,238,0.16),transparent_55%)] opacity-90 pointer-events-none"></div>
              <div className="relative z-10">
                <div className="w-7 h-7 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-700 flex items-center justify-center mb-2">💬</div>
                <h3 className="font-semibold mb-2">Chat with SEC Filings</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Ask questions about any company's filings in plain English and get instant answers grounded in 10-K, 10-Q, and 8-K text.
                </p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className="text-xs px-2 py-1 rounded-full border border-gray-700 bg-[rgba(15,23,42,0.98)] text-gray-200">"What business segments?"</span>
                  <span className="text-xs px-2 py-1 rounded-full border border-gray-700 bg-[rgba(15,23,42,0.98)] text-gray-200">"% revenue international?"</span>
                  <span className="text-xs px-2 py-1 rounded-full border border-gray-700 bg-[rgba(15,23,42,0.98)] text-gray-200">"Main risk factors?"</span>
                </div>
                <p className="text-sm text-gray-200 mt-2">No search gymnastics. Just ask and see the filing-backed answer.</p>
              </div>
            </div>

            {/* Watchlist */}
            <div className="rounded-xl bg-[rgba(15,23,42,0.96)] border border-white/[0.18] p-4 relative overflow-hidden">
              <div className="absolute inset-[-40%] bg-[radial-gradient(circle_at_0_0,rgba(34,211,238,0.16),transparent_55%)] opacity-90 pointer-events-none"></div>
              <div className="relative z-10">
                <div className="w-7 h-7 rounded-full bg-[rgba(15,23,42,0.9)] border border-gray-700 flex items-center justify-center mb-2">📧</div>
                <h3 className="font-semibold mb-2">Watchlist Alerts</h3>
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
                  Data-driven predictions of 7-day forward stock performance, with transparent model reasoning.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  <li>7-day return predictions with confidence scores</li>
                  <li>Transparent model reasoning & feature breakdown</li>
                  <li>Prediction vs actual comparison charts</li>
                  <li>Buy/Sell/Hold signals based on magnitude</li>
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
                Add names to your watchlist, monitor 7-day predictions and risk
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
                    <td className="py-2">7-day ML predictions</td>
                    <td className="text-primary">✓</td>
                    <td className="text-white/70">–</td>
                    <td className="text-white/70">–</td>
                  </tr>
                  <tr className="border-b border-[rgba(31,41,55,0.9)]">
                    <td className="py-2">Chat with filings</td>
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
                    <td className="text-primary">Fraction of cost</td>
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
                <li>You will not rely solely on this tool for investment decisions.</li>
                <li>You may lose money if you trade based on predictions from this platform.</li>
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
                our 7-day predictions to what actually happens in the market.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
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

      <style jsx>{`
        .hover-underline {
          position: relative;
        }
        .hover-underline::after {
          content: '';
          position: absolute;
          left: 0;
          bottom: -4px;
          width: 0;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(to right, #22c55e, #22d3ee);
          transition: width 0.16s ease-out;
        }
        .hover-underline:hover::after {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
