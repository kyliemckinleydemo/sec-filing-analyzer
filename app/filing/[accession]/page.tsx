/**
 * @module page
 * @description SEC Filing Analysis Page - Individual filing detail view with AI-powered analysis
 * 
 * PURPOSE:
 * Displays comprehensive analysis of a single SEC filing, including risk assessment,
 * sentiment analysis, financial metrics extraction, ML-based price predictions, and
 * interactive AI chat. Integrates multiple data sources (SEC EDGAR, Yahoo Finance,
 * proprietary ML models) to provide actionable investment insights.
 * 
 * EXPORTS:
 * - default (FilingPage): Main page component for /filings/[accession] route
 * 
 * CLAUDE NOTES:
 * - Authentication gate: Free users see signup CTA, authenticated users get 100 analyses/day
 * - Multi-stage loading UI shows 9-step analysis pipeline (fetch → parse → AI → ML → render)
 * - Alpha Model v2: 44-expert MoE ensemble predicting 30-day market-relative alpha
 *   • 77.5% directional accuracy on high-confidence SHORT signals
 *   • Key features: 52W price momentum, EPS surprise, major bank downgrades (contrarian)
 * - Backward compat: Legacy ML prediction card shown if no alpha prediction available
 * - Financial data conditional: 10-K/10-Q always show financials, 8-K only if earnings-related
 * - Real-time stock chart: 30d before/after filing with prediction overlay & accuracy tracking
 * - Analyst activity: 30-day window before filing, major firm downgrades = #2 bullish signal
 * - FilingChat: Floating AI assistant for filing-specific Q&A (authenticated users only)
 * - Re-analyze button: Force fresh analysis (bypasses cache, useful after model updates)
 * - Print-optimized: data-print-section attributes for clean PDF generation
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine, ReferenceDot } from 'recharts';
import { FilingChat } from '@/components/FilingChat';

interface FilingAnalysisData {
  filing: {
    accessionNumber: string;
    filingType: string;
    filingDate: string;
    hasFinancials?: boolean;
    company?: {
      name: string;
      ticker: string;
    };
  };
  analysis?: {
    risks: {
      overallTrend: string;
      riskScore: number;
      newRisks: Array<{
        title: string;
        severity: number;
        impact: string;
        reasoning: string;
      }>;
      topChanges: string[];
    };
    sentiment: {
      sentimentScore: number;
      confidence: number;
      tone: string;
      keyPhrases: string[];
    };
    concernAssessment?: {
      concernLevel: number;
      concernLabel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
      netAssessment: 'BULLISH' | 'NEUTRAL' | 'CAUTIOUS' | 'BEARISH';
      concernFactors: string[];
      positiveFactors: string[];
      reasoning: string;
    };
    analyst?: {
      consensusScore: number | null;
      upsidePotential: number | null;
      numberOfAnalysts: number | null;
      targetPrice: number | null;
      activity: {
        upgradesLast30d: number;
        downgradesLast30d: number;
        netUpgrades: number;
        majorUpgrades: number;
        majorDowngrades: number;
      };
    };
    summary: string;
    filingContentSummary?: string;
    financialMetrics?: {
      revenueGrowth?: string;
      marginTrend?: string;
      guidanceDirection?: 'raised' | 'lowered' | 'maintained' | 'not_provided';
      guidanceDetails?: string;
      keyMetrics?: string[];
      surprises?: string[];
      guidanceComparison?: {
        change: 'raised' | 'lowered' | 'maintained' | 'new';
        details: string;
      };
      structuredData?: {
        revenue?: number;
        netIncome?: number;
        eps?: number;
        grossMargin?: number;
        operatingMargin?: number;
        revenueYoY?: string;
        netIncomeYoY?: string;
        epsYoY?: string;
        consensusEPS?: number;
        consensusRevenue?: number;
        epsSurprisePercent?: number;
        revenueSurprisePercent?: number;
        peRatio?: number;
        marketCap?: number;
        sector?: string;
        industry?: string;
      };
    };
  };
  mlPrediction?: {
    predicted7dReturn: number;
    predictionConfidence: number;
    tradingSignal: 'BUY' | 'SELL' | 'HOLD';
    confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  prediction?: {
    predicted7dReturn: number;
    predicted30dReturn?: number;
    expectedAlpha?: number;
    confidence: any;
    signal?: string;
    reasoning?: string;
    actual7dReturn?: number;
    actual7dAlpha?: number;
    modelVersion?: string;
    percentile?: number;
    featureContributions?: Record<string, number>;
    features?: {
      riskScoreDelta?: number;
      sentimentScore?: number;
      concernLevel?: number;
      filingType?: string;
      guidanceChange?: string;
      epsSurprise?: string;
      epsSurpriseMagnitude?: number;
      revenueSurprise?: string;
      revenueSurpriseMagnitude?: number;
      peRatio?: number;
      marketCap?: number;
      ticker?: string;
      avgHistoricalReturn?: number;
      analystNetUpgrades?: number;
      analystMajorUpgrades?: number;
      analystMajorDowngrades?: number;
      analystUpsidePotential?: number;
    };
  };
  accuracy?: {
    hasData: boolean;
    daysElapsed: number;
    predicted7dReturn: number;
    actual7dReturn?: number;
    error?: number;
    errorPercent?: number;
    accuracy?: 'Excellent' | 'Good' | 'Fair' | 'Poor';
    message?: string;
  };
}

type AnalysisStep =
  | 'fetching-filing'
  | 'parsing-content'
  | 'fetching-prior'
  | 'analyzing-risks'
  | 'analyzing-sentiment'
  | 'extracting-financials'
  | 'comparing-consensus'
  | 'running-ml-model'
  | 'generating-prediction'
  | 'complete';

/**
 * Determine if a filing has financial data
 * Similar to scripts/utils/has-financials.ts but works with API response data
 */
