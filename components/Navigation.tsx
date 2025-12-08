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
          >
            Latest Filings
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/watchlist')}
          >
            Watchlist
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/alerts')}
          >
            Alerts
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/query')}
          >
            Companies
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/chat')}
          >
            AI Chat
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/faq')}
          >
            FAQ
          </Button>
        </div>
        <UserMenu />
      </div>
    </nav>
  );
}
