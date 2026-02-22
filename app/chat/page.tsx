/**
 * @module app/chat/page
 * @description Next.js client component providing an AI-powered chat interface for analyzing company SEC filings, financial metrics, and sector-level data with streaming responses
 *
 * PURPOSE:
 * - Render interactive chat UI allowing users to query company financials, SEC filings, and risk factors via natural language
 * - Accept ticker symbols from URL parameters (?ticker=AAPL) to pre-populate company selection
 * - Stream AI responses incrementally from /api/chat endpoint using ReadableStream decoder
 * - Handle authentication errors by displaying friendly signup prompts with links to /profile
 * - Provide sector-level analysis by allowing users to select from 11 predefined industry sectors
 * - Auto-scroll to newest messages and maintain conversation history in component state
 *
 * DEPENDENCIES:
 * - react - Provides useState for messages/input/loading state, useRef for scroll target, useEffect for URL param reading and auto-scroll
 * - next/link - Renders navigation links to /profile in authentication error messages
 * - next/navigation - useSearchParams reads ?ticker= URL parameter to auto-fill company selection
 *
 * EXPORTS:
 * - ChatPage (component) - Default export wrapping ChatPageContent in Suspense boundary for Next.js app router compatibility
 *
 * PATTERNS:
 * - Navigate to /chat?ticker=AAPL to pre-fill ticker input and start company-specific conversation
 * - Enter ticker in input OR select sector from dropdown - setting one clears the other automatically
 * - Submit question via form - streams response chunks by reading response.body with TextDecoder
 * - Click example query buttons to auto-populate input field with pre-written questions
 * - Authentication errors return JSON with requiresAuth:true or 401 status, displaying markdown signup prompt
 *
 * CLAUDE NOTES:
 * - Uses optimistic UI updates - user message appears immediately before API call completes
 * - Streaming response updates last message in array progressively as chunks arrive, creating typewriter effect
 * - VALID_SECTORS hardcoded array must match backend sector validation to prevent errors
 * - Ticker and sector are mutually exclusive - onChange handlers clear opposite field when either is set
 * - messagesEndRef.current scrollIntoView triggers after every messages state update via useEffect dependency
 * - Empty messages state shows comprehensive data availability guide with 4 categories (Financial, Stock, Risk, Company)
 * - Error handling distinguishes between auth errors (friendly signup prompt) and other failures (generic error message)
 */
'use client';

