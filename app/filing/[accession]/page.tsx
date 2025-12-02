'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine, ReferenceDot } from 'recharts';

interface FilingAnalysisData {
  filing: {
    accessionNumber: string;
    filingType: string;
    filingDate: string;
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
    confidence: number;
    reasoning?: string;
    actual7dReturn?: number;
    modelVersion?: string;
    features?: {
      riskScoreDelta?: number;
      sentimentScore?: number;
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
  | 'running-ai'
  | 'generating-prediction'
  | 'complete';

export default function FilingPage() {
  console.log('🚀 FilingPage component loaded - NEW VERSION with renderComplete + progress bar at 95%');
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

  useEffect(() => {
    if (!accession) return;

    const fetchAnalysis = async () => {
      try {
        setLoading(true);
        setCurrentStep('fetching-filing');

        // Simulate step updates (in real implementation, these would come from API)
        const updateSteps = setTimeout(() => setCurrentStep('parsing-content'), 2000);
        const updateSteps2 = setTimeout(() => setCurrentStep('fetching-prior'), 5000);
        const updateSteps3 = setTimeout(() => setCurrentStep('running-ai'), 8000);

        // Get query params from URL to pass to analyze API
        const searchParams = new URLSearchParams(window.location.search);
        const queryString = searchParams.toString();

        // Fetch analysis (pass query params if they exist)
        const analysisRes = await fetch(`/api/analyze/${accession}${queryString ? `?${queryString}` : ''}`);

        if (!analysisRes.ok) {
          throw new Error(`Analysis failed: ${analysisRes.status} ${analysisRes.statusText}`);
        }

        const analysisData = await analysisRes.json();

        if (analysisData.error) {
          throw new Error(analysisData.error);
        }

        clearTimeout(updateSteps);
        clearTimeout(updateSteps2);
        clearTimeout(updateSteps3);
        setCurrentStep('generating-prediction');

        // Fetch prediction
        const predictionRes = await fetch(`/api/predict/${accession}`);

        if (!predictionRes.ok) {
          console.warn('Prediction failed, continuing without it');
        }

        const predictionData = predictionRes.ok ? await predictionRes.json() : {};

        setCurrentStep('complete');

        setData({
          ...analysisData,
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
  }, [accession]);

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
            console.log(`[Stock Prices] Found 7BD actual return: ${sevenBdPoint.pctChange}%`);
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
    console.log('🔍 RENDER STATE CHECK:', { data: !!data, loading, loadingStockPrices, renderComplete });
    if (data && !loading && !loadingStockPrices) {
      console.log('✅ ALL DATA LOADED - Waiting 1.5s for charts to render...');
      // Add delay to ensure charts are fully rendered before hiding spinner
      setTimeout(() => {
        console.log('✅ RENDER COMPLETE SET TO TRUE');
        setRenderComplete(true);
      }, 1500); // 1.5 second delay to ensure charts render
    }
  }, [data, loading, loadingStockPrices]);

  const getStepDetails = (step: AnalysisStep) => {
    const steps = {
      'fetching-filing': {
        emoji: '📄',
        title: 'Fetching Filing from SEC',
        description: 'Downloading filing HTML from SEC.gov...',
        progress: 20,
      },
      'parsing-content': {
        emoji: '🔍',
        title: 'Parsing Document',
        description: 'Extracting Risk Factors and MD&A sections...',
        progress: 35,
      },
      'fetching-prior': {
        emoji: '📊',
        title: 'Fetching Prior Filing',
        description: 'Getting previous filing for comparison...',
        progress: 50,
      },
      'running-ai': {
        emoji: '🤖',
        title: 'Running AI Analysis',
        description: 'Claude is analyzing risks, sentiment, and changes...',
        progress: 75,
      },
      'generating-prediction': {
        emoji: '📈',
        title: 'Generating Prediction',
        description: 'Calculating 7-day stock return prediction...',
        progress: 90,
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

  if (loading || !renderComplete) {
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
                  { key: 'running-ai', label: 'Run AI analysis' },
                  { key: 'generating-prediction', label: 'Generate prediction' },
                ].map((item) => {
                  const stepIndex = ['fetching-filing', 'parsing-content', 'fetching-prior', 'running-ai', 'generating-prediction'].indexOf(item.key);
                  const currentIndex = ['fetching-filing', 'parsing-content', 'fetching-prior', 'running-ai', 'generating-prediction'].indexOf(currentStep);
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
                            ? 'text-slate-900 line-through'
                            : isCurrent
                            ? 'text-slate-900 font-semibold'
                            : 'text-slate-500'
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="mb-4"
          >
            ← Back
          </Button>
          <h1 className="text-4xl font-bold">{data.filing.company?.name || 'Company'}</h1>
          <p className="text-lg text-slate-600 mt-2">
            {data.filing.filingType} Filed on{' '}
            {new Date(data.filing.filingDate).toLocaleDateString()}
          </p>
        </div>

        {/* Filing Content Summary - What the filing actually contains */}
        {data.analysis?.filingContentSummary && (
          <Card className="mb-6 border-2 border-slate-300 bg-gradient-to-r from-slate-50 to-slate-100">
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

        {/* ML Prediction Card - NEW 80% ACCURACY MODEL */}
        {data.mlPrediction && (
          <Card className="mb-6 border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-blue-50 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">🎯 ML Price Prediction</CardTitle>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-semibold">
                  80% Accuracy Model
                </span>
              </div>
              <CardDescription>
                RandomForest ML model trained on 400+ filings with analyst activity, fundamentals, and momentum indicators
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-6 mb-4">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Predicted 7-Day Return</p>
                  <p
                    className={`text-4xl font-bold ${
                      data.mlPrediction.predicted7dReturn > 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {data.mlPrediction.predicted7dReturn > 0 ? '+' : ''}
                    {data.mlPrediction.predicted7dReturn.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Confidence</p>
                  <p className="text-4xl font-bold text-emerald-600">
                    {(data.mlPrediction.predictionConfidence * 100).toFixed(0)}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {data.mlPrediction.confidenceLabel}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Trading Signal</p>
                  <p className="text-2xl font-bold">
                    {data.mlPrediction.tradingSignal === 'BUY' && '🟢 BUY'}
                    {data.mlPrediction.tradingSignal === 'SELL' && '🔴 SELL'}
                    {data.mlPrediction.tradingSignal === 'HOLD' && '🟡 HOLD'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {data.mlPrediction.tradingSignal === 'HOLD' && '(Below threshold)'}
                    {data.mlPrediction.tradingSignal !== 'HOLD' && '(Confidence ≥60%, Return ≥2%)'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Model Features</p>
                  <p className="text-sm text-slate-700">
                    • Analyst upgrades/downgrades (30d)<br/>
                    • Price momentum & technical indicators<br/>
                    • Valuation ratios & market context
                  </p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-emerald-200">
                <h4 className="font-semibold text-slate-800 mb-2">📊 About This Model</h4>
                <p className="text-sm text-slate-700">
                  This prediction comes from a RandomForest ML model that achieved 80% directional accuracy
                  on historical filings. The model uses 40+ features including analyst activity (upgrades/downgrades in last 30 days),
                  technical indicators (RSI, MACD, moving averages), valuation metrics (P/E ratios), and market context (S&P 500, VIX).
                  <strong className="text-emerald-700"> Most important feature: Net analyst upgrades in the 30 days before filing.</strong>
                </p>

                {data.mlPrediction.predictionConfidence < 0.70 && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                    <strong>⚠️ Moderate Confidence:</strong> This prediction has moderate confidence ({(data.mlPrediction.predictionConfidence * 100).toFixed(0)}%).
                    Consider reviewing additional factors before making trading decisions.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Old Prediction Card (Legacy - For Comparison) */}
        {data.prediction && !data.mlPrediction && (
          <Card className="mb-6 border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50">
            <CardHeader>
              <CardTitle className="text-2xl">📈 7-Day Price Prediction (Legacy Model)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Predicted Return</p>
                  <p
                    className={`text-4xl font-bold ${
                      data.prediction.predicted7dReturn > 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {data.prediction.predicted7dReturn > 0 ? '+' : ''}
                    {data.prediction.predicted7dReturn.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Confidence</p>
                  <p className="text-4xl font-bold text-blue-600">
                    {(data.prediction.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Signal</p>
                  <p className="text-2xl font-bold">
                    {data.prediction.predicted7dReturn > 1
                      ? '🟢 Strong Buy'
                      : data.prediction.predicted7dReturn > 0
                      ? '🟢 Buy'
                      : data.prediction.predicted7dReturn > -1
                      ? '🟡 Hold'
                      : '🔴 Sell'}
                  </p>
                </div>
              </div>
              {data.prediction.reasoning && (
                <div className="mt-4 bg-white p-4 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    🧠 Model Reasoning
                    {data.prediction.modelVersion && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {data.prediction.modelVersion}
                      </span>
                    )}
                    {/* Data Quality Indicator */}
                    {data.prediction.confidence < 0.6 && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                        ⚠️ Limited Data
                      </span>
                    )}
                  </h4>
                  <p className="text-sm text-slate-700">{data.prediction.reasoning}</p>

                  {/* Warning when confidence is low */}
                  {data.prediction.confidence < 0.6 && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                      <strong>⚠️ Low Confidence:</strong> This filing contains minimal narrative content (may cross-reference prior filings).
                      The model has limited data for analysis. Consider reviewing the full 10-K or earnings call for complete guidance.
                    </div>
                  )}
                </div>
              )}

              {/* Model Transparency - Feature Breakdown */}
              {data.prediction.features && (
                <div className="mt-4 bg-white p-4 rounded-lg border-2 border-purple-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                      🔬 Prediction Model Breakdown
                    </h4>
                    <button
                      onClick={() => {
                        const modal = document.getElementById('model-info-modal');
                        if (modal) modal.classList.remove('hidden');
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      How does this work?
                    </button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    {/* Major Price Drivers */}
                    {data.prediction.features.guidanceChange && data.prediction.features.guidanceChange !== 'maintained' && (
                      <div className="bg-gradient-to-r from-green-50 to-blue-50 p-3 rounded border border-green-200">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">📊 Guidance Change</span>
                          <span className={`font-bold ${
                            data.prediction.features.guidanceChange === 'raised' ? 'text-green-600' :
                            data.prediction.features.guidanceChange === 'lowered' ? 'text-red-600' :
                            'text-blue-600'
                          }`}>
                            {data.prediction.features.guidanceChange === 'raised' ? '+3.5%' :
                             data.prediction.features.guidanceChange === 'lowered' ? '-4.0%' :
                             '+1.0%'} impact
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          {data.prediction.features.guidanceChange === 'raised' ? '⬆️ Raised' :
                           data.prediction.features.guidanceChange === 'lowered' ? '⬇️ Lowered' :
                           '🆕 New'} vs prior period (major driver)
                        </p>
                      </div>
                    )}

                    {data.prediction.features.epsSurprise && data.prediction.features.epsSurprise !== 'unknown' && (
                      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-3 rounded border border-yellow-200">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">💰 EPS Surprise</span>
                          <span className={`font-bold ${
                            data.prediction.features.epsSurprise === 'beat' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {(() => {
                              // Calculate actual impact with P/E and market cap multipliers
                              const peMultiplier = data.prediction.features.peRatio
                                ? (data.prediction.features.peRatio < 15 ? 0.8 :
                                   data.prediction.features.peRatio < 25 ? 1.0 :
                                   data.prediction.features.peRatio < 40 ? 1.2 : 1.5)
                                : 1.0;
                              const mcMultiplier = data.prediction.features.marketCap
                                ? (data.prediction.features.marketCap < 2 ? 0.9 :
                                   data.prediction.features.marketCap < 10 ? 1.0 :
                                   data.prediction.features.marketCap < 50 ? 1.1 :
                                   data.prediction.features.marketCap < 200 ? 1.2 : 1.3)
                                : 1.0;
                              const combined = peMultiplier * mcMultiplier;
                              const base = data.prediction.features.epsSurprise === 'beat' ? 1.3 : -2.9;
                              const magnitude = Math.abs(data.prediction.features.epsSurpriseMagnitude || 0);
                              const largeSurpriseBonus = magnitude > 5 ? (data.prediction.features.epsSurprise === 'beat' ? 1.0 : -2.0) * combined : 0;
                              const impact = base * combined + largeSurpriseBonus;
                              return `${impact > 0 ? '+' : ''}${impact.toFixed(1)}% impact`;
                            })()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          {data.prediction.features.epsSurprise === 'beat' ? '✅ Beat' : '❌ Missed'} by {Math.abs(data.prediction.features.epsSurpriseMagnitude || 0).toFixed(1)}%
                          {data.prediction.features.peRatio && data.prediction.features.marketCap && (
                            <span className="text-indigo-600">
                              {' '}• {(() => {
                                const peM = data.prediction.features.peRatio < 15 ? 0.8 : data.prediction.features.peRatio < 25 ? 1.0 : data.prediction.features.peRatio < 40 ? 1.2 : 1.5;
                                const mcM = data.prediction.features.marketCap < 2 ? 0.9 : data.prediction.features.marketCap < 10 ? 1.0 : data.prediction.features.marketCap < 50 ? 1.1 : data.prediction.features.marketCap < 200 ? 1.2 : 1.3;
                                return `${(peM * mcM).toFixed(2)}x adj`;
                              })()}
                            </span>
                          )}
                        </p>
                      </div>
                    )}

                    {data.prediction.features.revenueSurprise && data.prediction.features.revenueSurprise !== 'unknown' && (
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-3 rounded border border-purple-200">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">📈 Revenue Surprise</span>
                          <span className={`font-bold ${
                            data.prediction.features.revenueSurprise === 'beat' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {data.prediction.features.revenueSurprise === 'beat' ? '+0.8%' : '-1.5%'} impact
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          {data.prediction.features.revenueSurprise === 'beat' ? '✅ Beat' : '❌ Missed'} expectations
                        </p>
                      </div>
                    )}

                    {/* Sentiment & Risk */}
                    {typeof data.prediction.features.sentimentScore === 'number' && (
                      <div className="bg-slate-50 p-3 rounded border border-slate-200">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">😊 Management Sentiment</span>
                          <span className={`font-bold ${
                            data.prediction.features.sentimentScore > 0 ? 'text-green-600' :
                            data.prediction.features.sentimentScore < 0 ? 'text-red-600' : 'text-slate-600'
                          }`}>
                            {(data.prediction.features.sentimentScore * 4).toFixed(1)}% impact
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          Score: {data.prediction.features.sentimentScore.toFixed(2)} (4x weight)
                        </p>
                      </div>
                    )}

                    {typeof data.prediction.features.riskScoreDelta === 'number' && (
                      <div className="bg-slate-50 p-3 rounded border border-slate-200">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">⚠️ Risk Factor Change</span>
                          <span className={`font-bold ${
                            data.prediction.features.riskScoreDelta < 0 ? 'text-green-600' :
                            data.prediction.features.riskScoreDelta > 0 ? 'text-red-600' : 'text-slate-600'
                          }`}>
                            {(-data.prediction.features.riskScoreDelta * 0.5).toFixed(1)}% impact
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          Delta: {data.prediction.features.riskScoreDelta.toFixed(1)} (0.5x weight)
                        </p>
                      </div>
                    )}

                    {/* Valuation Metrics - P/E and Market Cap */}
                    {data.prediction.features.peRatio && (
                      <div className="bg-cyan-50 p-3 rounded border border-cyan-200">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">📊 P/E Ratio</span>
                          <span className="font-bold text-cyan-700">
                            {data.prediction.features.peRatio.toFixed(1)}x
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          {(() => {
                            const pe = data.prediction.features.peRatio;
                            const mult = pe < 15 ? 0.8 : pe < 25 ? 1.0 : pe < 40 ? 1.2 : 1.5;
                            const type = pe < 15 ? 'Value' : pe < 25 ? 'Normal' : pe < 40 ? 'Growth' : 'High Growth';
                            return `${type} stock • ${mult}x surprise sensitivity`;
                          })()}
                        </p>
                      </div>
                    )}

                    {data.prediction.features.marketCap && (
                      <div className="bg-emerald-50 p-3 rounded border border-emerald-200">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">💎 Market Cap</span>
                          <span className="font-bold text-emerald-700">
                            ${data.prediction.features.marketCap.toFixed(0)}B
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          {(() => {
                            const mc = data.prediction.features.marketCap;
                            const mult = mc < 2 ? 0.9 : mc < 10 ? 1.0 : mc < 50 ? 1.1 : mc < 200 ? 1.2 : 1.3;
                            const type = mc < 2 ? 'Micro' : mc < 10 ? 'Small' : mc < 50 ? 'Mid' : mc < 200 ? 'Large' : 'Mega';
                            return `${type} cap • ${mult}x momentum factor`;
                          })()}
                        </p>
                      </div>
                    )}

                    {/* Company-Specific Pattern */}
                    {data.prediction.features.ticker && typeof data.prediction.features.avgHistoricalReturn === 'number' && (
                      <div className="bg-indigo-50 p-3 rounded border border-indigo-200">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">📊 {data.prediction.features.ticker} Pattern</span>
                          <span className="font-bold text-indigo-600">
                            {(data.prediction.features.avgHistoricalReturn * 0.4).toFixed(1)}% impact
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          Historical avg: {data.prediction.features.avgHistoricalReturn.toFixed(1)}% (40% weight)
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      <strong>Research-backed model v2.0:</strong> Weights based on 2024-2025 academic studies and S&P 500 earnings data.
                      Guidance changes and earnings surprises have asymmetric impact (negative news ≈ 2x impact vs positive).
                    </p>
                  </div>
                </div>
              )}

              {/* Model Info Modal */}
              <div id="model-info-modal" className="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg max-w-3xl max-h-[90vh] overflow-y-auto p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-bold text-slate-800">🔬 Prediction Model Explained</h3>
                    <button
                      onClick={() => {
                        const modal = document.getElementById('model-info-modal');
                        if (modal) modal.classList.add('hidden');
                      }}
                      className="text-slate-400 hover:text-slate-600 text-2xl"
                    >
                      ×
                    </button>
                  </div>

                  <div className="space-y-4 text-sm">
                    <div>
                      <h4 className="font-semibold text-lg mb-2">Model Version: v2.0-research-2025</h4>
                      <p className="text-slate-600">
                        Our prediction model is based on peer-reviewed academic research and real market data from 2024-2025,
                        not generic assumptions. Each factor's weight is derived from statistical analysis of thousands of SEC filings.
                      </p>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">Key Factors & Research Basis:</h4>

                      <div className="space-y-3">
                        <div className="bg-green-50 p-3 rounded">
                          <p className="font-medium text-green-900">📊 Guidance Changes (±3.5-4.0%)</p>
                          <p className="text-xs text-slate-600 mt-1">
                            <strong>Research:</strong> Industry studies show forward guidance changes are the #1 price driver.
                            Raised guidance: +3.5% avg. Lowered guidance: -4.0% avg (asymmetric reaction).
                          </p>
                        </div>

                        <div className="bg-yellow-50 p-3 rounded">
                          <p className="font-medium text-yellow-900">💰 EPS Surprises (+1.3% / -2.9%)</p>
                          <p className="text-xs text-slate-600 mt-1">
                            <strong>Source:</strong> 2024 Q3 S&P 500 earnings data. EPS beats averaged +1.3% returns,
                            while misses averaged -2.9% (market punishes bad news 2x harder).
                          </p>
                        </div>

                        <div className="bg-purple-50 p-3 rounded">
                          <p className="font-medium text-purple-900">📈 Revenue Surprises (+0.8% / -1.5%)</p>
                          <p className="text-xs text-slate-600 mt-1">
                            <strong>Research:</strong> 2024 Accounting Review study found revenue surprises particularly important
                            for companies with lower earnings quality.
                          </p>
                        </div>

                        <div className="bg-blue-50 p-3 rounded">
                          <p className="font-medium text-blue-900">😊 Management Sentiment (4x multiplier)</p>
                          <p className="text-xs text-slate-600 mt-1">
                            <strong>Research:</strong> NLP studies show MD&A tone analysis has predictive power for future returns.
                            Weight increased from 3x to 4x based on 2024-2025 findings.
                          </p>
                        </div>

                        <div className="bg-orange-50 p-3 rounded">
                          <p className="font-medium text-orange-900">⚠️ Risk Factor Changes (0.5x multiplier)</p>
                          <p className="text-xs text-slate-600 mt-1">
                            <strong>Research:</strong> 2025 study analyzed 21,421 10-K reports (2002-2024) and found risk factor
                            tone significantly predicts weekly stock returns. Weight increased from 0.3x to 0.5x.
                          </p>
                        </div>

                        <div className="bg-indigo-50 p-3 rounded">
                          <p className="font-medium text-indigo-900">📊 Company-Specific Patterns (40% weight)</p>
                          <p className="text-xs text-slate-600 mt-1">
                            Historical filing reactions for this specific ticker are weighted 2x higher (40% vs 20%)
                            than generic market patterns for more personalized predictions.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-2">Why Asymmetric Impacts?</h4>
                      <p className="text-slate-600 text-xs">
                        Research consistently shows markets react more strongly to negative news than positive news.
                        For example, EPS misses cause -2.9% drops vs +1.3% gains for beats. Our model reflects this
                        behavioral finance reality.
                      </p>
                    </div>

                    <div className="border-t pt-4 bg-slate-50 p-3 rounded">
                      <h4 className="font-semibold mb-2 text-red-700">⚠️ Important Disclaimer</h4>
                      <p className="text-xs text-slate-600">
                        This model is for educational and research purposes only. <strong>Not financial advice.</strong>
                        Past performance does not guarantee future results. Markets are unpredictable and influenced by
                        countless factors beyond SEC filings. Always consult a qualified financial advisor before making
                        investment decisions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Accuracy Comparison */}
              {data.accuracy && (
                <div className="mt-4">
                  {data.accuracy.hasData ? (
                    <div className="bg-white border-2 border-green-200 p-4 rounded-lg">
                      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                        ✅ Prediction vs Actual Results
                        <span
                          className={`text-sm px-2 py-1 rounded ${
                            data.accuracy.accuracy === 'Excellent'
                              ? 'bg-green-100 text-green-800'
                              : data.accuracy.accuracy === 'Good'
                              ? 'bg-blue-100 text-blue-800'
                              : data.accuracy.accuracy === 'Fair'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {data.accuracy.accuracy}
                        </span>
                      </h3>
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div>
                          <p className="text-xs text-slate-600">Predicted</p>
                          <p className="text-xl font-bold text-blue-600">
                            {data.accuracy.predicted7dReturn > 0 ? '+' : ''}
                            {data.accuracy.predicted7dReturn.toFixed(2)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600">Actual</p>
                          <p
                            className={`text-xl font-bold ${
                              (data.accuracy.actual7dReturn || 0) > 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {(data.accuracy.actual7dReturn || 0) > 0 ? '+' : ''}
                            {(data.accuracy.actual7dReturn || 0).toFixed(2)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600">Error</p>
                          <p className="text-xl font-bold text-slate-700">
                            {(data.accuracy.error || 0).toFixed(2)}%
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600">
                        {data.accuracy.daysElapsed} days after filing •{' '}
                        {data.accuracy.message}
                      </p>

                      {/* Simple Bar Chart Comparison */}
                      <div className="mt-4 bg-white p-4 rounded-lg border-2 border-purple-200">
                        <h4 className="text-sm font-semibold mb-3">📊 Prediction vs Reality</h4>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart
                            data={[
                              {
                                name: 'Predicted',
                                value: data.accuracy.predicted7dReturn,
                                fill: '#3b82f6'
                              },
                              {
                                name: 'Actual',
                                value: data.accuracy.actual7dReturn || 0,
                                fill: (data.accuracy.actual7dReturn || 0) > 0 ? '#22c55e' : '#ef4444'
                              }
                            ]}
                            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis
                              domain={[0, 'auto']}
                              label={{ value: 'Return (%)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                              tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                              formatter={(value: number) => `${value.toFixed(2)}%`}
                              contentStyle={{ fontSize: 12 }}
                            />
                            <Bar dataKey="value">
                              {[
                                { name: 'Predicted', value: data.accuracy.predicted7dReturn, fill: '#3b82f6' },
                                { name: 'Actual', value: data.accuracy.actual7dReturn || 0, fill: (data.accuracy.actual7dReturn || 0) > 0 ? '#22c55e' : '#ef4444' }
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Performance Graph */}
                      <div className="mt-4 bg-slate-50 p-4 rounded-lg">
                        <h4 className="text-sm font-semibold mb-3">📈 Performance Over Time</h4>
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart
                            data={[
                              { day: 0, predicted: 0, actual: 0 },
                              {
                                day: 7,
                                predicted: data.accuracy.predicted7dReturn,
                                actual: data.accuracy.actual7dReturn || 0
                              }
                            ]}
                            margin={{ top: 5, right: 20, left: 0, bottom: 30 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                              dataKey="day"
                              label={{ value: 'Days Since Filing', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
                              tick={{ fontSize: 12 }}
                            />
                            <YAxis
                              label={{ value: 'Return (%)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                              tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                              formatter={(value: number) => `${value.toFixed(2)}%`}
                              contentStyle={{ fontSize: 12 }}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: 12, paddingTop: '10px' }}
                              verticalAlign="top"
                            />
                            <Line
                              type="monotone"
                              dataKey="predicted"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              name="Predicted Return"
                              dot={{ r: 4 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="actual"
                              stroke={data.accuracy.actual7dReturn && data.accuracy.actual7dReturn > 0 ? '#22c55e' : '#ef4444'}
                              strokeWidth={2}
                              name="Actual Return"
                              dot={{ r: 4 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded">
                      <p className="text-sm text-slate-600">
                        ⏳ {data.accuracy?.message || 'Waiting for sufficient time to pass'} to compare prediction with actual stock movement
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stock Price Performance Chart */}
        {stockPrices && stockPrices.prices && stockPrices.prices.length > 0 && (
          <Card className="mb-6 border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
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
        {data.analysis?.financialMetrics && (
          <Card className="mb-6 border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
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
                <CardTitle>📋 Executive Summary</CardTitle>
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
            <Card>
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
            <Card>
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
                    <div className="flex justify-between text-xs mb-1 text-slate-600">
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
                  <div className="bg-slate-50 p-3 rounded">
                    <p className="text-sm text-slate-700">{data.analysis.concernAssessment.reasoning}</p>
                  </div>

                  {/* Concern Factors */}
                  {data.analysis.concernAssessment.concernFactors.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-2 text-red-700">⚠️ Warning Signs:</p>
                      <ul className="space-y-1">
                        {data.analysis.concernAssessment.concernFactors.map((factor, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-red-600 font-bold">•</span>
                            <span className="text-sm text-slate-700">{factor}</span>
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
                            <span className="text-sm text-slate-700">{factor}</span>
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
          {data.analysis?.analyst && (
            <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50">
              <CardHeader>
                <CardTitle>📊 Analyst Activity & Sentiment (30 Days Before Filing)</CardTitle>
                <CardDescription>
                  Most important feature in ML prediction model • Street momentum signals
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

                  {/* ML Model Note */}
                  <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                    <p className="text-sm text-purple-900">
                      <strong>📈 ML Model Impact:</strong> Net analyst upgrades in the 30 days before filing is the <strong>most important feature</strong> in our RandomForest ML prediction model (80% directional accuracy). Upgrades signal positive street momentum and often predict short-term price gains.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Changes */}
          {data.analysis && (
            <Card>
              <CardHeader>
                <CardTitle>🔍 Top Changes</CardTitle>
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
    </div>
  );
}
