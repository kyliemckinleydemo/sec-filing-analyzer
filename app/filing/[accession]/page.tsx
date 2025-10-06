'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface FilingAnalysisData {
  filing: {
    accessionNumber: string;
    filingType: string;
    filingDate: string;
    company: {
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
    summary: string;
    filingContentSummary?: string;
    financialMetrics?: {
      revenueGrowth?: string;
      marginTrend?: string;
      guidanceDirection?: 'raised' | 'lowered' | 'maintained' | 'not_provided';
      guidanceDetails?: string;
      keyMetrics?: string[];
      surprises?: string[];
    };
  };
  prediction?: {
    predicted7dReturn: number;
    confidence: number;
    reasoning?: string;
    actual7dReturn?: number;
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
  const params = useParams();
  const router = useRouter();
  const accession = params.accession as string;

  const [data, setData] = useState<FilingAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<AnalysisStep>('fetching-filing');
  const [error, setError] = useState<string | null>(null);

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

        // Fetch analysis
        const analysisRes = await fetch(`/api/analyze/${accession}`);
        const analysisData = await analysisRes.json();

        clearTimeout(updateSteps);
        clearTimeout(updateSteps2);
        clearTimeout(updateSteps3);
        setCurrentStep('generating-prediction');

        // Fetch prediction
        const predictionRes = await fetch(`/api/predict/${accession}`);
        const predictionData = await predictionRes.json();

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

  if (loading) {
    const stepDetails = getStepDetails(currentStep);

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-2xl mx-4">
          <CardHeader>
            <div className="text-center space-y-4">
              <div className="text-6xl animate-bounce">{stepDetails.emoji}</div>
              <CardTitle className="text-3xl">{stepDetails.title}</CardTitle>
              <CardDescription className="text-lg">{stepDetails.description}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {/* Progress bar */}
            <div className="space-y-4">
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${stepDetails.progress}%` }}
                />
              </div>
              <div className="text-center text-sm text-slate-600">
                {stepDetails.progress}% Complete
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
            onClick={() => router.push(`/company/${data.filing.company.ticker}`)}
            className="mb-4"
          >
            ← Back to {data.filing.company.ticker}
          </Button>
          <h1 className="text-4xl font-bold">{data.filing.company.name}</h1>
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

        {/* Prediction Card */}
        {data.prediction && (
          <Card className="mb-6 border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50">
            <CardHeader>
              <CardTitle className="text-2xl">📈 7-Day Price Prediction</CardTitle>
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
                <p className="mt-4 text-sm text-slate-700 bg-white p-3 rounded">
                  <strong>Reasoning:</strong> {data.prediction.reasoning}
                </p>
              )}

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

                      {/* Performance Graph */}
                      <div className="mt-4 bg-slate-50 p-4 rounded-lg">
                        <h4 className="text-sm font-semibold mb-3">📊 Predicted vs Actual Performance</h4>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart
                            data={[
                              { day: 0, predicted: 0, actual: 0 },
                              {
                                day: 7,
                                predicted: data.accuracy.predicted7dReturn,
                                actual: data.accuracy.actual7dReturn || 0
                              }
                            ]}
                            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                              dataKey="day"
                              label={{ value: 'Days Since Filing', position: 'insideBottom', offset: -5, style: { fontSize: 12 } }}
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
                              wrapperStyle={{ fontSize: 12 }}
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
              </CardContent>
            </Card>
          )}

          {/* Sentiment Analysis */}
          {data.analysis && (
            <Card>
              <CardHeader>
                <CardTitle>💭 Sentiment Analysis</CardTitle>
                <CardDescription>
                  Tone: {data.analysis.sentiment.tone} | Score:{' '}
                  {data.analysis.sentiment.sentimentScore.toFixed(2)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Negative</span>
                      <span>Neutral</span>
                      <span>Positive</span>
                    </div>
                    <div className="h-4 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded relative">
                      <div
                        className="absolute w-2 h-6 bg-black rounded -top-1"
                        style={{
                          left: `${((data.analysis.sentiment.sentimentScore + 1) / 2) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-2">Key Phrases:</p>
                    <div className="flex flex-wrap gap-2">
                      {data.analysis.sentiment.keyPhrases.map((phrase, i) => (
                        <span
                          key={i}
                          className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded"
                        >
                          {phrase}
                        </span>
                      ))}
                    </div>
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
