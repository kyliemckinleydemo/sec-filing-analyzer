'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { Search, Sparkles, TrendingUp, Calendar, Building2, FileText } from 'lucide-react';
import { CompanySnapshotTooltip } from '@/components/CompanySnapshotTooltip';

interface QueryResult {
  filings?: any[];
  companies?: any[];
  company?: any;
  snapshots?: any[];
  filing?: any;
  before?: any;
  after?: any;
  message?: string;
  error?: string;
  totalCount?: number;
  pageSize?: number;
  currentPage?: number;
  totalPages?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export default function QueryPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QueryResult | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();

  // Helper function to get sort indicator for a field
  const getSortIndicator = (fieldName: string) => {
    if (!results?.sortBy) return '';
    if (results.sortBy === fieldName) {
      return results.sortOrder === 'desc' ? ' ↓' : ' ↑';
    }
    return '';
  };

  const exampleQueries = [
    {
      icon: <Building2 className="w-5 h-5" />,
      text: "Show companies with dividend yield > 3%",
      category: "Dividend Screening"
    },
    {
      icon: <TrendingUp className="w-5 h-5" />,
      text: "Find low beta stocks under 0.8",
      category: "Low Volatility"
    },
    {
      icon: <FileText className="w-5 h-5" />,
      text: "Show companies with revenue growth > 20%",
      category: "Growth Screen"
    },
    {
      icon: <TrendingUp className="w-5 h-5" />,
      text: "Find undervalued stocks (vs analyst targets)",
      category: "Value Screening"
    },
    {
      icon: <Building2 className="w-5 h-5" />,
      text: "Show tech companies that are undervalued",
      category: "Sector + Value"
    },
    {
      icon: <TrendingUp className="w-5 h-5" />,
      text: "PE < 15 and dividend yield > 3%",
      category: "Compound Query"
    },
    {
      icon: <Building2 className="w-5 h-5" />,
      text: "Show companies with market cap > 500B",
      category: "Large Cap Filter"
    },
    {
      icon: <Calendar className="w-5 h-5" />,
      text: "List all AAPL filings in the last 90 days",
      category: "Company Filings"
    }
  ];

