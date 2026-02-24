/**
 * @module app/company/[ticker]/filings/page
 * @description Next.js page component rendering company SEC filings with error handling, pagination, and navigation to individual filing analysis
 *
 * PURPOSE:
 * - Fetch company data and SEC filings from /api/sec/company/{ticker} endpoint with error handling and suggestions
 * - Display paginated list of filings with form type icons (10-K, 10-Q) and filing metadata
 * - Navigate to individual filing analysis page when clicking a filing card with normalized accession numbers
 * - Handle untracked companies by showing similar company suggestions and navigation options
 *
 * DEPENDENCIES:
 * - next/navigation - Provides useParams for ticker URL parameter, useRouter for programmatic navigation to filing details and home
 * - @/components/ui/card - Card components for filing list items, error states, and info section layout
 * - @/components/ui/button - Action buttons for navigation, load more pagination, and similar company suggestions
 *
 * EXPORTS:
 * - CompanyPage (component) - Default export rendering company filings page at /company/[ticker]/filings route
 *
 * PATTERNS:
 * - Route mounted at /company/[ticker]/filings - ticker extracted via useParams().ticker
 * - Click filing card to navigate to /filing/{normalizedAccession}?ticker=X&cik=Y&filingType=Z with query params
 * - API fetches on mount via useEffect when ticker changes, handles loading/error/success states
 * - Pagination via displayCount state - initially 10 filings, increment by 10 on 'Load More' click
 * - Accession number normalization adds dashes: XXXXXXXXXX-XX-XXXXXX format before routing
 *
 * CLAUDE NOTES:
 * - Error response includes suggestions array with similar companies - rendered as clickable navigation buttons
 * - Filing cards show different emojis based on form type: 📕 for 10-K, 📗 for 10-Q, 📄 for others
 * - Query params passed to filing detail page preserve context: ticker, cik, filingType, filingDate, filingUrl, companyName
 * - Prevents event bubbling on SEC.gov external link click using e.stopPropagation() to avoid triggering card navigation
 * - Uses tracked boolean from API response to determine if company is monitored, shows dedicated error UI if false
 */
'use client';

import { useEffect, useState, useMemo } from 'react';
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
  tracked?: boolean;
}

interface ErrorResponse {
  error: string;
  tracked: false;
  suggestions?: Array<{ ticker: string; name: string }>;
  message?: string;
}

export default function CompanyPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = params.ticker as string;
  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<ErrorResponse | null>(null);
  const [displayCount, setDisplayCount] = useState(10);

  useEffect(() => {
    if (!ticker) return;

    const fetchCompany = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/sec/company/${ticker}`);

        if (!response.ok) {
          const errorData = await response.json();
          setErrorDetails(errorData);
          throw new Error(errorData.error || 'Failed to fetch company data');
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

  // Pre-compute displayed filings to avoid recalculation in the map loop
  const displayedFilings = useMemo(() => {
    if (!data) return [];
    return data.filings.slice(0, displayCount).map((filing) => {
      // Normalize accession number (add dashes if missing)
      const normalizedAccession = filing.accessionNumber.includes('-')
        ? filing.accessionNumber
        : `${filing.accessionNumber.slice(0, 10)}-${filing.accessionNumber.slice(10, 12)}-${filing.accessionNumber.slice(12)}`;

      // Pre-compute query params
      const params = new URLSearchParams({
        ticker: data.company.ticker,
        cik: data.company.cik,
        filingType: filing.form,
        filingDate: filing.filingDate,
        filingUrl: filing.filingUrl,
        companyName: data.company.name,
      });

      return {
        filing,
        normalizedAccession,
        queryString: params.toString(),
      };
    });
  }, [data, displayCount]);

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-3xl">🔍</span>
              {ticker ? ticker.toUpperCase() : 'Company'} Not Tracked
            </CardTitle>
            <CardDescription className="text-base">
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {errorDetails?.message && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">{errorDetails.message}</p>
              </div>
            )}

            {errorDetails?.suggestions && errorDetails.suggestions.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Similar companies we track:</h3>
                <div className="space-y-2">
                  {errorDetails.suggestions.map((company) => (
                    <Button
                      key={company.ticker}
                      variant="outline"
                      className="w-full justify-start text-left h-auto py-3"
                      onClick={() => router.push(`/company/${company.ticker}`)}
                    >
                      <div>
                        <div className="font-semibold">{company.ticker}</div>
                        <div className="text-sm text-slate-600">{company.name}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={() => router.push('/')} variant="outline" className="flex-1">
                ← Back to Home
              </Button>
              <Button onClick={() => router.push('/query')} variant="default" className="flex-1">
                Browse All Companies →
              </Button>
            </div>
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
            {displayedFilings.map(({ filing, normalizedAccession, queryString }) => (
              <Card
                key={filing.accessionNumber}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => {
                  router.push(`/filing/${normalizedAccession}?${queryString}`);
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