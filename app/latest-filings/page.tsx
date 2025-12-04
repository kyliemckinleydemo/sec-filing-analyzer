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
import { useRouter } from 'next/navigation';
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

export default function LatestFilingsPage() {
  const [filings, setFilings] = useState<LatestFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [tickerFilter, setTickerFilter] = useState('');
  const [filingTypeFilter, setFilingTypeFilter] = useState('all');
  const router = useRouter();

  useEffect(() => {
    fetchFilings();
  }, [tickerFilter, filingTypeFilter]);

  const fetchFilings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tickerFilter) params.append('ticker', tickerFilter);
      if (filingTypeFilter) params.append('filingType', filingTypeFilter);

      const response = await fetch(`/api/filings/latest?${params.toString()}`);
      const data = await response.json();
      setFilings(data);
    } catch (error) {
      console.error('Error fetching filings:', error);
    } finally {
      setLoading(false);
    }
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
          className="mb-4"
        >
          ← Back to Home
        </Button>
        <h1 className="text-4xl font-bold mb-2">Latest SEC Filings</h1>
        <p className="text-slate-600 mb-6">
          Recent filings with financial data from 640+ tracked companies. Click "Analyze" to get AI-powered predictions.
        </p>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <Input
            placeholder="Filter by ticker (e.g., AAPL)"
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value.toUpperCase())}
            className="max-w-xs"
          />
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
          <Button variant="outline" onClick={fetchFilings}>
            Refresh
          </Button>
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
                        <h3 className="text-xl font-bold text-blue-600 underline decoration-dotted decoration-blue-400 cursor-help hover:decoration-solid transition-all">
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
          <div className="mt-6 text-center text-sm text-slate-500">
            Showing {filings.length} recent filings with financial data (last 90 days)
          </div>
        )}
      </div>
    </div>
  );
}