  const handleQuery = async (page: number = 1) => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, page }),
      });

      const data = await response.json();
      setResults(data);
      setCurrentPage(page);
    } catch (error) {
      setResults({ error: 'Failed to process query' });
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    handleQuery(newPage);
  };

  const useExample = (exampleQuery: string) => {
    setQuery(exampleQuery);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="text-center space-y-4 mb-8">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-full text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            Advanced Financial Screening & Analysis
          </div>
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 pb-2 leading-tight">
            Natural Language Query
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Screen stocks by dividends, growth, valuation, and risk • Query financials, analyst ratings, and SEC filings • 640+ companies tracked
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
                    placeholder="Ask a question... (e.g., 'Show AAPL analyst target price history')"
                    className="w-full h-14 pl-12 pr-4 text-lg text-slate-900 placeholder:text-slate-500 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleQuery()}
                  />
                </div>
                <Button
                  size="lg"
                  className="h-14 px-8 text-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  onClick={() => handleQuery()}
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
            ) : results.snapshots && results.snapshots.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <span
                      className="text-2xl font-bold text-blue-600 cursor-pointer hover:underline"
                      onClick={() => router.push(`/company/${results.company.ticker}`)}
                    >
                      {results.company.ticker}
                    </span>
                    <span className="text-lg text-slate-600">{results.company.name}</span>
                  </CardTitle>
                  <CardDescription>{results.message || 'Historical Snapshots'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {results.snapshots.map((snapshot: any, idx: number) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-slate-700">
                            {new Date(snapshot.snapshotDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                          <div className="flex gap-4 text-sm">
                            {snapshot.currentPrice && (
                              <span className="text-slate-600">
                                Price: <strong>${snapshot.currentPrice.toFixed(2)}</strong>
                              </span>
                            )}
                            {snapshot.analystTargetPrice && (
                              <span className="text-blue-600">
                                Target: <strong>${snapshot.analystTargetPrice.toFixed(2)}</strong>
                              </span>
                            )}
                            {snapshot.peRatio && (
                              <span className="text-slate-600">
                                P/E: <strong>{snapshot.peRatio.toFixed(2)}</strong>
                              </span>
                            )}
                            {snapshot.epsEstimateCurrentY && (
                              <span className="text-green-600">
                                EPS Est: <strong>${snapshot.epsEstimateCurrentY.toFixed(2)}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : results.before || results.after ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <span
                      className="text-2xl font-bold text-blue-600 cursor-pointer hover:underline"
                      onClick={() => router.push(`/company/${results.company.ticker}`)}
                    >
                      {results.company.ticker}
                    </span>
                    <span className="text-lg text-slate-600">{results.company.name}</span>
                  </CardTitle>
                  <CardDescription>{results.message || 'Before/After Comparison'}</CardDescription>
                </CardHeader>
                <CardContent>
                  {results.filing && (
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="font-semibold text-blue-900 mb-1">Filing: {results.filing.filingType}</div>
                      <div className="text-sm text-blue-700">
                        {new Date(results.filing.filingDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-3 text-slate-700">Before Filing</h3>
                      {results.before ? (
                        <div className="space-y-3">
                          <div className="p-3 bg-slate-50 rounded">
                            <div className="text-xs text-slate-500 mb-1">Snapshot Date</div>
                            <div className="text-sm font-medium">
                              {new Date(results.before.snapshotDate).toLocaleDateString()}
                            </div>
                          </div>
                          {results.before.analystTargetPrice && (
                            <div className="p-3 bg-slate-50 rounded">
                              <div className="text-xs text-slate-500 mb-1">Analyst Target</div>
                              <div className="text-lg font-bold text-blue-600">
                                ${results.before.analystTargetPrice.toFixed(2)}
                              </div>
                            </div>
                          )}
                          {results.before.epsEstimateCurrentY && (
                            <div className="p-3 bg-slate-50 rounded">
                              <div className="text-xs text-slate-500 mb-1">EPS Estimate (Current Year)</div>
                              <div className="text-lg font-bold text-green-600">
                                ${results.before.epsEstimateCurrentY.toFixed(2)}
                              </div>
                            </div>
                          )}
                          {results.before.peRatio && (
                            <div className="p-3 bg-slate-50 rounded">
                              <div className="text-xs text-slate-500 mb-1">P/E Ratio</div>
                              <div className="text-lg font-bold">{results.before.peRatio.toFixed(2)}</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">No snapshot before filing</div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-3 text-slate-700">After Filing</h3>
                      {results.after ? (
                        <div className="space-y-3">
                          <div className="p-3 bg-slate-50 rounded">
                            <div className="text-xs text-slate-500 mb-1">Snapshot Date</div>
                            <div className="text-sm font-medium">
                              {new Date(results.after.snapshotDate).toLocaleDateString()}
                            </div>
                          </div>
                          {results.after.analystTargetPrice && (
                            <div className="p-3 bg-green-50 rounded border border-green-200">
                              <div className="text-xs text-green-700 mb-1">Analyst Target</div>
                              <div className="text-lg font-bold text-green-700">
                                ${results.after.analystTargetPrice.toFixed(2)}
                                {results.before?.analystTargetPrice && (
                                  <span className="text-sm ml-2">
                                    ({results.after.analystTargetPrice > results.before.analystTargetPrice ? '+' : ''}
                                    {((results.after.analystTargetPrice - results.before.analystTargetPrice) / results.before.analystTargetPrice * 100).toFixed(1)}%)
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          {results.after.epsEstimateCurrentY && (
                            <div className="p-3 bg-green-50 rounded border border-green-200">
                              <div className="text-xs text-green-700 mb-1">EPS Estimate (Current Year)</div>
                              <div className="text-lg font-bold text-green-700">
                                ${results.after.epsEstimateCurrentY.toFixed(2)}
                                {results.before?.epsEstimateCurrentY && (
                                  <span className="text-sm ml-2">
                                    ({results.after.epsEstimateCurrentY > results.before.epsEstimateCurrentY ? '+' : ''}
                                    {((results.after.epsEstimateCurrentY - results.before.epsEstimateCurrentY) / results.before.epsEstimateCurrentY * 100).toFixed(1)}%)
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          {results.after.peRatio && (
                            <div className="p-3 bg-slate-50 rounded">
                              <div className="text-xs text-slate-500 mb-1">P/E Ratio</div>
                              <div className="text-lg font-bold">{results.after.peRatio.toFixed(2)}</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">No snapshot after filing</div>
                      )}
                    </div>
                  </div>
                </CardContent>
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
                  <CardTitle>
                    Found {results.totalCount || results.companies.length} Compan{(results.totalCount || results.companies.length) !== 1 ? 'ies' : 'y'}
                  </CardTitle>
                  <CardDescription>{results.message || 'Companies matching your query'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {results.companies.map((company: any, idx: number) => (
                      <div key={idx} className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <CompanySnapshotTooltip
                                ticker={company.ticker}
                                companyName={company.name}
                                snapshot={{
                                  currentPrice: company.currentPrice,
                                  marketCap: company.marketCap,
                                  peRatio: company.peRatio,
                                  dividendYield: company.dividendYield,
                                  beta: company.beta,
                                  latestRevenue: company.latestRevenue,
                                  latestRevenueYoY: company.latestRevenueYoY || company.revenueGrowth,
                                  latestNetIncome: company.latestNetIncome,
                                  latestNetIncomeYoY: company.latestNetIncomeYoY,
                                  latestGrossMargin: company.latestGrossMargin,
                                  latestOperatingMargin: company.latestOperatingMargin,
                                  latestQuarter: company.latestQuarter,
                                  analystTargetPrice: company.analystTargetPrice
                                }}
                              >
                                <span
                                  className="font-bold text-lg text-blue-600 underline decoration-dotted decoration-blue-400 cursor-pointer hover:decoration-solid transition-all"
                                  onClick={() => router.push(`/company/${company.ticker}`)}
                                >
                                  {company.ticker}
                                </span>
                              </CompanySnapshotTooltip>
                              <span className="text-sm text-slate-700">{company.name}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => router.push(`/company/${company.ticker}`)}
                                className="ml-2"
                              >
                                View Snapshot →
                              </Button>
                            </div>
                              <div className="flex gap-4 text-sm flex-wrap">
                              {company.currentPrice && (
                                <span className="text-slate-600">Price{getSortIndicator('currentPrice')}: <strong>${company.currentPrice.toFixed(2)}</strong></span>
                              )}
                              {company.peRatio && (
                                <span className="text-slate-600">P/E{getSortIndicator('peRatio')}: <strong>{company.peRatio.toFixed(2)}</strong></span>
                              )}
                              {company.marketCap && (
                                <span className="text-slate-600">
                                  Market Cap{getSortIndicator('marketCap')}: <strong>${(company.marketCap / 1e9).toFixed(2)}B</strong>
                                </span>
                              )}
                              {company.dividendYield != null && (
                                <span className="text-slate-600">
                                  Dividend Yield{getSortIndicator('dividendYield')}: <strong>{(company.dividendYield * 100).toFixed(2)}%</strong>
                                </span>
                              )}
                              {company.beta != null && (
                                <span className="text-slate-600">
                                  Beta{getSortIndicator('beta')}: <strong>{company.beta.toFixed(2)}</strong>
                                </span>
                              )}
                              {(company.revenueGrowth != null || company.latestRevenueYoY != null) && (
                                <span className="text-slate-600">
                                  Revenue Growth{getSortIndicator('latestRevenueYoY')}: <strong>{(company.revenueGrowth ?? company.latestRevenueYoY).toFixed(1)}%</strong>
                                </span>
                              )}
                              {company.latestNetIncome != null && (
                                <span className="text-slate-600">
                                  Net Income{getSortIndicator('latestNetIncome')}: <strong>${(company.latestNetIncome / 1e9).toFixed(2)}B</strong>
                                </span>
                              )}
                              {company.latestOperatingMargin != null && (
                                <span className="text-slate-600">
                                  Operating Margin{getSortIndicator('latestOperatingMargin')}: <strong>{company.latestOperatingMargin.toFixed(1)}%</strong>
                                </span>
                              )}
                              {company.fiftyTwoWeekHigh != null && (
                                <span className="text-slate-600">
                                  52W High: <strong>${company.fiftyTwoWeekHigh.toFixed(2)}</strong>
                                </span>
                              )}
                              {company.upside != null && (
                                <span className="text-green-600">
                                  Upside{getSortIndicator('upsideValue')}: <strong>{company.upside}%</strong>
                                </span>
                              )}
                              {company.analystTargetPrice != null && (
                                <span className="text-slate-600">
                                  Target{getSortIndicator('analystTargetPrice')}: <strong>${company.analystTargetPrice.toFixed(2)}</strong>
                                </span>
                              )}
                              {company.previousTarget != null && company.latestTarget != null && company.changePercent != null && (
                                <span className={company.change > 0 ? 'text-green-600' : 'text-red-600'}>
                                  Target{getSortIndicator('changePercent')}: <strong>${company.previousTarget.toFixed(2)}</strong> → <strong>${company.latestTarget.toFixed(2)}</strong>
                                  <span className="ml-1">({company.change > 0 ? '+' : ''}{company.changePercent.toFixed(1)}%)</span>
                                </span>
                              )}
                              {company.daysBetween !== undefined && (
                                <span className="text-slate-500 text-xs">
                                  {company.daysBetween} day{company.daysBetween !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="ml-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/latest-filings?ticker=${company.ticker}`)}
                              className="whitespace-nowrap"
                            >
                              View Filings →
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination Controls */}
                  {results.totalPages && results.totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between border-t pt-4">
                      <div className="text-sm text-slate-600">
                        Showing page {results.currentPage} of {results.totalPages} ({results.totalCount} total companies)
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 1 || loading}
                        >
                          Previous
                        </Button>
                        {Array.from({ length: Math.min(5, results.totalPages) }, (_, i) => {
                          const pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                          if (pageNum > results.totalPages!) return null;
                          return (
                            <Button
                              key={pageNum}
                              variant={pageNum === currentPage ? "default" : "outline"}
                              size="sm"
                              onClick={() => handlePageChange(pageNum)}
                              disabled={loading}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage === results.totalPages || loading}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
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
                        onClick={() => router.push(`/company/${filing.company.ticker}`)}
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

      {/* Available Data Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">📊 Queryable Financial Data</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Price & Valuation</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-slate-700 space-y-1">
                  <li>• Sector & Industry</li>
                  <li>• Current price</li>
                  <li>• Market cap</li>
                  <li>• P/E ratio & Forward P/E</li>
                  <li>• 52-week high/low</li>
                  <li>• Analyst target price</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Financial Fundamentals</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-slate-700 space-y-1">
                  <li>• Revenue & YoY growth</li>
                  <li>• Net income & YoY growth</li>
                  <li>• EPS & YoY growth</li>
                  <li>• Gross margin</li>
                  <li>• Operating margin</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Dividends & Risk</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-slate-700 space-y-1">
                  <li>• Dividend yield</li>
                  <li>• Beta (volatility)</li>
                  <li>• Volume & avg volume</li>
                  <li>• Analyst ratings</li>
                  <li>• Analyst coverage</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">SEC Filings</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-slate-700 space-y-1">
                  <li>• 10-K, 10-Q, 8-K filings</li>
                  <li>• Filing dates & ranges</li>
                  <li>• Company-specific search</li>
                  <li>• Date-based filtering</li>
                  <li>• 640+ companies tracked</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
            <p className="text-sm text-center text-slate-700">
              <strong>Advanced Screening:</strong> Combine multiple criteria • Filter by growth rates • Find undervalued stocks • Screen dividends • Assess risk
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
