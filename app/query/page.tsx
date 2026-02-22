/**
 * @module page
 * @description Interactive query interface for stock screening and AI-powered SEC filing analysis
 *
 * PURPOSE:
 * This component serves as the main query interface for the financial analysis platform,
 * providing users with dual capabilities:
 * 1. Instant stock screening based on fundamental metrics (dividends, P/E, growth, etc.)
 * 2. AI-powered natural language analysis of SEC filings and company data
 * 
 * The page implements intelligent query routing that automatically determines whether
 * to use database screening (instant results) or AI analysis (deeper insights) based on
 * the query structure and selected mode.
 *
 * EXPORTS:
 * - QueryPageContent: Main query interface component with search, filters, and results
 * - QueryPage: Suspense-wrapped default export for Next.js page routing
 *
 * CLAUDE NOTES:
 * - Uses 'use client' directive for client-side interactivity and state management
 * - Three query modes: 'auto' (smart routing), 'screen' (DB only), 'ai' (AI only)
 * - Supports streaming responses for AI queries using ReadableStream
 * - Includes ticker/sector filters that apply to AI queries for focused analysis
 * - Pagination implemented for large screening result sets
 * - CompanySnapshotTooltip provides hover previews of company metrics
 * - Markdown formatting applied to AI responses with link/emphasis support
 * - URL params support pre-filling ticker filter (e.g., ?ticker=AAPL)
 * - Example queries categorized by type (screening vs AI analysis)
 * - Results display adapts to query type: companies, filings, snapshots, or before/after comparisons
 * - AI chat history maintained in state for follow-up questions
 * - Authentication required for AI mode (free tier: 100 queries/day)
 * - Valid sectors restricted to 11 predefined categories matching database schema
 */

'use client';

import { useState, useRef, useEffect, Suspense, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Sparkles, TrendingUp, Calendar, Building2, FileText, MessageSquare, Brain, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
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
  fallback?: boolean;
  totalCount?: number;
  pageSize?: number;
  currentPage?: number;
  totalPages?: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const VALID_SECTORS = [
  'Basic Materials',
  'Communication Services',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Energy',
  'Financial Services',
  'Healthcare',
  'Industrials',
  'Real Estate',
  'Technology',
  'Utilities',
];

function formatMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:text-blue-800 underline">$1</a>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="text-slate-900">$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-gray-100 text-slate-900 px-1 rounded">$1</code>')
    .replace(/\n\n/g, '</p><p class="text-slate-900 mt-2">')
    .replace(/\n/g, '<br/>');
}

function QueryPageContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QueryResult | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [mode, setMode] = useState<'auto' | 'screen' | 'ai'>('auto');
  const [aiMessages, setAiMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [ticker, setTicker] = useState('');
  const [sector, setSector] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [lastQueryType, setLastQueryType] = useState<'screen' | 'ai' | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Auto-fill ticker from URL parameter
  useEffect(() => {
    const tickerParam = searchParams.get('ticker');
    if (tickerParam) {
      setTicker(tickerParam.toUpperCase());
      setSector('');
      setShowFilters(true);
    }
  }, [searchParams]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  const sectorOptions = useMemo(() => {
    return VALID_SECTORS.map((s) => (
      <option key={s} value={s}>{s}</option>
    ));
  }, []);

  const screenExamples = [
    { icon: <Building2 className="w-5 h-5" />, text: "Show companies with dividend yield > 3%", category: "Dividend Screening" },
    { icon: <TrendingUp className="w-5 h-5" />, text: "Find low beta stocks under 0.8", category: "Low Volatility" },
    { icon: <FileText className="w-5 h-5" />, text: "Show companies with revenue growth > 20%", category: "Growth Screen" },
    { icon: <TrendingUp className="w-5 h-5" />, text: "Find undervalued stocks (vs analyst targets)", category: "Value Screening" },
    { icon: <Building2 className="w-5 h-5" />, text: "Show tech companies that are undervalued", category: "Sector + Value" },
    { icon: <TrendingUp className="w-5 h-5" />, text: "PE < 15 and dividend yield > 3%", category: "Compound Query" },
    { icon: <Building2 className="w-5 h-5" />, text: "Show companies with market cap > 500B", category: "Large Cap Filter" },
    { icon: <Calendar className="w-5 h-5" />, text: "List all AAPL filings in the last 90 days", category: "Company Filings" },
  ];

  const aiExamples = [
    { icon: <Brain className="w-5 h-5" />, text: "What are AAPL's biggest risk factors from recent filings?", category: "Risk Analysis" },
    { icon: <BarChart3 className="w-5 h-5" />, text: "How has MSFT revenue growth trended over recent quarters?", category: "Revenue Trends" },
    { icon: <MessageSquare className="w-5 h-5" />, text: "Which filings had high concern levels but positive returns?", category: "Concern vs Returns" },
    { icon: <Brain className="w-5 h-5" />, text: "Compare revenue growth across the Technology sector", category: "Sector Comparison" },
  ];

  const handleAIQuery = async (queryText: string) => {
    setLastQueryType('ai');
    setResults(null);
    setIsStreaming(true);

    const userMessage: Message = { role: 'user', content: queryText };
    setAiMessages((prev) => [...prev, userMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryText,
          ticker: ticker || undefined,
          sector: sector || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        if (errorData.requiresAuth || response.status === 401) {
          setAiMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `**Sign up to use AI analysis**\n\nAI-powered analysis requires a free account. [Sign up here](/profile) to get started with 100 queries per day!\n\nIn the meantime, try a stock screening query — those work without an account.`,
            },
          ]);
          setIsStreaming(false);
          return;
        }

        throw new Error(errorData.message || errorData.error || 'Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      let assistantMessage = '';
      setAiMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          assistantMessage += chunk;

          setAiMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: assistantMessage,
            };
            return updated;
          });
        }
      }
    } catch (error: any) {
      console.error('AI query error:', error);
      setAiMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `**Error**: ${error.message}. Try rephrasing your question or use a screening query instead.`,
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleQuery = async (page: number = 1) => {
    if (!query.trim()) return;

    setLoading(true);

    // Mode: AI only
    if (mode === 'ai') {
      setLoading(false);
      await handleAIQuery(query);
      setQuery('');
      return;
    }

    // Mode: Screen only or Auto (try screen first)
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, page }),
      });

      const data = await response.json();

      // Auto mode: if fallback, route to AI
      if (mode === 'auto' && data.fallback) {
        setLoading(false);
        await handleAIQuery(query);
        setQuery('');
        return;
      }

      // Screen mode or matched pattern: show structured results
      setLastQueryType('screen');
      setAiMessages([]);
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

  const useExample = (exampleQuery: string, forceMode?: 'screen' | 'ai') => {
    setQuery(exampleQuery);
    if (forceMode === 'ai') {
      setMode('ai');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="text-center space-y-4 mb-8">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-full text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            Stock Screening + AI Filing Analysis
          </div>
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 pb-2 leading-tight">
            Ask the Market
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Screen stocks by dividends, growth, valuation &amp; risk — or ask AI about any company's SEC filings
          </p>
        </div>

        {/* Query Input */}
        <div className="max-w-4xl mx-auto">
          <Card className="border-2 shadow-lg">
            <CardContent className="p-6">
              {/* Mode Toggle */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-slate-500 font-medium">Mode:</span>
                <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                  {(['auto', 'screen', 'ai'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                        mode === m
                          ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {m === 'auto' ? 'Auto' : m === 'screen' ? 'Screen' : 'AI'}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-400 ml-2">
                  {mode === 'auto' && 'Tries instant screening first, falls back to AI'}
                  {mode === 'screen' && 'Database screening only (instant, no auth)'}
                  {mode === 'ai' && 'AI filing analysis (requires free account)'}
                </span>
              </div>

              {/* Ticker/Sector Filters (collapsible) */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-3 transition-colors"
              >
                {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {ticker || sector ? (
                  <span className="text-blue-600 font-medium">
                    Filters: {ticker && `Ticker: ${ticker}`}{ticker && sector && ' | '}{sector && `Sector: ${sector}`}
                  </span>
                ) : (
                  'Add ticker or sector filter (for AI queries)'
                )}
              </button>
              {showFilters && (
                <div className="flex flex-wrap items-end gap-4 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Company ticker:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={ticker}
                        onChange={(e) => {
                          setTicker(e.target.value.toUpperCase());
                          if (e.target.value) setSector('');
                        }}
                        placeholder="e.g., AAPL, MSFT"
                        className="w-40 px-3 py-1.5 border border-slate-200 rounded-md text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                      />
                      {ticker && (
                        <button onClick={() => setTicker('')} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Or sector:</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={sector}
                        onChange={(e) => {
                          setSector(e.target.value);
                          if (e.target.value) setTicker('');
                        }}
                        className="w-48 px-3 py-1.5 border border-slate-200 rounded-md text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">All sectors</option>
                        {sectorOptions}
                      </select>
                      {sector && (
                        <button onClick={() => setSector('')} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Search Bar */}
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder={mode === 'ai'
                      ? "Ask about any company's filings, risk factors, revenue trends..."
                      : mode === 'screen'
                      ? "Screen stocks (e.g., 'dividend yield > 3%', 'PE < 15 and beta < 1')"
                      : "Ask anything — screens stocks instantly, falls back to AI for deeper questions"
                    }
                    className="w-full h-14 pl-12 pr-4 text-lg text-slate-900 placeholder:text-slate-500 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !isStreaming && handleQuery()}
                  />
                </div>
                <Button
                  size="lg"
                  className="h-14 px-8 text-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  onClick={() => handleQuery()}
                  disabled={!query.trim() || loading || isStreaming}
                >
                  {loading || isStreaming ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      {isStreaming ? 'Thinking...' : 'Searching...'}
                    </>
                  ) : (
                    mode === 'ai' ? 'Ask AI' : 'Search'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Example Queries — only show when no results and no AI messages */}
          {!results && aiMessages.length === 0 && (
            <div className="mt-8">
              <p className="text-sm text-slate-600 mb-4 font-medium">Try these examples:</p>

              {/* Stock Screening Examples */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <Search className="w-3 h-3 text-blue-600" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">Stock Screening</span>
                  <span className="text-xs text-slate-400">(instant, no account needed)</span>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {screenExamples.map((example, idx) => (
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

              {/* AI Analysis Examples */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                    <Brain className="w-3 h-3 text-purple-600" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">AI Filing Analysis</span>
                  <span className="text-xs text-slate-400">(requires free account)</span>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {aiExamples.map((example, idx) => (
                    <button
                      key={idx}
                      onClick={() => useExample(example.text, 'ai')}
                      className="flex items-start gap-3 p-4 bg-white border-2 border-purple-200 hover:border-purple-400 rounded-lg text-left transition-all hover:shadow-md group"
                    >
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                        {example.icon}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-purple-500 font-medium mb-1">{example.category}</div>
                        <div className="text-sm text-slate-800">{example.text}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* AI Messages Section */}
      {aiMessages.length > 0 && (
        <section className="container mx-auto px-4 pb-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Brain className="w-5 h-5 text-purple-600" />
                    AI Analysis
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setAiMessages([]); setLastQueryType(null); }}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    Clear
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {aiMessages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-3xl px-4 py-3 rounded-lg ${
                          message.role === 'user'
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                            : 'bg-slate-50 border border-slate-200 text-slate-900'
                        }`}
                      >
                        {message.role === 'assistant' ? (
                          <div
                            className="prose prose-sm max-w-none text-slate-900"
                            dangerouslySetInnerHTML={{
                              __html: formatMarkdown(message.content),
                            }}
                          />
                        ) : (
                          <p className="text-sm">{message.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {isStreaming && aiMessages.length > 0 && aiMessages[aiMessages.length - 1].content === '' && (
                    <div className="flex justify-start">
                      <div className="px-4 py-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                          Analyzing...
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Follow-up prompt */}
                {!isStreaming && aiMessages.length > 0 && aiMessages[aiMessages.length - 1].role === 'assistant' && (
                  <div className="mt-4 pt-3 border-t border-slate-200">
                    <p className="text-xs text-slate-500">Ask a follow-up question above, or try a new query.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Structured Results Section */}
      {results && lastQueryType === 'screen' && (
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
                  <CardDescription>Company Financials</CardDescription>
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
                              {company.dividendYield != null && (
                                <span className="text-slate-600">
                                  Dividend Yield: <strong>{(company.dividendYield * 100).toFixed(2)}%</strong>
                                </span>
                              )}
                              {company.beta != null && (
                                <span className="text-slate-600">
                                  Beta: <strong>{company.beta.toFixed(2)}</strong>
                                </span>
                              )}
                              {(company.revenueGrowth != null || company.latestRevenueYoY != null) && (
                                <span className="text-slate-600">
                                  Revenue Growth: <strong>{(company.revenueGrowth ?? company.latestRevenueYoY).toFixed(1)}%</strong>
                                </span>
                              )}
                              {company.latestNetIncome != null && (
                                <span className="text-slate-600">
                                  Net Income: <strong>${(company.latestNetIncome / 1e9).toFixed(2)}B</strong>
                                </span>
                              )}
                              {company.latestOperatingMargin != null && (
                                <span className="text-slate-600">
                                  Operating Margin: <strong>{company.latestOperatingMargin.toFixed(1)}%</strong>
                                </span>
                              )}
                              {company.fiftyTwoWeekHigh != null && (
                                <span className="text-slate-600">
                                  52W High: <strong>${company.fiftyTwoWeekHigh.toFixed(2)}</strong>
                                </span>
                              )}
                              {company.upside != null && (
                                <span className="text-green-600">
                                  Upside: <strong>{company.upside}%</strong>
                                </span>
                              )}
                              {company.analystTargetPrice != null && (
                                <span className="text-slate-600">
                                  Target: <strong>${company.analystTargetPrice.toFixed(2)}</strong>
                                </span>
                              )}
                              {company.previousTarget != null && company.latestTarget != null && company.changePercent != null && (
                                <span className={company.change > 0 ? 'text-green-600' : 'text-red-600'}>
                                  Target: <strong>${company.previousTarget.toFixed(2)}</strong> → <strong>${company.latestTarget.toFixed(2)}</strong>
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
            ) : results.fallback ? (
              <Card className="border-slate-200 bg-slate-50">
                <CardHeader>
                  <CardTitle>No Screening Match</CardTitle>
                  <CardDescription>Try switching to AI mode for open-ended questions, or refine your screening query.</CardDescription>
                </CardHeader>
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
          <h2 className="text-2xl font-bold text-center mb-8 text-blue-900">What You Can Query</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Price & Valuation</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-slate-700 space-y-1">
                  <li>Sector & Industry</li>
                  <li>Current price</li>
                  <li>Market cap</li>
                  <li>P/E ratio & Forward P/E</li>
                  <li>52-week high/low</li>
                  <li>Analyst target price</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Fundamentals</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-slate-700 space-y-1">
                  <li>Revenue & YoY growth</li>
                  <li>Net income & YoY growth</li>
                  <li>EPS & YoY growth</li>
                  <li>Gross margin</li>
                  <li>Operating margin</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Dividends & Risk</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-slate-700 space-y-1">
                  <li>Dividend yield</li>
                  <li>Beta (volatility)</li>
                  <li>Volume & avg volume</li>
                  <li>Analyst ratings</li>
                  <li>Analyst coverage</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">SEC Filings</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-slate-700 space-y-1">
                  <li>10-K, 10-Q, 8-K filings</li>
                  <li>Filing dates & ranges</li>
                  <li>Company-specific search</li>
                  <li>Date-based filtering</li>
                  <li>640+ companies tracked</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-pink-50 to-purple-100 border-purple-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1">
                  <Brain className="w-3 h-3" />
                  AI Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-slate-700 space-y-1">
                  <li>Risk factor analysis</li>
                  <li>Filing Q&A in plain English</li>
                  <li>Sector comparisons</li>
                  <li>ML prediction accuracy</li>
                  <li>Concern level trends</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
            <p className="text-sm text-center text-slate-700">
              <strong>Smart Routing:</strong> In Auto mode, screening queries run instantly against the database. Open-ended questions automatically route to AI for deeper analysis.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function QueryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    }>
      <QueryPageContent />
    </Suspense>
  );
}
