'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Navigation } from '@/components/Navigation';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function ChatPageContent() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ticker, setTicker] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-fill ticker from URL parameter
  useEffect(() => {
    const tickerParam = searchParams.get('ticker');
    if (tickerParam) {
      setTicker(tickerParam.toUpperCase());
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
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get response');
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
          content: `Error: ${error.message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                💬 Analyze a Company's Filings
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Deep dive into a specific company's SEC filings and financial disclosures
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select a company to analyze:
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="Enter ticker (e.g., AAPL, MSFT, TSLA)"
              className="w-80 px-4 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {ticker && (
              <button
                onClick={() => setTicker('')}
                className="ml-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear
              </button>
            )}
            {!ticker && (
              <p className="text-xs text-gray-500 mt-1">
                Enter a ticker to start asking questions about that company
              </p>
            )}
          </div>
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
                      className="prose prose-sm max-w-none"
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
              placeholder="Ask a question about SEC filings..."
              disabled={isLoading}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
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
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded">$1</code>')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>');
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <ChatPageContent />
    </Suspense>
  );
}
