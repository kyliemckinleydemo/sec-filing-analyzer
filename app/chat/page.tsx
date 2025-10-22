'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ticker, setTicker] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    'Which filing had the biggest stock price jump in 7 days?',
    'Show me companies where the ML prediction was accurate',
    'Which filings outperformed the S&P 500 (positive alpha)?',
    'Compare predicted vs actual returns for companies with low concern levels',
    'Which companies are near 52-week highs with strong revenue growth?',
    'Show me filings with negative actual returns despite positive predictions',
    'What was the average 7-day return for filings that beat earnings?',
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/" className="text-gray-600 hover:text-gray-900 text-sm">
                ← Back to Home
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">
                💬 Chat with Your Filing Data
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Ask questions about SEC filings, concern levels, and risk trends
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by ticker (optional):
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g., MSFT"
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {ticker && (
              <button
                onClick={() => setTicker('')}
                className="ml-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
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
                    <li>• Market-relative alpha</li>
                    <li>• ML predictions vs actual</li>
                    <li>• 52-week high/low</li>
                    <li>• Current price & market cap</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Risk Analysis</h3>
                  <ul className="space-y-1 text-gray-600">
                    <li>• Concern level (0-10 scale)</li>
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
                      onClick={() => setInput('Which filing had the biggest stock price jump in 7 days?')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-blue-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-blue-200"
                    >
                      Which filing had the biggest stock price jump in 7 days?
                    </button>
                    <button
                      onClick={() => setInput('Which filings outperformed the S&P 500 (positive alpha)?')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-blue-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-blue-200"
                    >
                      Which filings outperformed the S&P 500?
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-green-600 mb-2 text-sm uppercase tracking-wide">
                    💰 Financial Analysis
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setInput('Which company with market cap between $100B and $500B had the best revenue growth in Q2 2025?')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-green-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-green-200"
                    >
                      Best revenue growth for $100B-$500B market cap in Q2 2025?
                    </button>
                    <button
                      onClick={() => setInput('What was the average 7-day return for filings that beat earnings?')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-green-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-green-200"
                    >
                      Average 7-day return for earnings beats?
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-purple-600 mb-2 text-sm uppercase tracking-wide">
                    🤖 ML Model Performance
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setInput('Show me companies where the ML prediction was accurate')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-purple-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-purple-200"
                    >
                      Where was ML prediction accurate?
                    </button>
                    <button
                      onClick={() => setInput('Show me filings with negative actual returns despite positive predictions')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-purple-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-purple-200"
                    >
                      Where did ML get it wrong?
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-red-600 mb-2 text-sm uppercase tracking-wide">
                    ⚠️ Risk & Concern Analysis
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setInput('Compare predicted vs actual returns for companies with low concern levels')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-red-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-red-200"
                    >
                      Returns for low concern level filings?
                    </button>
                    <button
                      onClick={() => setInput('Which companies are near 52-week highs with strong revenue growth?')}
                      className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-red-50 rounded text-gray-700 text-sm transition-colors border border-transparent hover:border-red-200"
                    >
                      Near 52-week highs with strong growth?
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
