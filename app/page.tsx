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
            AI-Powered SEC Filing Analysis
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Using SEC filings to predict 7 business day forward stock performance
          </p>
          <div className="inline-block bg-green-50 border border-green-200 rounded-lg px-4 py-2 mt-4">
            <p className="text-sm text-green-700">
              <strong>v2.3:</strong> Optimized model with sentiment & risk analysis • 430 companies tracked
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
        <div className="grid md:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-4xl">🤖</span>
                AI Analysis
              </CardTitle>
              <CardDescription>
                Conversational AI explains complex filings in plain English
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>• Risk factor analysis</li>
                <li>• Sentiment scoring</li>
                <li>• Executive summaries</li>
                <li>• Chat with filings</li>
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
                ML-powered predictions of post-filing price movements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>• 7-day return predictions</li>
                <li>• Confidence scores</li>
                <li>• Historical accuracy</li>
                <li>• Feature explanations</li>
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
                Interactive charts showing filing impact on stock price
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>• Price charts with markers</li>
                <li>• Filing timelines</li>
                <li>• Multi-company compare</li>
                <li>• Historical patterns</li>
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
              Bloomberg costs $2K+/month and doesn't predict price movements.
              <br />
              Free tools just show raw filings with no analysis.
              <br />
              <strong>Our tool: AI analysis + predictions at a fraction of the cost.</strong>
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </div>
  );
}
