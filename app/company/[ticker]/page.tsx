'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Filing {
  accessionNumber: string;
  form: string;
  filingDate: string;
  reportDate?: string;
  primaryDocDescription: string;
  filingUrl: string;
}

interface CompanyData {
  company: {
    cik: string;
    ticker: string;
    name: string;
  };
  filings: Filing[];
}

export default function CompanyPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = params.ticker as string;
  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(10);

  useEffect(() => {
    if (!ticker) return;

    const fetchCompany = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/sec/company/${ticker}`);

        if (!response.ok) {
          throw new Error('Failed to fetch company data');
        }

        const result = await response.json();
        setData(result);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [ticker]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl">📊</div>
          <h2 className="text-2xl font-bold">Loading {ticker} data...</h2>
          <p className="text-slate-600">Fetching SEC filings and analysis</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error || 'Failed to load company data'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/')} variant="outline">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button variant="outline" onClick={() => router.push('/')} className="mb-4">
            ← Back to Home
          </Button>
          <h1 className="text-4xl font-bold">{data.company.name}</h1>
          <p className="text-lg text-slate-600 mt-2">
            {data.company.ticker} | CIK: {data.company.cik}
          </p>
        </div>

        {/* Recent Filings */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Recent SEC Filings</h2>

          <div className="grid gap-4">
            {data.filings.slice(0, displayCount).map((filing) => (
              <Card
                key={filing.accessionNumber}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => {
                  // Normalize accession number (add dashes if missing)
                  const normalizedAccession = filing.accessionNumber.includes('-')
                    ? filing.accessionNumber
                    : `${filing.accessionNumber.slice(0, 10)}-${filing.accessionNumber.slice(10, 12)}-${filing.accessionNumber.slice(12)}`;

                  // Pass filing metadata as query params
                  const params = new URLSearchParams({
                    ticker: data!.company.ticker,
                    cik: data!.company.cik,
                    filingType: filing.form,
                    filingDate: filing.filingDate,
                    filingUrl: filing.filingUrl,
                    companyName: data!.company.name,
                  });
                  router.push(`/filing/${normalizedAccession}?${params.toString()}`);
                }}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <span className="text-2xl">
                          {filing.form === '10-K'
                            ? '📕'
                            : filing.form === '10-Q'
                            ? '📗'
                            : '📄'}
                        </span>
                        {filing.form} - {filing.primaryDocDescription}
                      </CardTitle>
                      <CardDescription>
                        Filed: {new Date(filing.filingDate).toLocaleDateString()}
                        {filing.reportDate &&
                          ` | Report Date: ${new Date(filing.reportDate).toLocaleDateString()}`}
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm">
                      Analyze →
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm text-slate-600">
                    <span>Accession: {filing.accessionNumber}</span>
                    <a
                      href={filing.filingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View on SEC.gov →
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Load More Button */}
          {displayCount < data.filings.length && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setDisplayCount(prev => prev + 10)}
                className="w-full md:w-auto"
              >
                Load More Filings ({data.filings.length - displayCount} remaining)
              </Button>
            </div>
          )}

          {displayCount >= data.filings.length && data.filings.length > 10 && (
            <p className="text-center text-sm text-slate-600 mt-4">
              Showing all {data.filings.length} filings
            </p>
          )}
        </div>

        {/* Info Section */}
        <Card className="mt-8 bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle>💡 How to Use</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li>• Click on any filing to view AI-powered analysis</li>
              <li>• Get risk assessments and sentiment analysis</li>
              <li>• See 7-day stock price movement predictions</li>
              <li>• Chat with the filing to ask specific questions</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
