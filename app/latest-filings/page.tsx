'use client';

import { useState, useEffect, Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRouter, useSearchParams } from 'next/navigation';
import { CompanySnapshotTooltip } from '@/components/CompanySnapshotTooltip';

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

interface LatestFiling {
  accessionNumber: string;
  ticker: string;
  companyName: string;
  cik: string;
  filingType: string;
  filingDate: string;
  reportDate: string;
  primaryDocument: string;
  hasXBRL: boolean;
  filingUrl: string;
  edgarUrl: string;
  companySnapshot: CompanySnapshot;
}

interface CompanySuggestion {
  ticker: string;
  name: string;
  marketCap: number | null;
  filingCount: number;
}

function LatestFilingsContent() {
  const searchParams = useSearchParams();
  const [filings, setFilings] = useState<LatestFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [tickerFilter, setTickerFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filingTypeFilter, setFilingTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const router = useRouter();

  // Initialize ticker filter from URL on mount
  useEffect(() => {
    const tickerParam = searchParams.get('ticker');
    if (tickerParam) {
      setTickerFilter(tickerParam.toUpperCase());
      setSearchInput(tickerParam.toUpperCase());
    }
  }, [searchParams]);

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
    }, 300); // Debounce

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1); // Reset to page 1 when filters change
    fetchFilings(1);
  }, [tickerFilter, filingTypeFilter]);

  const fetchFilings = async (page: number = currentPage) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tickerFilter) params.append('ticker', tickerFilter);
      if (filingTypeFilter) params.append('filingType', filingTypeFilter);
      params.append('page', page.toString());

      const response = await fetch(`/api/filings/latest?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      const data = await response.json();

      setFilings(data.filings || data); // Handle both old and new response format
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotalCount(data.pagination.totalCount);
        setCurrentPage(data.pagination.currentPage);
      }
    } catch (error) {
      console.error('Error fetching filings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    fetchFilings(newPage);
  };

  const handleAnalyze = (filing: LatestFiling) => {
    // Normalize accession number (add dashes if missing) to match database format
    const normalizedAccession = filing.accessionNumber.includes('-')
      ? filing.accessionNumber
      : `${filing.accessionNumber.slice(0, 10)}-${filing.accessionNumber.slice(10, 12)}-${filing.accessionNumber.slice(12)}`;

    // Pass filing metadata as query params so the analyze API can create it if needed
    const params = new URLSearchParams({
      ticker: filing.ticker,
      cik: filing.cik,
      filingType: filing.filingType,
      filingDate: filing.filingDate,
      filingUrl: filing.filingUrl,
      companyName: filing.companyName,
    });
    router.push(`/filing/${normalizedAccession}?${params.toString()}`);
  };

  const handleSelectTicker = (ticker: string) => {
    setSearchInput(ticker);
    setTickerFilter(ticker);
    setShowSuggestions(false);
    router.push(`/latest-filings?ticker=${ticker}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setTickerFilter(searchInput.toUpperCase());
      setShowSuggestions(false);
      router.push(`/latest-filings?ticker=${searchInput.toUpperCase()}`);
    }
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setTickerFilter('');
    setSuggestions([]);
    router.push('/latest-filings');
  };

  const getDaysSinceFiling = (filingDate: string) => {
    const days = Math.floor(
      (Date.now() - new Date(filingDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return days;
  };

  const getFilingTypeBadge = (filingType: string) => {
    const colors: Record<string, string> = {
      '10-K': 'bg-blue-100 text-blue-700 border-blue-300',
      '10-Q': 'bg-green-100 text-green-700 border-green-300',
      '8-K': 'bg-purple-100 text-purple-700 border-purple-300',
    };
    return colors[filingType] || 'bg-gray-100 text-gray-700 border-gray-300';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="outline"
          onClick={() => router.push('/')}
          className="mb-6"
        >
          ← Back to Home
        </Button>

        {/* Hero Search Section */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-2xl p-8 mb-8">
          <h1 className="text-4xl font-bold text-white mb-3 text-center">
            🔍 Search SEC Filings
          </h1>
          <p className="text-blue-100 text-center mb-6 text-lg">
            Find AI-powered predictions for your favorite stocks
          </p>

          <form onSubmit={handleSearch} className="max-w-3xl mx-auto">
            <div className="relative">
              <Input
                placeholder="Enter ticker symbol (e.g., AAPL, MSFT, GOOGL) or company name..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value.toUpperCase());
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                className="h-14 text-lg pl-5 pr-28 border-4 border-white/20 focus:border-white/40 bg-white/95 shadow-lg"
              />
              <div className="absolute right-2 top-2 flex gap-2">
                {searchInput && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSearch}
                    className="h-10 text-slate-600 hover:text-slate-900"
                  >
                    Clear
                  </Button>
                )}
                <Button
                  type="submit"
                  size="sm"
                  className="h-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6"
                >
                  Search
                </Button>
              </div>

              {/* Autocomplete Suggestions */}
              {showSuggestions && suggestions.length > 0 && (
                <Card className="absolute w-full mt-2 z-50 shadow-xl max-h-80 overflow-y-auto">
                  {suggestions.map((company) => (
                    <div
                      key={company.ticker}
                      className="p-4 hover:bg-slate-50 cursor-pointer border-b last:border-b-0 transition-colors"
                      onClick={() => handleSelectTicker(company.ticker)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-blue-600 text-lg">{company.ticker}</div>
                          <div className="text-sm text-slate-600">{company.name}</div>
                        </div>
                        <div className="text-right text-sm text-slate-500">
                          {company.filingCount} filings
                        </div>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          </form>

          {tickerFilter && (
            <div className="mt-4 text-center">
              <span className="inline-block bg-white/20 text-white px-4 py-2 rounded-full text-sm">
                Showing results for: <strong>{tickerFilter}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Secondary Filters */}
        <div className="flex gap-4 mb-6 items-center">
          <Select value={filingTypeFilter} onValueChange={setFilingTypeFilter}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="All filing types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All filing types</SelectItem>
              <SelectItem value="10-K">10-K (Annual)</SelectItem>
              <SelectItem value="10-Q">10-Q (Quarterly)</SelectItem>
              <SelectItem value="8-K">8-K (Current Events)</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => fetchFilings(currentPage)}>
            Refresh
          </Button>
          {totalCount > 0 && (
            <span className="text-sm text-slate-600 ml-auto">
              {totalCount} filing{totalCount !== 1 ? 's' : ''} found
            </span>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-slate-600">Fetching latest filings from SEC EDGAR...</p>
          </div>
        )}

        {/* Filings List */}
        {!loading && filings.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-slate-600">No recent filings found. Try adjusting your filters.</p>
          </Card>
        )}

        {!loading && filings.length > 0 && (
          <div className="space-y-4">
            {filings.map((filing) => (
              <Card key={filing.accessionNumber} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CompanySnapshotTooltip
                        ticker={filing.ticker}
                        companyName={filing.companyName}
                        snapshot={filing.companySnapshot}
                      >
                        <h3
                          className="text-xl font-bold text-blue-600 underline decoration-dotted decoration-blue-400 cursor-pointer hover:decoration-solid transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/company/${filing.ticker}`);
                          }}
                        >
                          {filing.ticker}
                        </h3>
                      </CompanySnapshotTooltip>
                        <Badge className={getFilingTypeBadge(filing.filingType)}>
                          {filing.filingType}
                        </Badge>
                        {filing.hasXBRL && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                            Has Financials
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mb-1">{filing.companyName}</p>
                      <div className="flex gap-4 text-sm text-slate-500">
                        <span>Filed: {new Date(filing.filingDate).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{getDaysSinceFiling(filing.filingDate)} days ago</span>
                        {filing.reportDate && (
                          <>
                            <span>•</span>
                            <span>Period: {new Date(filing.reportDate).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleAnalyze(filing)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Analyze
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => window.open(filing.edgarUrl, '_blank')}
                      >
                        View on SEC.gov
                      </Button>
                    </div>
                  </div>
              </Card>
            ))}
          </div>
        )}

        {!loading && filings.length > 0 && (
          <>
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between border-t pt-4">
                <div className="text-sm text-slate-600">
                  Showing page {currentPage} of {totalPages} ({totalCount} total filings)
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
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                    if (pageNum > totalPages) return null;
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
                    disabled={currentPage === totalPages || loading}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            {totalPages === 1 && (
              <div className="mt-6 text-center text-sm text-slate-500">
                Showing {filings.length} filings (last 180 days)
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function LatestFilingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">Loading...</div>}>
      <LatestFilingsContent />
    </Suspense>
  );
}