function hasFinancialData(filing: { filingType: string }, financialMetrics?: any): boolean {
  // 10-K and 10-Q always have financials
  if (filing.filingType === '10-K' || filing.filingType === '10-Q') {
    return true;
  }

  // For 8-K, check if analysis contains financial metrics
  if (filing.filingType === '8-K' && financialMetrics) {
    const fm = financialMetrics;

    // Check for any financial data indicators
    const hasFinancials =
      // Structured data from Yahoo Finance (earnings, revenue)
      fm.structuredData ||
      // EPS/Revenue surprises
      fm.surprises?.length > 0 ||
      // Revenue growth metrics (only if it's a number or meaningful string, not "Not disclosed")
      (fm.revenueGrowth !== undefined &&
       fm.revenueGrowth !== null &&
       fm.revenueGrowth !== 'Not disclosed' &&
       fm.revenueGrowth !== 'not_disclosed') ||
      // Key financial metrics
      fm.keyMetrics?.length > 0 ||
      // Guidance (only if it's a meaningful direction, not "not_provided")
      (fm.guidanceDirection &&
       fm.guidanceDirection !== 'not_provided' &&
       fm.guidanceDirection !== 'Not provided') ||
      (fm.guidanceChange &&
       fm.guidanceChange !== 'not_provided' &&
       fm.guidanceChange !== 'Not provided');

    return !!hasFinancials;
  }

  return false;
}