import { useState, useRef, useEffect, Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

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

function ChatPageContent() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ticker, setTicker] = useState('');
  const [sector, setSector] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-fill ticker from URL parameter
  useEffect(() => {
    const tickerParam = searchParams.get('ticker');
    if (tickerParam) {
      setTicker(tickerParam.toUpperCase());
      setSector('');
    }
  }, [searchParams]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          ticker: ticker || undefined,
          sector: sector || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Handle authentication errors with a friendly message
        if (errorData.requiresAuth || response.status === 401) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `🔒 **${errorData.error || 'Authentication Required'}**\n\n${errorData.message || 'Please sign up or log in to use AI chat.'}\n\n[Sign up for free](/profile) to get started!`,
            },
          ]);
          setIsLoading(false);
          return;
        }

        throw new Error(errorData.message || errorData.error || 'Failed to get response');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      let assistantMessage = '';
      const assistantMessageObj: Message = { role: 'assistant', content: '' };
      setMessages((prev) => [...prev, assistantMessageObj]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          assistantMessage += chunk;

          setMessages((prev) => {
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
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ **Error**: ${error.message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const sectorExampleQueries = [
    'Which companies have the highest concern levels?',
    'Compare revenue growth across this sector',
    'What are the top-performing stocks in this sector?',
    'Which companies have the best operating margins?',
  ];

  const exampleQueries = [
    'What business segments does this company report?',
    'What percentage of revenue comes from international markets?',
    'What are the main risk factors mentioned in recent filings?',
    'How has revenue growth trended over recent quarters?',
    'What geographic regions are mentioned for revenue breakdown?',
    'What recent changes to management or executives were disclosed?',
    'What major acquisitions or divestitures are discussed?',
    'How does the company describe their competitive advantages?',
  ];

  // Memoize sector options to avoid re-rendering select options in a loop
  const sectorOptions = useMemo(() => {
    return VALID_SECTORS.map((s) => (
      <option key={s} value={s}>{s}</option>
    ));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                💬 Ask the Market
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Ask questions about any company's SEC filings, financials, and risk — or explore an entire sector
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select a company to analyze:
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => {
                  setTicker(e.target.value.toUpperCase());
                  if (e.target.value) setSector('');
                }}
                placeholder="Enter ticker (e.g., AAPL, MSFT, TSLA)"
                className="w-80 px-4 py-2 border-2 border-gray-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {ticker && (
                <button
                  onClick={() => setTicker('')}
                  className="ml-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Clear
                </button>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Or explore a sector:
              </label>
              <select
                value={sector}
                onChange={(e) => {
                  setSector(e.target.value);
                  if (e.target.value) setTicker('');
                }}
                className="w-64 px-4 py-2 border-2 border-gray-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All sectors</option>
                {sectorOptions}
              </select>
              {sector && (
                <button
                  onClick={() => setSector('')}
                  className="ml-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          {!ticker && !sector && (
            <p className="text-xs text-gray-500 mt-2">
              Enter a ticker or select a sector to start asking questions
            </p>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="space-y-6">
            {/* Data Available Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                📊 Available Data
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Financial Metrics</h3>
                  <ul className="space-y-1 text-gray-600">
                    <li>• Revenue + YoY growth</li>
                    <li>• Net income + YoY growth</li>
                    <li>• EPS + YoY growth</li>
                    <li>• Gross & operating margins</li>
                    <li>• Earnings surprises (beat/miss)</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Stock Performance</h3>
                  <ul className="space-y-1 text-gray-600">
                    <li>• 7-day & 30-day returns</li>
                    <li>• Market-relative alpha (vs S&P 500)</li>
                    <li>• ML predictions vs actual</li>
                    <li>• Current price</li>
                    <li>• 52-week high/low distance</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Risk Analysis</h3>
                  <ul className="space-y-1 text-gray-600">
                    <li>• Concern level (0-10 scale)</li>
                    <li>• Concern label (LOW to CRITICAL)</li>
                    <li>• Risk factors & changes</li>
                    <li>• Management sentiment</li>
                    <li>• Concern vs positive factors</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Company Info</h3>
                  <ul className="space-y-1 text-gray-600">
                    <li>• Ticker & company name</li>
                    <li>• Market cap (in billions)</li>
                    <li>• P/E ratio</li>
                    <li>• Filing type & quarter</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Question Categories */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                💬 Question Categories
              </h2>

              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-blue-600 mb-2 text-sm uppercase tracking-wide">
                    📈 Stock Performance
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setInput(ticker ? `Which ${ticker} filing had the biggest stock price jump in 7 days?` : 'Which filing had the biggest stock price jump in 7 days?')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-blue-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-blue-200"
                    >
                      {ticker ? `Which ${ticker} filing had the biggest stock price jump?` : 'Which filing had the biggest stock price jump in 7 days?'}
                    </button>
                    <button
                      onClick={() => setInput(ticker ? `Show me ${ticker} filings that outperformed the S&P 500` : 'Which filings outperformed the S&P 500 (positive alpha)?')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-blue-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-blue-200"
                    >
                      {ticker ? `${ticker} filings that outperformed the S&P 500?` : 'Which filings outperformed the S&P 500?'}
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-green-600 mb-2 text-sm uppercase tracking-wide">
                    💰 Financial Analysis
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setInput(ticker ? `What is ${ticker}'s revenue growth trend over the past year?` : 'Which company had the best revenue growth last quarter?')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-green-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-green-200"
                    >
                      {ticker ? `${ticker}'s revenue growth trend?` : 'Best revenue growth last quarter?'}
                    </button>
                    <button
                      onClick={() => setInput(ticker ? `How has ${ticker}'s net income changed year-over-year?` : 'Show me companies with revenue over $50B and positive YoY growth')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-green-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-green-200"
                    >
                      {ticker ? `${ticker}'s net income year-over-year changes?` : 'Large companies with positive growth?'}
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-purple-600 mb-2 text-sm uppercase tracking-wide">
                    🤖 ML Model Performance
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setInput(ticker ? `How accurate were the ML predictions for ${ticker} filings?` : 'Show me companies where the ML prediction was accurate')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-purple-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-purple-200"
                    >
                      {ticker ? `ML prediction accuracy for ${ticker}?` : 'Where was ML prediction accurate?'}
                    </button>
                    <button
                      onClick={() => setInput(ticker ? `Show me ${ticker} filings where predicted return differed from actual` : 'Show me filings with negative actual returns despite positive predictions')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-purple-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-purple-200"
                    >
                      {ticker ? `${ticker} predicted vs actual differences?` : 'Where did ML get it wrong?'}
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-red-600 mb-2 text-sm uppercase tracking-wide">
                    ⚠️ Risk & Concern Analysis
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setInput(ticker ? `What is the concern level for ${ticker}'s most recent filing?` : 'Compare predicted vs actual returns for companies with low concern levels')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-red-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-red-200"
                    >
                      {ticker ? `${ticker}'s concern level and risk factors?` : 'Returns for low concern level filings?'}
                    </button>
                    <button
                      onClick={() => setInput(ticker ? `How have ${ticker}'s concern levels trended over recent filings?` : 'Which filings had high concern levels but positive returns?')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-red-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-red-200"
                    >
                      {ticker ? `${ticker}'s concern level trends?` : 'High concern but positive performance?'}
                    </button>
                  </div>
                </div>

                {/* Sector Analysis */}
                {sector && (
                  <div>
                    <h3 className="font-semibold text-indigo-600 mb-2 text-sm uppercase tracking-wide">
                      🏢 Sector Analysis — {sector}
                    </h3>
                    <div className="space-y-2">
                      {sectorExampleQueries.map((q, idx) => (
                        <button
                          key={idx}
                          onClick={() => setInput(q)}
                          className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-indigo-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-indigo-200"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mb-32">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-3xl px-4 py-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-900'
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
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a company, compare sectors, or explore filings..."
              disabled={isLoading}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-slate-900 placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isLoading ? 'Thinking...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Simple markdown formatter (handles basic markdown)
function formatMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:text-blue-800 underline">$1</a>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="text-slate-900">$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-gray-100 text-slate-900 px-1 rounded">$1</code>')
    .replace(/\n\n/g, '</p><p class="text-slate-900 mt-2">')
    .replace(/\n/g, '<br/>');
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <ChatPageContent />
    </Suspense>
  );
}