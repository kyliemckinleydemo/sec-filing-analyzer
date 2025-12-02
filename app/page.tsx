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
      {/* Navigation */}
      <nav className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-blue-600">SEC Analyzer</h2>
          <div className="flex gap-4">
            <Button variant="ghost" onClick={() => router.push('/')}>
              Home
            </Button>
            <Button variant="ghost" onClick={() => router.push('/query')}>
              Query
            </Button>
            <Button variant="ghost" onClick={() => router.push('/latest-filings')}>
              Latest Filings
            </Button>
            <Button variant="ghost" onClick={() => router.push('/faq')}>
              FAQ
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center space-y-6">
          <h1 className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            AI-Powered SEC Filing Intelligence
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Analyze financial data, predict stock movements, and chat with your filing data using natural language
          </p>
          <div className="inline-block bg-green-50 border border-green-200 rounded-lg px-4 py-2 mt-4">
            <p className="text-sm text-green-700">
              <strong>v3.0:</strong> Concern Level Scoring • XBRL Financial Data • Natural Language Chat • 640+ companies tracked
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
                <li>• Query financial metrics & performance trends</li>
                <li>• Compare ML predictions vs actual returns</li>
                <li>• Analyze risk levels across companies</li>
                <li>• Filter by ticker or search across all 430+ companies</li>
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
    </div>
  );
}