export default function FilingPage() {
  const params = useParams();
  const router = useRouter();
  const accession = params.accession as string;

  const [data, setData] = useState<FilingAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<AnalysisStep>('fetching-filing');
  const [error, setError] = useState<string | null>(null);
  const [stockPrices, setStockPrices] = useState<any>(null);
  const [loadingStockPrices, setLoadingStockPrices] = useState(false);
  const [renderComplete, setRenderComplete] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [reanalyzeMessage, setReanalyzeMessage] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        setIsAuthenticated(!!data.user);
      } catch (err) {
        setIsAuthenticated(false);
      } finally {
        setCheckingAuth(false);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    // Only run analysis if authenticated and auth check is complete
    if (!accession || checkingAuth || isAuthenticated === null) return;
    if (!isAuthenticated) {
      // Don't auto-run analysis for unauthenticated users
      setLoading(false);
      return;
    }

    const fetchAnalysis = async () => {
      try {
        setLoading(true);
        setCurrentStep('fetching-filing');

        // Simulate step updates with more granular progress during AI analysis
        const updateSteps = setTimeout(() => setCurrentStep('parsing-content'), 2000);
        const updateSteps2 = setTimeout(() => setCurrentStep('fetching-prior'), 5000);
        const updateSteps3 = setTimeout(() => setCurrentStep('analyzing-risks'), 8000);
        const updateSteps4 = setTimeout(() => setCurrentStep('analyzing-sentiment'), 14000);
        const updateSteps5 = setTimeout(() => setCurrentStep('extracting-financials'), 20000);
        const updateSteps6 = setTimeout(() => setCurrentStep('comparing-consensus'), 26000);
        const updateSteps7 = setTimeout(() => setCurrentStep('running-ml-model'), 32000);

        // Get query params from URL to pass to analyze API
        const searchParams = new URLSearchParams(window.location.search);
        const queryString = searchParams.toString();

        // Fetch analysis (pass query params if they exist)
        const analysisRes = await fetch(`/api/analyze/${accession}${queryString ? `?${queryString}` : ''}`);

        if (!analysisRes.ok) {
          // Try to parse error response for better error message
          const errorData = await analysisRes.json().catch(() => ({}));

          if (analysisRes.status === 401) {
            // Authentication required
            throw new Error(errorData.message || 'Sign up for free to access AI-powered filing analysis. Get 100 analyses per day!');
          }

          throw new Error(errorData.error || errorData.message || `Analysis failed: ${analysisRes.status} ${analysisRes.statusText}`);
        }

        const analysisData = await analysisRes.json();

        if (analysisData.error) {
          throw new Error(analysisData.error);
        }

        clearTimeout(updateSteps);
        clearTimeout(updateSteps2);
        clearTimeout(updateSteps3);
        clearTimeout(updateSteps4);
        clearTimeout(updateSteps5);
        clearTimeout(updateSteps6);
        clearTimeout(updateSteps7);
        setCurrentStep('generating-prediction');

        // Fetch prediction
        const predictionRes = await fetch(`/api/predict/${accession}`);

        if (!predictionRes.ok) {
          console.warn('Prediction failed, continuing without it');
        }

        const predictionData = predictionRes.ok ? await predictionRes.json() : {};

        setCurrentStep('complete');

        // Compute hasFinancials for conditional rendering
        const hasFinancials = hasFinancialData(
          analysisData.filing,
          analysisData.analysis?.financialMetrics
        );

        setData({
          ...analysisData,
          filing: {
            ...analysisData.filing,
            hasFinancials,
          },
          prediction: predictionData.prediction,
          accuracy: predictionData.accuracy,
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [accession, checkingAuth, isAuthenticated]);

  // Fetch stock price data when filing data is loaded
  useEffect(() => {
    if (!data?.filing?.company?.ticker || !data?.filing?.filingDate) return;

    const fetchStockPrices = async () => {
      try {
        setLoadingStockPrices(true);
        const response = await fetch(
          `/api/stock-prices?ticker=${data.filing.company?.ticker}&filingDate=${data.filing.filingDate}`
        );
        const priceData = await response.json();
        if (priceData.error) {
          console.error('Stock prices error:', priceData.error);
          return;
        }
        setStockPrices(priceData);

        // Calculate actual 7BD return from stock price data
        if (priceData.prices && data.prediction) {
          const sevenBdPoint = priceData.prices.find((p: any) => p.is7BdDate);
          if (sevenBdPoint) {
            // Inject accuracy data calculated from stock prices
            setData((prevData: any) => {
              if (!prevData) return prevData;

              const actual7dReturn = sevenBdPoint.pctChange;
              const predicted7dReturn = prevData.prediction.predicted7dReturn;
              const error = Math.abs(actual7dReturn - predicted7dReturn);
              const now = new Date();
              const filingTime = new Date(prevData.filing.filingDate);
              const daysElapsed = Math.floor((now.getTime() - filingTime.getTime()) / (1000 * 60 * 60 * 24));

              let accuracy: 'Excellent' | 'Good' | 'Fair' | 'Poor';
              if (error < 1) {
                accuracy = 'Excellent';
              } else if (error < 2) {
                accuracy = 'Good';
              } else if (error < 4) {
                accuracy = 'Fair';
              } else {
                accuracy = 'Poor';
              }

              return {
                ...prevData,
                accuracy: {
                  hasData: true,
                  daysElapsed,
                  predicted7dReturn,
                  actual7dReturn,
                  error,
                  errorPercent: (error / Math.abs(actual7dReturn || 1)) * 100,
                  accuracy,
                  message: `Prediction was ${accuracy.toLowerCase()} (${error.toFixed(2)}% error)`
                }
              };
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch stock prices:', error);
      } finally {
        setLoadingStockPrices(false);
      }
    };

    fetchStockPrices();
  }, [data?.filing?.company?.ticker, data?.filing?.filingDate, data?.prediction]);

  // Mark render as complete when all data is loaded AND charts have time to render
  useEffect(() => {
    if (data && !loading && !loadingStockPrices) {
      setTimeout(() => setRenderComplete(true), 1500);
    }
  }, [data, loading, loadingStockPrices]);

  const getStepDetails = (step: AnalysisStep) => {
    const steps = {
      'fetching-filing': {
        emoji: '📄',
        title: 'Fetching Filing from SEC',
        description: 'Downloading filing HTML from SEC.gov...',
        progress: 15,
      },
      'parsing-content': {
        emoji: '🔍',
        title: 'Parsing Document',
        description: 'Extracting Risk Factors and MD&A sections...',
        progress: 30,
      },
      'fetching-prior': {
        emoji: '📊',
        title: 'Fetching Prior Filing',
        description: 'Getting previous filing for comparison...',
        progress: 45,
      },
      'analyzing-risks': {
        emoji: '⚠️',
        title: 'Analyzing Risk Factors',
        description: 'Identifying key risks and changes from prior period...',
        progress: 55,
      },
      'analyzing-sentiment': {
        emoji: '💭',
        title: 'Analyzing Management Sentiment',
        description: 'Evaluating management tone and business outlook...',
        progress: 65,
      },
      'extracting-financials': {
        emoji: '💰',
        title: 'Extracting Financial Metrics',
        description: 'Parsing revenue, earnings, and key financial data...',
        progress: 72,
      },
      'comparing-consensus': {
        emoji: '📉',
        title: 'Comparing to Analyst Consensus',
        description: 'Checking earnings surprises vs. Wall Street estimates...',
        progress: 79,
      },
      'running-ml-model': {
        emoji: '🧠',
        title: 'Running Alpha Model v2',
        description: 'Generating 30-day alpha forecast via Ridge + MoE...',
        progress: 86,
      },
      'generating-prediction': {
        emoji: '📈',
        title: 'Finalizing Analysis',
        description: 'Calculating confidence scores and trading signals...',
        progress: 93,
      },
      'complete': {
        emoji: '✅',
        title: 'Analysis Complete',
        description: 'Rendering results...',
        progress: 100,
      },
    };
    return steps[step];
  };

  // Show signup CTA for unauthenticated users
  if (!checkingAuth && isAuthenticated === false && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-2xl mx-4">
          <CardHeader>
            <div className="text-center space-y-4">
              <div className="text-6xl">🔒</div>
              <CardTitle className="text-3xl">AI Analysis Requires Free Account</CardTitle>
              <CardDescription className="text-lg text-slate-600">
                Get instant AI-powered filing analysis with predictive insights
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-4">
              <div className="text-center">
                <h3 className="font-semibold text-lg mb-3 text-slate-900">What you get with a free account:</h3>
                <ul className="text-left space-y-2 text-sm text-slate-700">
                  <li>✅ <strong className="text-slate-900">100 AI analyses per day</strong> - Comprehensive risk & sentiment analysis</li>
                  <li>✅ <strong className="text-slate-900">ML-powered predictions</strong> - 30-day alpha forecasts</li>
                  <li>✅ <strong className="text-slate-900">Interactive AI chat</strong> - Ask questions about any filing</li>
                  <li>✅ <strong className="text-slate-900">Real-time alerts</strong> - Get notified when watched companies file</li>
                  <li>✅ <strong className="text-slate-900">Custom watchlists</strong> - Track your portfolio companies</li>
                </ul>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => {
                  // Redirect to profile/signup page
                  window.location.href = '/profile';
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-lg py-6"
              >
                Sign Up Free - No Credit Card Required
              </Button>
              <Button
                onClick={() => router.back()}
                variant="outline"
                className="w-full text-slate-700"
              >
                ← Back to Filings
              </Button>
            </div>
            <p className="text-center text-xs text-slate-500">
              Already have an account? <a href="/?signin=true" className="text-blue-600 hover:underline">Sign in</a>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if ((loading || !renderComplete) && !error) {
    const stepDetails = getStepDetails(currentStep);

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-2xl mx-4">
          <CardHeader>
            <div className="text-center space-y-4">
              <div className="text-6xl animate-bounce">{stepDetails.emoji}</div>
              <CardTitle className="text-3xl">{stepDetails.title}</CardTitle>
              <CardDescription className="text-lg">
                {loadingStockPrices ? 'Loading stock price data and graphs...' : stepDetails.description}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {/* Progress bar */}
            <div className="space-y-4">
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${loadingStockPrices ? 95 : stepDetails.progress}%` }}
                />
              </div>
              <div className="text-center text-sm text-slate-600">
                {loadingStockPrices ? '95' : stepDetails.progress}% Complete
                {loadingStockPrices && ' - Rendering charts...'}
              </div>

              {/* Steps checklist */}
              <div className="mt-6 space-y-2">
                {[
                  { key: 'fetching-filing', label: 'Fetch filing from SEC' },
                  { key: 'parsing-content', label: 'Parse document sections' },
                  { key: 'fetching-prior', label: 'Fetch prior filing' },
                  { key: 'analyzing-risks', label: 'Analyze risk factors' },
                  { key: 'analyzing-sentiment', label: 'Analyze management sentiment' },
                  { key: 'extracting-financials', label: 'Extract financial metrics' },
                  { key: 'comparing-consensus', label: 'Compare to analyst consensus' },
                  { key: 'running-ml-model', label: 'Run ML prediction model' },
                  { key: 'generating-prediction', label: 'Finalize analysis' },
                ].map((item) => {
                  const allSteps = ['fetching-filing', 'parsing-content', 'fetching-prior', 'analyzing-risks', 'analyzing-sentiment', 'extracting-financials', 'comparing-consensus', 'running-ml-model', 'generating-prediction', 'complete'];
                  const stepIndex = allSteps.indexOf(item.key);
                  const currentIndex = allSteps.indexOf(currentStep);
                  const isComplete = stepIndex < currentIndex;
                  const isCurrent = item.key === currentStep;

                  return (
                    <div key={item.key} className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                          isComplete
                            ? 'bg-green-500 text-white'
                            : isCurrent
                            ? 'bg-blue-500 text-white animate-pulse'
                            : 'bg-slate-300 text-slate-500'
                        }`}
                      >
                        {isComplete ? '✓' : stepIndex + 1}
                      </div>
                      <span
                        className={`text-sm ${
                          isComplete
                            ? 'text-gray-400 line-through'
                            : isCurrent
                            ? 'text-white font-semibold'
                            : 'text-white'
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Note:</strong> Analysis typically takes 30-60 seconds. We're fetching
                  real SEC filing data and running AI analysis on the actual content.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error || 'Failed to load filing analysis'}</CardDescription>
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

  const handlePrint = () => {
    window.print();
  };

  const handleReanalyze = async () => {
    if (!accession) return;

    try {
      setIsReanalyzing(true);
      setReanalyzeMessage('');

      const response = await fetch(`/api/reanalyze/${accession}`, {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        setReanalyzeMessage(result.message);
        // Wait 1.5 seconds to show success message, then reload
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setReanalyzeMessage(`Error: ${result.error}`);
        setIsReanalyzing(false);
      }
    } catch (err: any) {
      setReanalyzeMessage(`Error: ${err.message}`);
      setIsReanalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex gap-2 mb-4 print:hidden">
            <Button
              variant="outline"
              onClick={() => router.back()}
            >
              ← Back
            </Button>
            <Button
              variant="outline"
              onClick={handlePrint}
              className="gap-2"
            >
              <span>🖨️</span> Print Report
            </Button>
          </div>
          <h1 className="text-4xl font-bold">{data.filing.company?.name || 'Company'}</h1>
          <p className="text-lg text-slate-600 mt-2">
            {data.filing.filingType} Filed on{' '}
            {new Date(data.filing.filingDate).toLocaleDateString()}
          </p>
        </div>

        {/* Filing Content Summary - What the filing actually contains */}
        {data.analysis?.filingContentSummary && (
          <Card className="mb-6 border-2 border-slate-300 bg-gradient-to-r from-slate-50 to-slate-100" data-print-section="summary">
            <CardHeader>
              <CardTitle className="text-2xl">📄 Filing Summary</CardTitle>
              <CardDescription>What this {data.filing.filingType} filing contains</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm">
                {data.analysis.filingContentSummary.split('\n').map((line, i) => (
                  <p key={i} className="text-slate-700">{line}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Alpha Model Prediction Card */}
        {data.prediction && data.filing.hasFinancials && (
          <Card className="mb-6 border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-blue-50 shadow-lg" data-print-section="prediction">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">🎯 Alpha Prediction</CardTitle>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-semibold">
                  Alpha Model v2
                </span>
              </div>
              <CardDescription>
                Ridge regression + 44-expert Mixture-of-Experts predicting 30-day market-relative alpha. 77.5% directional accuracy on high-confidence signals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-6 mb-4">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Expected 30-Day Alpha</p>
                  <p
                    className={`text-4xl font-bold ${
                      (data.prediction.expectedAlpha ?? 0) > 0
                        ? 'text-green-600'
                        : (data.prediction.expectedAlpha ?? 0) < 0
                        ? 'text-red-600'
                        : 'text-slate-600'
                    }`}
                  >
                    {(data.prediction.expectedAlpha ?? 0) > 0 ? '+' : ''}
                    {(data.prediction.expectedAlpha ?? 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">vs S&P 500</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Confidence</p>
                  <p className={`text-4xl font-bold ${
                    data.prediction.confidence === 'high' ? 'text-emerald-600' :
                    data.prediction.confidence === 'medium' ? 'text-amber-600' : 'text-slate-500'
                  }`}>
                    {data.prediction.confidence === 'high' ? 'HIGH' :
                     data.prediction.confidence === 'medium' ? 'MEDIUM' : 'LOW'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {data.prediction.percentile} percentile
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Signal</p>
                  <p className="text-2xl font-bold">
                    {data.prediction.signal === 'LONG' && data.prediction.confidence === 'high' && '🟢 STRONG BUY'}
                    {data.prediction.signal === 'LONG' && data.prediction.confidence !== 'high' && '🟢 BUY'}
                    {data.prediction.signal === 'SHORT' && data.prediction.confidence === 'high' && '🔴 STRONG SELL'}
                    {data.prediction.signal === 'SHORT' && data.prediction.confidence !== 'high' && '🔴 SELL'}
                    {data.prediction.signal === 'NEUTRAL' && '🟡 HOLD'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {data.prediction.signal === 'LONG' && (data.prediction.confidence === 'high'
                      ? 'Model expects significant outperformance'
                      : 'Model expects moderate outperformance')}
                    {data.prediction.signal === 'SHORT' && (data.prediction.confidence === 'high'
                      ? 'Model expects significant underperformance'
                      : 'Model expects moderate underperformance')}
                    {data.prediction.signal === 'NEUTRAL' && 'No clear signal'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Top Drivers</p>
                  <p className="text-sm text-slate-700">
                    {data.prediction.featureContributions && Object.entries(data.prediction.featureContributions)
                      .sort(([,a]: any, [,b]: any) => Math.abs(b) - Math.abs(a))
                      .slice(0, 3)
                      .map(([name, val]: any) => (
                        `${val > 0 ? '+' : ''}${val.toFixed(2)} ${name}`
                      ))
                      .join(', ') || 'N/A'}
                  </p>
                </div>
              </div>

              {data.prediction.predicted30dReturn && (
                <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-sm text-slate-600">
                    Predicted 30-day total return: <strong>{data.prediction.predicted30dReturn > 0 ? '+' : ''}{data.prediction.predicted30dReturn.toFixed(2)}%</strong>
                    {' '}(alpha {(data.prediction.expectedAlpha ?? 0) > 0 ? '+' : ''}{(data.prediction.expectedAlpha ?? 0).toFixed(2)}% + ~0.8% market baseline)
                  </span>
                </div>
              )}

              <div className="bg-white p-4 rounded-lg border border-emerald-200">
                <h4 className="font-semibold text-slate-800 mb-2">📊 About This Model</h4>
                <p className="text-sm text-slate-700">
                  Predicts 30-day market-relative alpha using 13 features across a 44-expert Mixture-of-Experts ensemble (routed by sector and market-cap tier).
                  Top features: price momentum (52W high/low), EPS surprise, major bank downgrades (contrarian signal), and macro regime (SPX trend, VIX).
                  <strong className="text-emerald-700"> SHORT signals are strongest: 77.5% high-confidence directional accuracy.</strong>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stock Price Performance Chart */}
        {stockPrices && stockPrices.prices && stockPrices.prices.length > 0 && data.filing.hasFinancials && (
          <Card className="mb-6 border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50" data-print-section="stock-chart">
            <CardHeader>
              <CardTitle className="text-2xl">📊 Stock Price Performance</CardTitle>
              <CardDescription>
                {data.filing.company?.ticker} price movement from 30 days before to 30 days after filing (normalized to filing date)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-white p-4 rounded-lg border-2 border-purple-100">
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart
                    data={stockPrices.prices}
                    margin={{ top: 10, right: 30, left: 10, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      height={60}
                      angle={-45}
                      textAnchor="end"
                      label={{ value: 'Date', position: 'insideBottom', offset: -20, style: { fontSize: 12 } }}
                    />
                    <YAxis
                      label={{ value: '% Change from Filing Date', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;

                        const dataPoint = payload[0].payload;
                        const stockChange = dataPoint.pctChange;
                        const spyChange = dataPoint.spyPctChange;
                        const isFilingDate = dataPoint.isFilingDate;
                        const is7BdDate = dataPoint.is7BdDate;

                        return (
                          <div className="bg-white border border-slate-300 rounded-lg shadow-lg p-3" style={{ fontSize: 12 }}>
                            <p className="font-bold mb-2">{label}</p>
                            {isFilingDate && (
                              <p className="text-amber-600 font-semibold mb-1">📄 Filing Date</p>
                            )}
                            {is7BdDate && data.prediction && (
                              <p className="text-blue-600 font-semibold mb-1">
                                🎯 7-Day Target: {data.prediction.predicted7dReturn > 0 ? '+' : ''}{data.prediction.predicted7dReturn.toFixed(2)}%
                              </p>
                            )}
                            <p className="text-purple-600">
                              <strong>{data.filing.company?.ticker || 'Stock'}:</strong> {stockChange > 0 ? '+' : ''}{stockChange.toFixed(2)}%
                            </p>
                            <p className="text-slate-600">
                              <strong>S&P 500:</strong> {spyChange > 0 ? '+' : ''}{spyChange.toFixed(2)}%
                            </p>
                            {is7BdDate && data.prediction && (
                              <p className="text-slate-500 text-xs mt-2 pt-2 border-t border-slate-200">
                                Predicted vs Actual: {stockChange > 0 ? '+' : ''}{stockChange.toFixed(2)}% (actual) vs {data.prediction.predicted7dReturn > 0 ? '+' : ''}{data.prediction.predicted7dReturn.toFixed(2)}% (predicted)
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, paddingTop: '10px' }}
                      verticalAlign="top"
                    />
                    {/* Reference line at 0% */}
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                    {/* Stock performance line */}
                    <Line
                      type="monotone"
                      dataKey="pctChange"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      name="Stock Change"
                      dot={false}
                    />
                    {/* S&P 500 comparison line */}
                    <Line
                      type="monotone"
                      dataKey="spyPctChange"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="S&P 500 Change"
                      dot={false}
                    />
                    {/* Filing date marker */}
                    {stockPrices.prices.find((p: any) => p.isFilingDate) && (
                      <ReferenceDot
                        x={stockPrices.prices.find((p: any) => p.isFilingDate)?.date}
                        y={0}
                        r={8}
                        fill="#f59e0b"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    )}
                    {/* 7-business-day prediction marker */}
                    {data.prediction && stockPrices.prices.find((p: any) => p.is7BdDate) && (
                      <>
                        <ReferenceLine
                          y={data.prediction.predicted7dReturn}
                          stroke="#3b82f6"
                          strokeDasharray="3 3"
                          strokeWidth={2}
                          label={{
                            value: `Predicted: ${data.prediction.predicted7dReturn > 0 ? '+' : ''}${data.prediction.predicted7dReturn.toFixed(1)}%`,
                            position: 'right',
                            fill: '#3b82f6',
                            fontSize: 11,
                            fontWeight: 'bold'
                          }}
                        />
                        <ReferenceDot
                          x={stockPrices.prices.find((p: any) => p.is7BdDate)?.date}
                          y={data.prediction.predicted7dReturn}
                          r={10}
                          fill="#3b82f6"
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-3 flex items-center justify-center gap-4 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-amber-500"></span>
                    <span>Filing Date: {new Date(data.filing.filingDate).toLocaleDateString()}</span>
                  </div>
                  {data.prediction && stockPrices.sevenBdDate && (
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span>
                      <span>7-Day Prediction: {new Date(stockPrices.sevenBdDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Financial Metrics Card */}
        {data.analysis?.financialMetrics && data.filing.hasFinancials && (
          <Card className="mb-6 border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50" data-print-section="financial">
            <CardHeader>
              <CardTitle className="text-2xl">💰 Key Financial Metrics</CardTitle>
              <CardDescription>Extracted from filing content</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Structured XBRL Data (from SEC Data API) */}
              {data.analysis.financialMetrics.structuredData && (
                <div className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border-2 border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">📊</span>
                    <p className="text-sm font-semibold text-blue-800">Structured XBRL Data (Official SEC API)</p>
                  </div>
                  <div className="grid md:grid-cols-4 gap-3">
                    {data.analysis.financialMetrics.structuredData.revenue && (
                      <div className="bg-white p-3 rounded border border-blue-200">
                        <p className="text-xs text-slate-600 mb-1">Revenue</p>
                        <p className="text-lg font-bold text-blue-600">
                          ${(data.analysis.financialMetrics.structuredData.revenue / 1e9).toFixed(2)}B
                        </p>
                        {data.analysis.financialMetrics.structuredData.revenueYoY && (
                          <p className="text-xs text-slate-500 mt-1">{data.analysis.financialMetrics.structuredData.revenueYoY} YoY</p>
                        )}
                      </div>
                    )}
                    {data.analysis.financialMetrics.structuredData.netIncome && (
                      <div className="bg-white p-3 rounded border border-blue-200">
                        <p className="text-xs text-slate-600 mb-1">Net Income</p>
                        <p className="text-lg font-bold text-green-600">
                          ${(data.analysis.financialMetrics.structuredData.netIncome / 1e9).toFixed(2)}B
                        </p>
                        {data.analysis.financialMetrics.structuredData.netIncomeYoY && (
                          <p className="text-xs text-slate-500 mt-1">{data.analysis.financialMetrics.structuredData.netIncomeYoY} YoY</p>
                        )}
                      </div>
                    )}
                    {data.analysis.financialMetrics.structuredData.eps && (
                      <div className="bg-white p-3 rounded border border-blue-200">
                        <p className="text-xs text-slate-600 mb-1">EPS</p>
                        <p className="text-lg font-bold text-indigo-600">
                          ${data.analysis.financialMetrics.structuredData.eps.toFixed(2)}
                        </p>
                        {data.analysis.financialMetrics.structuredData.epsYoY && (
                          <p className="text-xs text-slate-500 mt-1">{data.analysis.financialMetrics.structuredData.epsYoY} YoY</p>
                        )}
                      </div>
                    )}
                    {data.analysis.financialMetrics.structuredData.grossMargin && (
                      <div className="bg-white p-3 rounded border border-blue-200">
                        <p className="text-xs text-slate-600 mb-1">Gross Margin</p>
                        <p className="text-lg font-bold text-purple-600">
                          {data.analysis.financialMetrics.structuredData.grossMargin.toFixed(1)}%
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Valuation & Consensus Section */}
                  {(data.analysis.financialMetrics.structuredData.peRatio || data.analysis.financialMetrics.structuredData.consensusEPS) && (
                    <div className="mt-4 grid md:grid-cols-2 gap-3">
                      {/* Valuation Metrics */}
                      {(data.analysis.financialMetrics.structuredData.peRatio || data.analysis.financialMetrics.structuredData.marketCap) && (
                        <div className="bg-white p-4 rounded border border-indigo-300">
                          <div className="flex items-center gap-2 mb-3">
                            <span>📊</span>
                            <p className="text-sm font-semibold text-indigo-800">Valuation Metrics (Yahoo Finance)</p>
                          </div>
                          <div className="space-y-2">
                            {data.analysis.financialMetrics.structuredData.peRatio && (
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-600">P/E Ratio:</span>
                                <span className="text-sm font-bold text-indigo-600">
                                  {data.analysis.financialMetrics.structuredData.peRatio.toFixed(1)}x
                                </span>
                              </div>
                            )}
                            {data.analysis.financialMetrics.structuredData.marketCap && (
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-600">Market Cap:</span>
                                <span className="text-sm font-bold text-emerald-600">
                                  ${data.analysis.financialMetrics.structuredData.marketCap.toFixed(0)}B
                                </span>
                              </div>
                            )}
                            {data.analysis.financialMetrics.structuredData.sector && (
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-600">Sector:</span>
                                <span className="text-xs font-medium text-slate-700">
                                  {data.analysis.financialMetrics.structuredData.sector}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Analyst Consensus */}
                      {(data.analysis.financialMetrics.structuredData.consensusEPS || data.analysis.financialMetrics.structuredData.consensusRevenue) && (
                        <div className="bg-white p-4 rounded border border-amber-300">
                          <div className="flex items-center gap-2 mb-3">
                            <span>📈</span>
                            <p className="text-sm font-semibold text-amber-800">Analyst Consensus (Yahoo Finance)</p>
                          </div>
                          <div className="space-y-2">
                            {data.analysis.financialMetrics.structuredData.consensusEPS && (
                              <div>
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-slate-600">Consensus EPS:</span>
                                  <span className="text-sm font-bold text-amber-600">
                                    ${data.analysis.financialMetrics.structuredData.consensusEPS.toFixed(2)}
                                  </span>
                                </div>
                                {data.analysis.financialMetrics.structuredData.eps && (
                                  <div className="flex justify-between items-center mt-1">
                                    <span className="text-xs text-slate-600">Actual EPS:</span>
                                    <span className={`text-sm font-bold ${
                                      data.analysis.financialMetrics.structuredData.eps >= data.analysis.financialMetrics.structuredData.consensusEPS
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }`}>
                                      ${data.analysis.financialMetrics.structuredData.eps.toFixed(2)}
                                      {' '}({data.analysis.financialMetrics.structuredData.eps >= data.analysis.financialMetrics.structuredData.consensusEPS ? '✅ Beat' : '❌ Miss'})
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                            {data.analysis.financialMetrics.structuredData.consensusRevenue && (
                              <div>
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-slate-600">Consensus Rev:</span>
                                  <span className="text-sm font-bold text-amber-600">
                                    ${(data.analysis.financialMetrics.structuredData.consensusRevenue / 1e9).toFixed(2)}B
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-6">
                {/* Revenue Growth */}
                {data.analysis.financialMetrics.revenueGrowth && data.analysis.financialMetrics.revenueGrowth !== 'Not disclosed' && (
                  <div className="bg-white p-4 rounded-lg border border-green-200">
                    <p className="text-sm text-slate-600 mb-1">Revenue Growth (Claude)</p>
                    <p className="text-2xl font-bold text-green-600">
                      {data.analysis.financialMetrics.revenueGrowth}
                    </p>
                  </div>
                )}

                {/* Margin Trend */}
                {data.analysis.financialMetrics.marginTrend && data.analysis.financialMetrics.marginTrend !== 'Not disclosed' && (
                  <div className="bg-white p-4 rounded-lg border border-green-200">
                    <p className="text-sm text-slate-600 mb-1">Margin Trend</p>
                    <p className={`text-2xl font-bold ${
                      data.analysis.financialMetrics.marginTrend === 'Expanding' ? 'text-green-600' :
                      data.analysis.financialMetrics.marginTrend === 'Contracting' ? 'text-red-600' :
                      'text-slate-600'
                    }`}>
                      {data.analysis.financialMetrics.marginTrend === 'Expanding' ? '📈 Expanding' :
                       data.analysis.financialMetrics.marginTrend === 'Contracting' ? '📉 Contracting' :
                       '➡️ Stable'}
                    </p>
                  </div>
                )}

                {/* Guidance Direction */}
                {data.analysis.financialMetrics.guidanceDirection && data.analysis.financialMetrics.guidanceDirection !== 'not_provided' && (
                  <div className="bg-white p-4 rounded-lg border border-green-200">
                    <p className="text-sm text-slate-600 mb-1">Forward Guidance</p>
                    <p className={`text-2xl font-bold ${
                      data.analysis.financialMetrics.guidanceDirection === 'raised' ? 'text-green-600' :
                      data.analysis.financialMetrics.guidanceDirection === 'lowered' ? 'text-red-600' :
                      'text-slate-600'
                    }`}>
                      {data.analysis.financialMetrics.guidanceDirection === 'raised' ? '⬆️ Raised' :
                       data.analysis.financialMetrics.guidanceDirection === 'lowered' ? '⬇️ Lowered' :
                       '➡️ Maintained'}
                    </p>
                    {data.analysis.financialMetrics.guidanceDetails && (
                      <p className="text-xs text-slate-600 mt-2">
                        {data.analysis.financialMetrics.guidanceDetails}
                      </p>
                    )}
                  </div>
                )}

                {/* Guidance Comparison (vs Prior Period) */}
                {data.analysis.financialMetrics.guidanceComparison && (
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border-2 border-blue-200">
                    <p className="text-sm text-slate-600 mb-1">Guidance Change vs Prior Period</p>
                    <p className={`text-xl font-bold mb-2 ${
                      data.analysis.financialMetrics.guidanceComparison.change === 'raised' ? 'text-green-600' :
                      data.analysis.financialMetrics.guidanceComparison.change === 'lowered' ? 'text-red-600' :
                      data.analysis.financialMetrics.guidanceComparison.change === 'new' ? 'text-blue-600' :
                      'text-slate-600'
                    }`}>
                      {data.analysis.financialMetrics.guidanceComparison.change === 'raised' ? '📈 Guidance Raised' :
                       data.analysis.financialMetrics.guidanceComparison.change === 'lowered' ? '📉 Guidance Lowered' :
                       data.analysis.financialMetrics.guidanceComparison.change === 'new' ? '🆕 New Guidance Provided' :
                       '➡️ Guidance Maintained'}
                    </p>
                    <p className="text-sm text-slate-700">
                      {data.analysis.financialMetrics.guidanceComparison.details}
                    </p>
                  </div>
                )}
              </div>

              {/* Key Metrics */}
              {data.analysis.financialMetrics.keyMetrics && data.analysis.financialMetrics.keyMetrics.length > 0 && (
                <div className="mt-4 bg-white p-4 rounded-lg border border-green-200">
                  <p className="text-sm font-semibold text-slate-700 mb-2">Key Business Metrics:</p>
                  <ul className="space-y-1">
                    {data.analysis.financialMetrics.keyMetrics.map((metric, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="text-green-600 font-bold">•</span>
                        <span>{metric}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Earnings Surprises */}
              {data.analysis.financialMetrics.surprises && data.analysis.financialMetrics.surprises.length > 0 && (
                <div className="mt-4 bg-white p-4 rounded-lg border border-amber-200">
                  <p className="text-sm font-semibold text-slate-700 mb-2">Earnings Surprises:</p>
                  <ul className="space-y-1">
                    {data.analysis.financialMetrics.surprises.map((surprise, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className={`font-bold ${surprise.toLowerCase().includes('beat') ? 'text-green-600' : 'text-red-600'}`}>
                          {surprise.toLowerCase().includes('beat') ? '✓' : '✗'}
                        </span>
                        <span>{surprise}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Analysis Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Executive Summary */}
          {data.analysis && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>📋 Executive Summary</CardTitle>
                  <Button
                    variant="outline"
                    onClick={handleReanalyze}
                    disabled={isReanalyzing}
                    className="text-xs gap-2"
                  >
                    {isReanalyzing ? '⏳ Re-analyzing...' : '🔄 Re-Analyze'}
                  </Button>
                </div>
                {reanalyzeMessage && (
                  <p className={`text-sm mt-2 ${reanalyzeMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                    {reanalyzeMessage}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm">
                  {data.analysis.summary.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Risk Analysis */}
          {data.analysis && (
            <Card className="border-2 border-red-200 bg-gradient-to-r from-red-50 to-orange-50" data-print-section="risks">
              <CardHeader>
                <CardTitle>⚠️ Risk Analysis</CardTitle>
                <CardDescription>
                  Trend: {data.analysis.risks.overallTrend} | Score:{' '}
                  {data.analysis.risks.riskScore.toFixed(1)}/10
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.analysis.risks.newRisks && data.analysis.risks.newRisks.length > 0 ? (
                  <div className="space-y-4">
                    {data.analysis.risks.newRisks.map((risk, i) => (
                      <div key={i} className="border-l-4 border-red-400 pl-3">
                        <h4 className="font-bold">{risk.title}</h4>
                        <p className="text-sm text-slate-600 mt-1">{risk.impact}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Severity: {risk.severity}/10
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-600 space-y-2">
                    <p>
                      {data.filing.filingType === '8-K'
                        ? '8-K filings do not contain Risk Factors sections.'
                        : 'No new or changed risk factors identified in this filing.'}
                    </p>
                    {data.filing.filingType === '8-K' && (
                      <p className="text-sm">
                        Risk factors are disclosed in 10-K and 10-Q filings. For {data.filing.company?.ticker || 'this company'}'s latest risk factors, see their most recent 10-K or 10-Q filing.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Concern Assessment */}
          {data.analysis?.concernAssessment && (
            <Card className="border-2 border-yellow-200 bg-gradient-to-r from-yellow-50 to-orange-50" data-print-section="concern">
              <CardHeader>
                <CardTitle>⚠️ Concern Assessment</CardTitle>
                <CardDescription>
                  {data.analysis.concernAssessment.concernLabel} ({data.analysis.concernAssessment.concernLevel.toFixed(1)}/10) | {data.analysis.concernAssessment.netAssessment}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Concern Level Bar */}
                  <div>
                    <div className="flex justify-between text-xs mb-1 text-slate-700 font-medium">
                      <span>Low</span>
                      <span>Moderate</span>
                      <span>Elevated</span>
                      <span>High</span>
                      <span>Critical</span>
                    </div>
                    <div className="h-4 bg-gradient-to-r from-green-500 via-yellow-500 via-orange-500 to-red-600 rounded relative">
                      <div
                        className="absolute w-2 h-6 bg-black rounded -top-1"
                        style={{
                          left: `${(data.analysis.concernAssessment.concernLevel / 10) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Reasoning */}
                  <div className="bg-white p-4 rounded border border-slate-200">
                    <p className="text-sm text-slate-800">{data.analysis.concernAssessment.reasoning}</p>
                  </div>

                  {/* Concern Factors */}
                  {data.analysis.concernAssessment.concernFactors.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-2 text-red-700">⚠️ Warning Signs:</p>
                      <ul className="space-y-1">
                        {data.analysis.concernAssessment.concernFactors.map((factor, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-red-600 font-bold">•</span>
                            <span className="text-sm text-slate-800">{factor}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Positive Factors */}
                  {data.analysis.concernAssessment.positiveFactors.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-2 text-green-700">✓ Positive Signals:</p>
                      <ul className="space-y-1">
                        {data.analysis.concernAssessment.positiveFactors.map((factor, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-green-600 font-bold">•</span>
                            <span className="text-sm text-slate-800">{factor}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Analyst Activity & Sentiment */}
          {data.analysis?.analyst && data.filing.hasFinancials && (
            <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50" data-print-section="analyst">
              <CardHeader>
                <CardTitle>📊 Analyst Activity & Sentiment (30 Days Before Filing)</CardTitle>
                <CardDescription>
                  Contrarian signals feed Alpha Model v2 • Major-firm downgrades = recovery opportunity
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Activity Summary */}
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-lg border border-purple-200">
                      <p className="text-sm text-slate-600 mb-1">Net Upgrades</p>
                      <p className={`text-3xl font-bold ${
                        data.analysis.analyst.activity.netUpgrades > 0 ? 'text-green-600' :
                        data.analysis.analyst.activity.netUpgrades < 0 ? 'text-red-600' : 'text-slate-600'
                      }`}>
                        {data.analysis.analyst.activity.netUpgrades > 0 ? '+' : ''}
                        {data.analysis.analyst.activity.netUpgrades}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {data.analysis.analyst.activity.upgradesLast30d} upgrades, {data.analysis.analyst.activity.downgradesLast30d} downgrades
                      </p>
                    </div>

                    <div className="bg-white p-4 rounded-lg border border-purple-200">
                      <p className="text-sm text-slate-600 mb-1">Major Firm Activity</p>
                      <div className="flex gap-4">
                        <div>
                          <p className="text-2xl font-bold text-green-600">↑ {data.analysis.analyst.activity.majorUpgrades}</p>
                          <p className="text-xs text-slate-500">Major upgrades</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-red-600">↓ {data.analysis.analyst.activity.majorDowngrades}</p>
                          <p className="text-xs text-slate-500">Major downgrades</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border border-purple-200">
                      <p className="text-sm text-slate-600 mb-1">Consensus</p>
                      <p className="text-3xl font-bold text-blue-600">
                        {data.analysis.analyst.consensusScore !== null ? data.analysis.analyst.consensusScore : 'N/A'}
                        {data.analysis.analyst.consensusScore !== null && '/100'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {data.analysis.analyst.consensusScore !== null && data.analysis.analyst.consensusScore >= 75 && 'Strong Buy consensus'}
                        {data.analysis.analyst.consensusScore !== null && data.analysis.analyst.consensusScore >= 60 && data.analysis.analyst.consensusScore < 75 && 'Buy consensus'}
                        {data.analysis.analyst.consensusScore !== null && data.analysis.analyst.consensusScore >= 40 && data.analysis.analyst.consensusScore < 60 && 'Hold consensus'}
                        {data.analysis.analyst.consensusScore !== null && data.analysis.analyst.consensusScore < 40 && 'Sell consensus'}
                        {data.analysis.analyst.consensusScore === null && 'Not available'}
                      </p>
                    </div>
                  </div>

                  {/* Target Price & Upside */}
                  {data.analysis.analyst.targetPrice !== null && (
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-slate-600">Analyst Target Price</p>
                          <p className="text-2xl font-bold text-blue-700">
                            ${data.analysis.analyst.targetPrice.toFixed(2)}
                          </p>
                        </div>
                        {data.analysis.analyst.upsidePotential !== null && (
                          <div className="text-right">
                            <p className="text-sm text-slate-600">Upside Potential</p>
                            <p className={`text-2xl font-bold ${
                              data.analysis.analyst.upsidePotential > 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {data.analysis.analyst.upsidePotential > 0 ? '+' : ''}
                              {data.analysis.analyst.upsidePotential.toFixed(1)}%
                            </p>
                          </div>
                        )}
                      </div>
                      {data.analysis.analyst.numberOfAnalysts !== null && (
                        <p className="text-xs text-slate-500 mt-2">
                          Based on {data.analysis.analyst.numberOfAnalysts} analyst{data.analysis.analyst.numberOfAnalysts !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Alpha Model Note */}
                  <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                    <p className="text-sm text-purple-900">
                      <strong>📈 Alpha Model v2:</strong> Major bank downgrades (Goldman, MS, JPM, BofA) are the <strong>second-strongest bullish signal</strong> — the market systematically overreacts to top-tier downgrades, creating 30-day recovery opportunities. High analyst upside targets are bearish (value trap signal).
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Changes (risk factor changes vs prior filing) */}
          {data.analysis && data.analysis.risks.topChanges.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>🔍 Notable Changes vs Prior Filing</CardTitle>
                <CardDescription>Key shifts in risk factors and disclosures since the last filing</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {data.analysis.risks.topChanges.map((change, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-blue-600 font-bold">•</span>
                      <span className="text-sm">{change}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* AI Chat Component - Fixed position floating button */}
      {data && data.filing.company && (
        <FilingChat
          ticker={data.filing.company.ticker}
          companyName={data.filing.company.name}
          filingType={data.filing.filingType}
          filingDate={data.filing.filingDate}
        />
      )}
    </div>
  );
}
