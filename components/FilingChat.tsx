/**
 * @module components/FilingChat
 * @description Interactive chat interface component for querying SEC filing data using AI-powered responses with authentication-gated access
 *
 * PURPOSE:
 * - Render floating chat widget toggleable between minimized button and full chat interface
 * - Stream AI responses from /api/chat endpoint with ticker context, displaying messages in real-time
 * - Handle authentication errors (401) and rate limits (429) with visual feedback and signup prompts
 * - Auto-scroll to latest messages and maintain conversation history in component state
 *
 * DEPENDENCIES:
 * - @/components/ui/card - Provides Card, CardContent, CardDescription, CardHeader, CardTitle for chat container structure
 * - @/components/ui/button - Provides Button component for submit, toggle, and signup actions
 * - lucide-react - Imports MessageCircle, Send, Loader2, AlertCircle, X icons for UI elements
 *
 * EXPORTS:
 * - FilingChat (component) - Returns floating chat widget requiring ticker, companyName, filingType, filingDate props
 *
 * PATTERNS:
 * - Pass <FilingChat ticker="AAPL" companyName="Apple Inc." filingType="10-K" filingDate="2024-01-15" /> to filing detail pages
 * - Component manages own open/closed state via isOpen - starts minimized as fixed bottom-right button
 * - POST to /api/chat with { message: string, ticker: string } - expects streaming response or JSON error with requiresAuth flag
 * - Use requiresAuth state to display signup prompt when 401 returned - triggers handleSignup() to open auth modal
 *
 * CLAUDE NOTES:
 * - Streams responses using ReadableStream reader - updates last assistant message incrementally as chunks arrive
 * - Handles three error states: requiresAuth (401), rate limit (429), and generic errors with distinct UI feedback
 * - Removes empty assistant placeholder message from state on streaming errors to prevent showing blank bubbles
 * - Signup fallback attempts to click existing signup button by text selector, otherwise redirects to /signup route
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageCircle, Send, Loader2, AlertCircle, X } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface FilingChatProps {
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: string;
}

export function FilingChat({ ticker, companyName, filingType, filingDate }: FilingChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);
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

    const userMessage = input.trim();
    setInput('');
    setError(null);
    setRequiresAuth(false);

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          ticker,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 401 || errorData.requiresAuth) {
          setRequiresAuth(true);
          setError(errorData.message || 'Sign up for free to access AI chat!');
        } else if (response.status === 429) {
          setError(errorData.message || 'Daily quota exceeded. Please try again tomorrow.');
        } else {
          setError(errorData.error || 'Failed to get response');
        }
        setIsLoading(false);
        return;
      }

      // Stream the response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      // Add placeholder for assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          assistantMessage += chunk;

          // Update the last message (assistant's response)
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              role: 'assistant',
              content: assistantMessage,
            };
            return newMessages;
          });
        }
      }

      setIsLoading(false);
    } catch (err: any) {
      console.error('Chat error:', err);
      setError(err.message || 'Failed to send message');
      setIsLoading(false);

      // Remove the empty assistant message on error
      setMessages(prev => prev.slice(0, -1));
    }
  };

  const handleSignup = () => {
    // Open the signup modal (assuming UserMenu component handles this)
    const signupButton = document.querySelector('button:has-text("Signup / Signin")');
    if (signupButton) {
      (signupButton as HTMLElement).click();
    } else {
      // Fallback: redirect to a signup page if implemented
      window.location.href = '/signup';
    }
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        size="lg"
        className="fixed bottom-6 right-6 shadow-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 flex items-center gap-2 px-4 py-3 h-auto rounded-full"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="font-medium">Chat with Filing</span>
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 w-96 h-[600px] shadow-2xl flex flex-col">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Ask about {ticker}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {filingType} filed {new Date(filingDate).toLocaleDateString()}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-8">
            <p className="text-sm mb-4">Ask questions about this filing:</p>
            <div className="space-y-2 text-xs text-left">
              <p className="text-slate-600">&bull; "What are the key risks?"</p>
              <p className="text-slate-600">&bull; "How did revenue change?"</p>
              <p className="text-slate-600">&bull; "What's the management outlook?"</p>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-900'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.content === '' && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-lg px-4 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800">{error}</p>
                {requiresAuth && (
                  <Button
                    size="sm"
                    onClick={handleSignup}
                    className="mt-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    Sign Up for Free
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </CardContent>

      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 px-4 py-2 border rounded-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            size="icon"
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
