'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

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
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center space-y-6">
          <h1 className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 pb-2">
            StockHuntr
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            AI-powered SEC filing intelligence to analyze financial data, predict stock movements, and chat with your data using natural language
          </p>
          <div className="inline-block bg-green-50 border border-green-200 rounded-lg px-4 py-2 mt-4">
            <p className="text-sm text-green-700">
              <strong>v3.0:</strong> Analyst Activity Tracking (Most Important ML Feature) • Concern Level Scoring • XBRL Financial Data • Natural Language Chat • 640+ companies tracked
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex justify-center gap-4 mt-8">
            <Button
              size="lg"
              variant="outline"
              onClick={() => router.push('/latest-filings')}
              className="h-12"
            >
              View Latest Filings →
            </Button>
          </div>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto mt-12 space-y-4">
            <Input
              placeholder="Search any ticker (e.g., AAPL, TSLA, MSFT)..."
              className="h-14 text-lg"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button
              className="w-full h-14 text-lg"
              onClick={handleSearch}
              disabled={!ticker}
            >
              Analyze Filing
            </Button>
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
        <div className="container mx-auto px-4">
          <Card className="bg-slate-700 border-slate-600">
            <CardHeader>
              <CardTitle className="text-2xl text-center text-white">
                ⚖️ Important Legal Disclaimers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-200">
              <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4">
                <p className="font-bold text-yellow-300 mb-2">🎓 FOR EDUCATIONAL AND RESEARCH PURPOSES ONLY</p>
                <p>
                  This platform is designed to help users learn about SEC filings, financial analysis techniques, and machine learning applications in finance.
                  It is NOT intended to provide investment advice or trading recommendations.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="font-bold text-white mb-2">⚠️ Not Investment Advice</p>
                  <p className="text-xs">
                    Nothing on this platform constitutes investment, financial, or trading advice.
                    All predictions and analyses are provided for informational purposes only.
                    You should consult with a licensed financial advisor before making any investment decisions.
                  </p>
                </div>

                <div>
                  <p className="font-bold text-white mb-2">📉 Risk of Loss</p>
                  <p className="text-xs">
                    Stock market investing carries significant risk.
                    Past performance does not guarantee future results.
                    Using predictions from this tool for trading may result in financial loss.
                    You could lose some or all of your invested capital.
                  </p>
                </div>

                <div>
                  <p className="font-bold text-white mb-2">🤖 Model Limitations</p>
                  <p className="text-xs">
                    Our machine learning models are experimental and based on historical data.
                    They have inherent limitations and may produce incorrect predictions.
                    Models cannot predict external shocks, market crashes, or company-specific events not disclosed in filings.
                  </p>
                </div>

                <div>
                  <p className="font-bold text-white mb-2">🚫 No Guarantees</p>
                  <p className="text-xs">
                    We make no guarantees about the accuracy, completeness, or reliability of any predictions or analyses.
                    This service is provided "as is" without warranties of any kind.
                    Market data may be delayed or contain errors.
                  </p>
                </div>
              </div>

              <div className="bg-red-900/30 border border-red-600 rounded-lg p-4 mt-4">
                <p className="font-bold text-red-300 mb-2">📋 Your Responsibilities</p>
                <p className="text-xs">
                  By using this service, you acknowledge that: (1) You are solely responsible for your investment decisions,
                  (2) You will conduct your own due diligence before making any trades, (3) You understand the risks of stock market investing,
                  (4) You will not rely solely on this tool for investment decisions, and (5) You may lose money if you trade based on information from this platform.
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
