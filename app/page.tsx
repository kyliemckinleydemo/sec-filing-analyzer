'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { UserMenu } from '@/components/UserMenu';

export default function Home() {
  const [ticker, setTicker] = useState('');
  const router = useRouter();

  const handleSearch = () => {
    if (ticker) {
      router.push(`/company/${ticker.toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Top Navigation Bar */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
              StockHuntr
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/latest-filings')}
            >
              Latest Filings
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/faq')}
            >
              FAQ
            </Button>
          </div>
          <UserMenu />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center space-y-8">
          <div className="space-y-4">
            <div className="inline-block bg-white rounded-2xl px-12 py-6 shadow-xl border-2 border-slate-200">
              <h1 className="text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
                StockHuntr
              </h1>
            </div>
            <p className="text-2xl text-slate-700 max-w-3xl mx-auto leading-relaxed">
              AI-Powered SEC Filing Analysis & Stock Predictions
            </p>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Analyze financial data • Predict stock movements • Chat with natural language
            </p>
          </div>

          {/* Compact Feature Tags */}
          <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-xs font-medium border border-blue-200">
              📊 Analyst Tracking
            </span>
            <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full text-xs font-medium border border-purple-200">
              ⚠️ Risk Scoring
            </span>
            <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-xs font-medium border border-green-200">
              💰 XBRL Data
            </span>
            <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 px-3 py-1.5 rounded-full text-xs font-medium border border-orange-200">
              💬 Natural Language
            </span>
            <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-700 px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200">
              🏢 640+ Companies
            </span>
          </div>

          {/* Search Bar - More Prominent */}
          <div className="max-w-2xl mx-auto mt-12 space-y-4">
            <div className="relative">
              <Input
                placeholder="Enter any ticker symbol (AAPL, TSLA, MSFT)..."
                className="h-16 text-lg px-6 shadow-lg border-2 border-slate-200 focus:border-blue-400 transition-all"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1 h-14 text-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg"
                onClick={handleSearch}
                disabled={!ticker}
              >
                <span className="mr-2">🔍</span>
                Analyze Filing
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => router.push('/latest-filings')}
                className="h-14 px-6 border-2 hover:bg-slate-50"
              >
                Latest Filings →
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-4xl">🤖</span>
                AI Analysis & Risk Scoring
              </CardTitle>
              <CardDescription>
                Claude AI analyzes filings with comprehensive concern level scoring
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>• Analyst upgrades/downgrades 30 days before filing (most predictive)</li>
                <li>• 0-10 concern level scoring (LOW to CRITICAL)</li>
                <li>• Enhanced risk analysis (breaches, litigation, exec changes)</li>
                <li>• Management sentiment & tone shifts</li>
                <li>• Earnings surprise detection (beat/miss)</li>
                <li>• XBRL financial data extraction with YoY growth</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-4xl">📈</span>
                Stock Predictions
              </CardTitle>
              <CardDescription>
                Data-driven predictions of 7-day forward stock performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>• 7-day return predictions with confidence scores</li>
                <li>• Transparent model reasoning & feature breakdown</li>
                <li>• Prediction vs actual comparison charts</li>
                <li>• Buy/Sell/Hold signals based on magnitude</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-4xl">💬</span>
                Natural Language Chat
              </CardTitle>
              <CardDescription>
                Ask questions about filings using plain English
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>• Find undervalued stocks based on financial metrics</li>
                <li>• Query analyst upgrades/downgrades & street sentiment</li>
                <li>• Query financial metrics & performance trends</li>
                <li>• Analyze risk levels across companies</li>
                <li>• Filter by ticker or search across all 640+ companies</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-4xl">📊</span>
                Visual Insights
              </CardTitle>
              <CardDescription>
                Clear visualizations showing prediction accuracy and performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>• Bar charts: predicted vs actual returns</li>
                <li>• Line charts: performance over time</li>
                <li>• Real-time filing feed (640+ companies tracked)</li>
                <li>• Color-coded accuracy indicators</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Value Prop */}
      <section className="container mx-auto px-4 py-20">
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-2">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Why Use This Tool?</CardTitle>
            <CardDescription className="text-lg mt-4">
              Bloomberg costs $2K+/month with no ML predictions or AI analysis.
              <br />
              Free tools just show raw filings with no financial insights.
              <br />
              <strong>Our tool: AI risk scoring + XBRL financial data + stock predictions + natural language chat.</strong>
              <br />
              <span className="text-blue-600 font-semibold mt-2 inline-block">
                All at a fraction of traditional terminal costs.
              </span>
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      {/* Legal Disclaimer Footer */}
      <section className="bg-slate-800 text-white py-12 mt-20">
        <div className="container mx-auto px-4 max-w-4xl">
          <Card className="bg-slate-700 border-slate-600">
            <CardHeader>
              <CardTitle className="text-2xl text-center text-white">
                ⚖️ Important Legal Disclaimers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4">
                <p className="font-bold text-yellow-300 mb-2">🎓 FOR EDUCATIONAL AND RESEARCH PURPOSES ONLY</p>
                <p className="text-sm text-slate-200">
                  This platform is designed to help users learn about SEC filings, financial analysis techniques, and machine learning applications in finance.
                  It is NOT intended to provide investment advice or trading recommendations. Nothing on this platform constitutes investment, financial, or trading advice.
                </p>
              </div>

              <div className="bg-red-900/30 border border-red-600 rounded-lg p-4">
                <p className="font-bold text-red-300 mb-2">📋 Your Responsibilities</p>
                <p className="text-sm text-slate-200">
                  By using this service, you acknowledge that: (1) You are solely responsible for your investment decisions,
                  (2) You will conduct your own due diligence before making any trades, (3) You understand the risks of stock market investing,
                  (4) You will not rely solely on this tool for investment decisions, and (5) You may lose money if you trade based on predictions from this platform.
                  Stock markets are unpredictable and you could lose some or all of your invested capital.
                </p>
              </div>

              <div className="text-center mt-6 pt-6 border-t border-slate-600">
                <p className="text-xs text-slate-400 mb-3">
                  This platform is not regulated by the SEC, FINRA, or any other financial regulatory authority.
                  We are not registered as an investment adviser or broker-dealer.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/faq')}
                  className="bg-slate-600 hover:bg-slate-500 text-white border-slate-500"
                >
                  View Full Terms of Service & Legal Disclaimers →
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
