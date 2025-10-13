'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { Search, Sparkles, TrendingUp, Calendar, Building2, FileText } from 'lucide-react';

interface QueryResult {
  filings?: any[];
  companies?: any[];
  company?: any;
  message?: string;
  error?: string;
}

export default function QueryPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QueryResult | null>(null);
  const router = useRouter();

  const exampleQueries = [
    {
      icon: <TrendingUp className="w-5 h-5" />,
      text: "Show me AAPL stock price and P/E ratio",
      category: "Stock Metrics"
    },
    {
      icon: <Building2 className="w-5 h-5" />,
      text: "List companies with P/E ratio < 15",
      category: "Valuation"
    },
    {
      icon: <TrendingUp className="w-5 h-5" />,
      text: "Show companies with market cap > 100B",
      category: "Large Cap"
    },
    {
      icon: <Building2 className="w-5 h-5" />,
      text: "List all AAPL filings in the last 90 days",
      category: "Company Filings"
    },
    {
      icon: <Calendar className="w-5 h-5" />,
      text: "Show me all 10-Qs filed this month",
      category: "Recent Filings"
    },
    {
      icon: <FileText className="w-5 h-5" />,
      text: "Which companies filed 8-Ks this week?",
      category: "Recent Activity"
    }
  ];

  const handleQuery = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      setResults(data);
    } catch (error) {
      setResults({ error: 'Failed to process query' });
    } finally {
      setLoading(false);
    }
  };

  const useExample = (exampleQuery: string) => {
    setQuery(exampleQuery);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Navigation */}
      <nav className="container mx-auto px-4 py-4 border-b bg-white/50 backdrop-blur-sm">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            SEC Analyzer
          </h2>
          <div className="flex gap-4">
            <Button variant="ghost" onClick={() => router.push('/')}>
              Home
            </Button>
            <Button variant="ghost" onClick={() => router.push('/latest-filings')}>
              Latest Filings
            </Button>
            <Button variant="default" onClick={() => router.push('/query')}>
              Query
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="text-center space-y-4 mb-8">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-full text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            Ask Questions About SEC Filings
          </div>
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            Natural Language Query
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Search through 7,777+ filings from 636 companies using plain English
          </p>
        </div>

        {/* Query Input */}
        <div className="max-w-4xl mx-auto">
          <Card className="border-2 shadow-lg">
            <CardContent className="p-6">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Ask a question... (e.g., 'Show me all Apple 10-Ks filed this year')"
                    className="w-full h-14 pl-12 pr-4 text-lg border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleQuery()}
                  />
                </div>
                <Button
                  size="lg"
                  className="h-14 px-8 text-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  onClick={handleQuery}
                  disabled={!query.trim() || loading}
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Searching...
                    </>
                  ) : (
                    'Search'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Example Queries */}
          <div className="mt-8">
            <p className="text-sm text-slate-600 mb-4 font-medium">Try these examples:</p>
            <div className="grid md:grid-cols-2 gap-3">
              {exampleQueries.map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => useExample(example.text)}
                  className="flex items-start gap-3 p-4 bg-white border-2 border-slate-200 hover:border-blue-400 rounded-lg text-left transition-all hover:shadow-md group"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                    {example.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-500 font-medium mb-1">{example.category}</div>
                    <div className="text-sm text-slate-800">{example.text}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Results Section */}
      {results && (
        <section className="container mx-auto px-4 pb-12">
          <div className="max-w-4xl mx-auto">
            {results.error ? (
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-red-700">Error</CardTitle>
                  <CardDescription className="text-red-600">{results.error}</CardDescription>
                </CardHeader>
              </Card>
            ) : results.company ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-blue-600">{results.company.ticker}</span>
                    <span className="text-lg text-slate-600">{results.company.name}</span>
                  </CardTitle>
                  <CardDescription>Company Financials from Yahoo Finance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    {results.company.currentPrice && (
                      <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                        <div className="text-sm text-slate-600 mb-1">Current Price</div>
                        <div className="text-2xl font-bold text-blue-700">${results.company.currentPrice.toFixed(2)}</div>
                      </div>
                    )}
                    {results.company.marketCap && (
                      <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
                        <div className="text-sm text-slate-600 mb-1">Market Cap</div>
                        <div className="text-2xl font-bold text-purple-700">
                          ${(results.company.marketCap / 1e9).toFixed(2)}B
                        </div>
                      </div>
                    )}
                    {results.company.peRatio && (
                      <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
                        <div className="text-sm text-slate-600 mb-1">P/E Ratio</div>
                        <div className="text-2xl font-bold text-green-700">{results.company.peRatio.toFixed(2)}</div>
                      </div>
                    )}
                    {results.company.forwardPE && (
                      <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg">
                        <div className="text-sm text-slate-600 mb-1">Forward P/E</div>
                        <div className="text-2xl font-bold text-orange-700">{results.company.forwardPE.toFixed(2)}</div>
                      </div>
                    )}
                    {results.company.fiftyTwoWeekHigh && (
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-sm text-slate-600 mb-1">52-Week High</div>
                        <div className="text-xl font-bold text-slate-700">${results.company.fiftyTwoWeekHigh.toFixed(2)}</div>
                      </div>
                    )}
                    {results.company.fiftyTwoWeekLow && (
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-sm text-slate-600 mb-1">52-Week Low</div>
                        <div className="text-xl font-bold text-slate-700">${results.company.fiftyTwoWeekLow.toFixed(2)}</div>
                      </div>
                    )}
                    {results.company.analystTargetPrice && (
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 md:col-span-2">
                        <div className="text-sm text-slate-600 mb-1">Analyst Target Price</div>
                        <div className="text-xl font-bold text-slate-700">${results.company.analystTargetPrice.toFixed(2)}</div>
                      </div>
                    )}
                  </div>
                  {results.company.yahooLastUpdated && (
                    <div className="mt-4 text-xs text-slate-500">
                      Last updated: {new Date(results.company.yahooLastUpdated).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric'
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : results.companies && results.companies.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Found {results.companies.length} Compan{results.companies.length !== 1 ? 'ies' : 'y'}</CardTitle>
                  <CardDescription>{results.message || 'Companies matching your query'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {results.companies.map((company: any, idx: number) => (
                      <div key={idx} className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-bold text-lg text-blue-600">{company.ticker}</span>
                              <span className="text-sm text-slate-700">{company.name}</span>
                            </div>
                            <div className="flex gap-4 text-sm">
                              {company.currentPrice && (
                                <span className="text-slate-600">Price: <strong>${company.currentPrice.toFixed(2)}</strong></span>
                              )}
                              {company.peRatio && (
                                <span className="text-slate-600">P/E: <strong>{company.peRatio.toFixed(2)}</strong></span>
                              )}
                              {company.marketCap && (
                                <span className="text-slate-600">
                                  Market Cap: <strong>${(company.marketCap / 1e9).toFixed(2)}B</strong>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : results.filings && results.filings.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Found {results.filings.length} Filing{results.filings.length !== 1 ? 's' : ''}</CardTitle>
                  <CardDescription>
                    Showing filings matching your query
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {results.filings.map((filing: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer border border-slate-200"
                        onClick={() => window.open(filing.filingUrl, '_blank')}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-bold text-lg text-blue-600">{filing.company.ticker}</span>
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                {filing.filingType}
                              </span>
                              <span className="text-sm text-slate-500">
                                {new Date(filing.filingDate).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700">{filing.company.name}</p>
                          </div>
                          <Button variant="ghost" size="sm">
                            View →
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-slate-200 bg-slate-50">
                <CardHeader>
                  <CardTitle>No Results Found</CardTitle>
                  <CardDescription>Try adjusting your query or using one of the examples above</CardDescription>
                </CardHeader>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardHeader>
                <CardTitle className="text-lg">Company Search</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">
                  Find filings by ticker, company name, or CIK number
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <CardHeader>
                <CardTitle className="text-lg">Date Filtering</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">
                  Search by specific dates, ranges, or relative periods
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardHeader>
                <CardTitle className="text-lg">Filing Types</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">
                  Filter by 10-K, 10-Q, 8-K, and other SEC form types
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
