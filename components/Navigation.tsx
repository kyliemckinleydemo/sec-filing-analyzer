'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/UserMenu';

export function Navigation() {
  const router = useRouter();

  return (
    <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h2
            className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 cursor-pointer"
            onClick={() => router.push('/')}
          >
            StockHuntr
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/latest-filings')}
            title="Browse the most recent SEC filings from all tracked companies"
          >
            Latest Filings
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/watchlist')}
            title="Track specific companies and get email alerts (requires signup)"
          >
            Watchlist
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/alerts')}
            title="Manage your alert preferences and notification settings (requires signup)"
          >
            Alerts
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/query')}
            title="Search and filter through all 640+ tracked companies"
          >
            Companies
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/chat')}
            title="Ask questions about company filings in plain English using AI"
          >
            AI Chat
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/faq')}
            title="Frequently asked questions and documentation"
          >
            FAQ
          </Button>
        </div>
        <UserMenu />
      </div>
    </nav>
  );
}
