'use client';

import { useState, useEffect } from 'react';
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
import { ArrowUpIcon, ArrowDownIcon, Clock, TrendingUp } from 'lucide-react';

interface LatestFiling {
  id: string;
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: string;
  predicted7dReturn: number | null;
  predictionConfidence: number | null;
  actual7dReturn: number | null;
  daysUntilActual: number;
  riskScore: number | null;
  sentimentScore: number | null;
  marketCap?: number;
}

export default function LatestFilingsPage() {
  const [filings, setFilings] = useState<LatestFiling[]>([]);
  const [filteredFilings, setFilteredFilings] = useState<LatestFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTicker, setSearchTicker] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'prediction' | 'confidence'>('date');

  useEffect(() => {
    fetchLatestFilings();
  }, []);

  useEffect(() => {
    filterAndSortFilings();
  }, [filings, searchTicker, filterType, sortBy]);

  const fetchLatestFilings = async () => {
    try {
      const response = await fetch('/api/filings/latest');
      const data = await response.json();
      setFilings(data);
    } catch (error) {
      console.error('Error fetching latest filings:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortFilings = () => {
    let filtered = [...filings];

    // Filter by ticker search
    if (searchTicker) {
      filtered = filtered.filter(f =>
        f.ticker.toLowerCase().includes(searchTicker.toLowerCase())
      );
    }

    // Filter by filing type
    if (filterType !== 'all') {
      filtered = filtered.filter(f => f.filingType === filterType);
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime();
      } else if (sortBy === 'prediction') {
        return Math.abs(b.predicted7dReturn || 0) - Math.abs(a.predicted7dReturn || 0);
      } else if (sortBy === 'confidence') {
        return (b.predictionConfidence || 0) - (a.predictionConfidence || 0);
      }
      return 0;
    });

    setFilteredFilings(filtered);
  };

  const getPredictionBadge = (predicted: number | null) => {
    if (predicted === null) return null;

    const abs = Math.abs(predicted);
    if (abs > 5) {
      return <Badge variant="default" className="font-bold">STRONG</Badge>;
    } else if (abs > 2) {
      return <Badge variant="secondary">MODERATE</Badge>;
    } else {
      return <Badge variant="outline">WEAK</Badge>;
    }
  };

  const getConfidenceBadge = (confidence: number | null) => {
    if (confidence === null) return null;

    const pct = confidence * 100;
    if (pct > 70) {
      return <Badge className="bg-green-500">High ({pct.toFixed(0)}%)</Badge>;
    } else if (pct > 50) {
      return <Badge className="bg-yellow-500">Medium ({pct.toFixed(0)}%)</Badge>;
    } else {
      return <Badge className="bg-red-500">Low ({pct.toFixed(0)}%)</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          <TrendingUp className="h-10 w-10 text-primary" />
          Latest Filings & Live Predictions
        </h1>
        <p className="text-muted-foreground text-lg">
          See our AI predictions before 7-day actual returns are available. Track which predictions are pending verification.
        </p>
      </div>

      {/* Filters */}
      <Card className="p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Search Ticker</label>
            <Input
              placeholder="e.g. AAPL, MSFT..."
              value={searchTicker}
              onChange={(e) => setSearchTicker(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Filing Type</label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="10-K">10-K (Annual)</SelectItem>
                <SelectItem value="10-Q">10-Q (Quarterly)</SelectItem>
                <SelectItem value="8-K">8-K (Current)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Sort By</label>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Filing Date (Newest)</SelectItem>
                <SelectItem value="prediction">Prediction Strength</SelectItem>
                <SelectItem value="confidence">Confidence</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Filings</div>
          <div className="text-3xl font-bold">{filteredFilings.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Pending Verification</div>
          <div className="text-3xl font-bold text-yellow-500">
            {filteredFilings.filter(f => f.actual7dReturn === null).length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Avg Prediction</div>
          <div className="text-3xl font-bold text-green-500">
            +{(filteredFilings.reduce((sum, f) => sum + (f.predicted7dReturn || 0), 0) / filteredFilings.length || 0).toFixed(1)}%
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Strong Signals</div>
          <div className="text-3xl font-bold text-blue-500">
            {filteredFilings.filter(f => Math.abs(f.predicted7dReturn || 0) > 5).length}
          </div>
        </Card>
      </div>

      {/* Filings List */}
      <div className="space-y-4">
        {filteredFilings.map((filing) => (
          <Card key={filing.id} className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              {/* Left: Company & Filing Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-2xl font-bold">{filing.ticker}</h3>
                  <Badge variant="outline">{filing.filingType}</Badge>
                  {filing.actual7dReturn === null && (
                    <Badge className="bg-yellow-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {filing.daysUntilActual} days until actual
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground mb-2">{filing.companyName}</p>
                <p className="text-sm text-muted-foreground">
                  Filed: {new Date(filing.filingDate).toLocaleDateString()}
                </p>
              </div>

              {/* Center: Prediction */}
              <div className="flex-1 flex flex-col items-center justify-center border-l border-r px-6">
                <div className="text-sm text-muted-foreground mb-1">7-Day Prediction</div>
                <div className={`text-5xl font-bold flex items-center gap-2 ${
                  (filing.predicted7dReturn || 0) > 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  {(filing.predicted7dReturn || 0) > 0 ? (
                    <ArrowUpIcon className="h-8 w-8" />
                  ) : (
                    <ArrowDownIcon className="h-8 w-8" />
                  )}
                  {filing.predicted7dReturn?.toFixed(2)}%
                </div>
                <div className="flex gap-2 mt-2">
                  {getPredictionBadge(filing.predicted7dReturn)}
                  {getConfidenceBadge(filing.predictionConfidence)}
                </div>
              </div>

              {/* Right: Actual (if available) */}
              <div className="flex-1 flex flex-col items-center justify-center">
                {filing.actual7dReturn !== null ? (
                  <>
                    <div className="text-sm text-muted-foreground mb-1">Actual Return</div>
                    <div className={`text-4xl font-bold ${
                      filing.actual7dReturn > 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {filing.actual7dReturn.toFixed(2)}%
                    </div>
                    <div className="text-sm mt-2">
                      {Math.sign(filing.predicted7dReturn || 0) === Math.sign(filing.actual7dReturn) ? (
                        <Badge className="bg-green-500">✓ Correct Direction</Badge>
                      ) : (
                        <Badge className="bg-red-500">✗ Wrong Direction</Badge>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <Clock className="h-12 w-12 text-yellow-500 mx-auto mb-2" />
                    <div className="text-sm text-muted-foreground">
                      Awaiting 7-day actual
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Check back in {filing.daysUntilActual} days
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom: Feature Indicators */}
            <div className="flex gap-4 mt-4 pt-4 border-t">
              {filing.sentimentScore !== null && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Sentiment:</span>{' '}
                  <span className={filing.sentimentScore > 0 ? 'text-green-500' : 'text-red-500'}>
                    {filing.sentimentScore > 0 ? 'Positive' : 'Negative'} ({(filing.sentimentScore * 10).toFixed(1)}/10)
                  </span>
                </div>
              )}
              {filing.riskScore !== null && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Risk:</span>{' '}
                  <span className={filing.riskScore < 5 ? 'text-green-500' : 'text-red-500'}>
                    {filing.riskScore.toFixed(1)}/10
                  </span>
                </div>
              )}
              {filing.marketCap && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Market Cap:</span>{' '}
                  <span>${filing.marketCap}B</span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {filteredFilings.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No filings match your filters. Try adjusting your search.</p>
        </Card>
      )}
    </div>
  );
}
