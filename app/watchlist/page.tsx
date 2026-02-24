/**
 * @module app/watchlist/page
 * @description Next.js client page component managing user watchlists for tracking individual stock tickers and entire market sectors with real-time company data display
 *
 * PURPOSE:
 * - Fetch and display user's watchlist of stock tickers and sector subscriptions from /api/watchlist endpoint
 * - Add new tickers via POST requests with uppercase normalization and remove items via DELETE requests with ticker/sector query parameters
 * - Display live company metrics including current price, market cap (formatted as T/B/M suffixes), and P/E ratios from enriched company data
 * - Redirect to home page on 401 unauthorized responses and navigate to company detail pages on ticker click
 *
 * DEPENDENCIES:
 * - next/navigation - Provides useRouter for programmatic navigation to home and company detail pages
 * - @/components/ui/button - Renders action buttons for add/remove operations and navigation
 * - @/components/ui/input - Text input field for ticker symbol entry with uppercase transformation
 * - @/components/ui/card - Container components organizing watchlist sections and add forms
 * - @/components/ui/badge - Displays sector tags on individual stock watchlist items
 * - @/lib/format-utils - Provides safeFormatPrice utility for consistent currency formatting
 *
 * EXPORTS:
 * - WatchlistPage (component) - Default exported page component rendering ticker and sector watchlist management interface
 *
 * PATTERNS:
 * - Mount component to automatically fetch watchlist data and valid sectors list via useEffect on page load
 * - Submit ticker form to POST /api/watchlist with uppercase ticker, then refetch entire watchlist on success
 * - Submit sector form to POST /api/watchlist/sector with selected sector from dropdown of valid sectors
 * - Click ticker text to navigate to /company/[ticker] detail page, click Remove to DELETE via query parameter
 *
 * CLAUDE NOTES:
 * - Market cap formatting uses exponential notation checks (1e12 for trillion) and returns suffixed strings like '$1.25T' or '$450.32M'
 * - P/E ratio display includes isFinite check to handle division by zero or undefined earnings scenarios
 * - Single fetchWatchlist call returns both ticker watchlist and sectorWatchlist arrays in one response payload
 * - Adding state prevents double-submission of forms and disables inputs during API calls, with error state cleared on new submission
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { safeFormatPrice } from '@/lib/format-utils';

interface Company {
  ticker: string;
  name: string;
  sector?: string;
  currentPrice?: number;
  marketCap?: number;
  peRatio?: number;
  analystTargetPrice?: number;
}

interface WatchlistItem {
  id: string;
  ticker: string;
  createdAt: string;
  company?: Company;
}

interface SectorWatch {
  id: string;
  sector: string;
  createdAt: string;
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [sectorWatchlist, setSectorWatchlist] = useState<SectorWatch[]>([]);
  const [validSectors, setValidSectors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTicker, setNewTicker] = useState('');
  const [newSector, setNewSector] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetchWatchlist();
    fetchValidSectors();
  }, []);

  const fetchValidSectors = async () => {
    try {
      const response = await fetch('/api/watchlist/sector');
      const data = await response.json();
      setValidSectors(data.sectors || []);
    } catch (error) {
      console.error('Error fetching valid sectors:', error);
    }
  };

  const fetchWatchlist = async () => {
    try {
      const response = await fetch('/api/watchlist');

      if (response.status === 401) {
        router.push('/');
        return;
      }

      const data = await response.json();
      setWatchlist(data.watchlist || []);
      setSectorWatchlist(data.sectorWatchlist || []);
    } catch (error) {
      console.error('Error fetching watchlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker) return;

    setAdding(true);
    setError('');

    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: newTicker }),
      });

      const data = await response.json();

      if (response.ok) {
        setNewTicker('');
        await fetchWatchlist();
      } else {
        setError(data.error || 'Failed to add ticker');
      }
    } catch (err) {
      setError('Something went wrong');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveTicker = async (ticker: string) => {
    try {
      await fetch(`/api/watchlist?ticker=${ticker}`, {
        method: 'DELETE',
      });
      await fetchWatchlist();
    } catch (error) {
      console.error('Error removing ticker:', error);
    }
  };

  const handleAddSector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSector) return;

    setAdding(true);
    setError('');

    try {
      const response = await fetch('/api/watchlist/sector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector: newSector }),
      });

      const data = await response.json();

      if (response.ok) {
        setNewSector('');
        await fetchWatchlist();
      } else {
        setError(data.error || 'Failed to add sector');
      }
    } catch (err) {
      setError('Something went wrong');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveSector = async (sector: string) => {
    try {
      await fetch(`/api/watchlist/sector?sector=${encodeURIComponent(sector)}`, {
        method: 'DELETE',
      });
      await fetchWatchlist();
    } catch (error) {
      console.error('Error removing sector:', error);
    }
  };

  const formatMarketCap = (marketCap?: number) => {
    if (!marketCap) return 'N/A';
    if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(2)}T`;
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
    if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
    return `$${marketCap.toFixed(0)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="outline"
          onClick={() => router.push('/')}
          className="mb-6"
        >
          ← Back to Home
        </Button>

        <h1 className="text-4xl font-bold mb-2">My Watchlist</h1>
        <p className="text-slate-600 mb-8">
          Track your favorite stocks and sectors to receive alerts on new filings and predictions.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Add Ticker */}
          <Card>
            <CardHeader>
              <CardTitle>Add Ticker</CardTitle>
              <CardDescription>Track a company by ticker symbol</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddTicker} className="flex gap-2">
                <Input
                  placeholder="Enter ticker (e.g., AAPL)"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                  disabled={adding}
                  className="border-2 border-green-300 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                />
                <Button type="submit" disabled={adding || !newTicker}>
                  {adding ? 'Adding...' : 'Add'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Add Sector */}
          <Card>
            <CardHeader>
              <CardTitle>Add Sector</CardTitle>
              <CardDescription>Watch an entire sector</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddSector} className="flex gap-2">
                <Select
                  value={newSector}
                  onValueChange={setNewSector}
                  disabled={adding}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a sector..." />
                  </SelectTrigger>
                  <SelectContent>
                    {validSectors.map((sector) => (
                      <SelectItem key={sector} value={sector}>
                        {sector}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={adding || !newSector}>
                  {adding ? 'Adding...' : 'Add'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Watched Stocks */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Watched Stocks ({watchlist.length})</CardTitle>
            <CardDescription>
              Companies you're tracking for new filings and predictions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {watchlist.length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                No stocks in your watchlist yet. Add one above to get started.
              </p>
            ) : (
              <div className="space-y-4">
                {watchlist.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3
                          className="text-lg font-bold text-blue-600 cursor-pointer hover:underline"
                          onClick={() => router.push(`/company/${item.ticker}`)}
                        >
                          {item.ticker}
                        </h3>
                        {item.company?.sector && (
                          <Badge variant="outline">{item.company.sector}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mb-2">
                        {item.company?.name || 'Loading...'}
                      </p>
                      {item.company && (
                        <div className="flex gap-4 text-xs text-slate-500">
                          {item.company.currentPrice && (
                            <span>Price: {safeFormatPrice(item.company.currentPrice)}</span>
                          )}
                          {item.company.marketCap && (
                            <span>Market Cap: {formatMarketCap(item.company.marketCap)}</span>
                          )}
                          {item.company.peRatio && (
                            <span>P/E: {item.company.peRatio && isFinite(item.company.peRatio) ? item.company.peRatio.toFixed(2) : 'N/A'}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveTicker(item.ticker)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Watched Sectors */}
        <Card>
          <CardHeader>
            <CardTitle>Watched Sectors ({sectorWatchlist.length})</CardTitle>
            <CardDescription>
              Get alerts for all companies in these sectors
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sectorWatchlist.length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                No sectors in your watchlist yet. Add one above to track an entire sector.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                {sectorWatchlist.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <span className="font-medium">{item.sector}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveSector(item.sector)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
