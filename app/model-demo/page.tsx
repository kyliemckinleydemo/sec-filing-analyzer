/**
 * @module app/model-demo/page
 * @description Interactive alpha model v2 demonstration page. Left panel: feature sliders
 * with preset scenarios — prediction calls /api/model-demo (POST) on each change so the
 * large model file stays server-side. Right panel: feature contribution chart. Bottom: live
 * predictions from the database with confidence/signal/actual filters (defaults to high-conf).
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell, ResponsiveContainer,
  type TooltipContentProps,
} from 'recharts';
import type { AlphaFeatures, AlphaPrediction } from '@/lib/alpha-model';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

// ─── Feature configuration ──────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  priceToLow: 'Price / 52W Low',
  priceToHigh: 'Price / 52W High',
  majorDowngrades: 'Major Downgrades',
  analystUpsidePotential: 'Analyst Upside %',
  concernLevel: 'AI Concern (0-10)',
  marketCap: 'Market Cap',
  sentimentScore: 'AI Sentiment',
  upgradesLast30d: 'Upgrades (30d)',
  filingTypeFactor: 'Filing Type',
  toneChangeDelta: 'Tone Change',
  epsSurprise: 'EPS Surprise %',
  spxTrend30d: 'SPX 30d Trend %',
  vixLevel: 'VIX Level',
};

const CATEGORIES = [
  { label: 'Price Momentum',   keys: ['priceToLow', 'priceToHigh'] },
  { label: 'Analyst Activity', keys: ['majorDowngrades', 'analystUpsidePotential', 'upgradesLast30d'] },
  { label: 'AI Signals',       keys: ['concernLevel', 'sentimentScore', 'toneChangeDelta'] },
  { label: 'EPS & Filing',     keys: ['epsSurprise', 'filingTypeFactor'] },
  { label: 'Macro Regime',     keys: ['spxTrend30d', 'vixLevel'] },
];

type SliderCfg = { min: number; max: number; step: number; fmt: (v: number) => string };
const SLIDER: Record<string, SliderCfg> = {
  priceToLow:             { min: 0.8,  max: 3.5,  step: 0.01, fmt: v => v.toFixed(2) },
  priceToHigh:            { min: 0.3,  max: 1.0,  step: 0.01, fmt: v => v.toFixed(2) },
  majorDowngrades:        { min: 0,    max: 8,    step: 1,    fmt: v => v.toString() },
  analystUpsidePotential: { min: -30,  max: 120,  step: 1,    fmt: v => `${v}%` },
  concernLevel:           { min: 1,    max: 10,   step: 0.5,  fmt: v => v.toFixed(1) },
  sentimentScore:         { min: -1,   max: 1,    step: 0.05, fmt: v => v.toFixed(2) },
  upgradesLast30d:        { min: 0,    max: 10,   step: 1,    fmt: v => v.toString() },
  toneChangeDelta:        { min: -0.8, max: 0.8,  step: 0.05, fmt: v => v.toFixed(2) },
  epsSurprise:            { min: -50,  max: 50,   step: 1,    fmt: v => `${v}%` },
  spxTrend30d:            { min: -12,  max: 12,   step: 0.5,  fmt: v => `${v}%` },
  vixLevel:               { min: 10,   max: 50,   step: 0.5,  fmt: v => v.toFixed(1) },
  filingTypeFactor:       { min: 0,    max: 2,    step: 1,    fmt: v => ['10-K', '10-Q', '8-K'][v] ?? '' },
};

const CAP_VALUES = [1e9, 5e9, 50e9, 500e9]; // small/mid/large/mega

const PRESETS: Record<string, { label: string; cls: string; features: AlphaFeatures }> = {
  mean: {
    label: 'Mean',
    cls: 'border-white/30 text-gray-300',
    features: {
      priceToLow: 1.3638, majorDowngrades: 0.04, analystUpsidePotential: 29.57,
      priceToHigh: 0.8381, concernLevel: 5.33, marketCap: 98_179_000_000,
      sentimentScore: 0.11, upgradesLast30d: 0.11, filingTypeFactor: 1,
      toneChangeDelta: -0.01, epsSurprise: 3.89, spxTrend30d: 1.83, vixLevel: 18.15,
    },
  },
  bullish: {
    label: 'Bullish',
    cls: 'bg-green-600/80 hover:bg-green-600 border-transparent text-white',
    features: {
      priceToLow: 1.0, majorDowngrades: 0, analystUpsidePotential: 80,
      priceToHigh: 0.70, concernLevel: 8, marketCap: 100_000_000_000,
      sentimentScore: 0.8, upgradesLast30d: 0, filingTypeFactor: 1,
      toneChangeDelta: 0.2, epsSurprise: 25, spxTrend30d: 4.0, vixLevel: 25,
    },
  },
  bearish: {
    label: 'Bearish',
    cls: 'bg-red-600/80 hover:bg-red-600 border-transparent text-white',
    features: {
      priceToLow: 2.5, majorDowngrades: 0, analystUpsidePotential: 5,
      priceToHigh: 0.98, concernLevel: 2, marketCap: 50_000_000,
      sentimentScore: -0.5, upgradesLast30d: 0, filingTypeFactor: 1,
      toneChangeDelta: -0.2, epsSurprise: -40, spxTrend30d: -4.0, vixLevel: 14,
    },
  },
};

function capTierOf(cap: number) {
  if (cap < 2e9) return 0;
  if (cap < 10e9) return 1;
  if (cap < 200e9) return 2;
  return 3;
}

const SECTORS = ['', 'Technology', 'Healthcare', 'Financials', 'Consumer Discretionary',
  'Consumer Staples', 'Industrials', 'Energy', 'Utilities', 'Materials',
  'Communication Services', 'Real Estate'];

// ─── Types ───────────────────────────────────────────────────────────────────

interface LivePrediction {
  accessionNumber: string;
  ticker: string;
  sector: string | null;
  filingType: string;
  filingDate: string;
  signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: 'high' | 'medium' | 'low';
  predictedAlpha: number;
  actualAlpha: number | null;
  correct: boolean | null;
}

interface Summary {
  total: number; withActual: number;
  dirAccuracy: number | null; avgPredicted: number | null; avgActual: number | null;
}

// ─── Custom bar-chart tooltip ────────────────────────────────────────────────

function ContributionTooltip({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const val = typeof payload[0].value === 'number' ? payload[0].value : 0;
  return (
    <div style={{
      background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: 6, padding: '6px 10px',
    }}>
      <p style={{ color: '#e5e7eb', fontSize: 12, marginBottom: 2 }}>{label}</p>
      <p style={{ color: val >= 0 ? '#4ade80' : '#f87171', fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>
        {val >= 0 ? '+' : ''}{val.toFixed(4)}
      </p>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ModelDemoPage() {
  const [features, setFeatures] = useState<AlphaFeatures>(PRESETS.mean.features);
  const [capTier, setCapTier] = useState(capTierOf(PRESETS.mean.features.marketCap));
  const [sector, setSector] = useState('');
  const [prediction, setPrediction] = useState<AlphaPrediction | null>(null);
  const [predLoading, setPredLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filterConf, setFilterConf] = useState('high');
  const [filterSignal, setFilterSignal] = useState('ALL');
  const [filterHasActual, setFilterHasActual] = useState(false);
  const [livePreds, setLivePreds] = useState<LivePrediction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingPreds, setLoadingPreds] = useState(true);

  // Call the API to compute prediction (debounced 120ms)
  const computePrediction = useCallback((f: AlphaFeatures, capIdx: number, sec: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPredLoading(true);
      const body = { features: { ...f, marketCap: CAP_VALUES[capIdx] }, sector: sec || undefined };
      fetch('/api/model-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(r => r.json())
        .then(d => setPrediction(d.prediction))
        .finally(() => setPredLoading(false));
    }, 120);
  }, []);

  useEffect(() => { computePrediction(features, capTier, sector); }, [features, capTier, sector, computePrediction]);

  // Fetch live predictions
  useEffect(() => {
    setLoadingPreds(true);
    const params = new URLSearchParams({ confidence: filterConf, signal: filterSignal, limit: '150' });
    if (filterHasActual) params.set('hasActual', 'true');
    fetch(`/api/model-demo?${params}`)
      .then(r => r.json())
      .then(d => { setLivePreds(d.predictions ?? []); setSummary(d.summary ?? null); })
      .finally(() => setLoadingPreds(false));
  }, [filterConf, filterSignal, filterHasActual]);

  function applyPreset(key: string) {
    const p = PRESETS[key];
    setFeatures(p.features);
    setCapTier(capTierOf(p.features.marketCap));
  }

  function setFeature(key: string, value: number) {
    setFeatures(prev => ({ ...prev, [key]: value }));
  }

  const sig = prediction?.signal ?? 'NEUTRAL';
  const signalColor = sig === 'LONG' ? 'text-green-400' : sig === 'SHORT' ? 'text-red-400' : 'text-gray-400';
  const signalBg   = sig === 'LONG' ? 'bg-green-400/10 border-green-400/30'
                   : sig === 'SHORT' ? 'bg-red-400/10 border-red-400/30' : 'bg-gray-400/10 border-gray-400/30';

  const chartData = prediction
    ? Object.entries(prediction.featureContributions)
        .map(([k, v]) => ({ name: FEATURE_LABELS[k] ?? k, value: v as number }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    : [];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <Button variant="outline" className="mb-4 border-white/45" asChild>
            <Link href="/">← Back to Home</Link>
          </Button>
          <h1 className="text-4xl font-bold text-white mb-2">Alpha Model v2 — Live Demo</h1>
          <p className="text-gray-400">
            Adjust the 13 features to see real-time predictions from the same Ridge regression +
            Mixture-of-Experts model running in production. Scores recompute server-side on each change.
          </p>
        </div>

        {/* ── Interactive sandbox ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Left: Feature inputs */}
          <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-white">Feature Inputs</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(PRESETS).map(([key, p]) => (
                    <button key={key} onClick={() => applyPreset(key)}
                      className={`px-3 py-1 text-xs rounded border transition-colors ${p.cls}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Sector */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">Sector (MoE routing)</label>
                <select value={sector} onChange={e => setSector(e.target.value)}
                  className="mt-1 w-full bg-white/5 border border-white/20 rounded px-2 py-1.5 text-sm text-white">
                  {SECTORS.map(s => (
                    <option key={s} value={s} className="bg-gray-900">{s || 'Global (no sector)'}</option>
                  ))}
                </select>
              </div>

              {/* Market cap tier */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">Market Cap</label>
                <select value={capTier} onChange={e => setCapTier(Number(e.target.value))}
                  className="mt-1 w-full bg-white/5 border border-white/20 rounded px-2 py-1.5 text-sm text-white">
                  <option value={0} className="bg-gray-900">Small (&lt;$2B)</option>
                  <option value={1} className="bg-gray-900">Mid ($2–10B)</option>
                  <option value={2} className="bg-gray-900">Large ($10–200B)</option>
                  <option value={3} className="bg-gray-900">Mega (&gt;$200B)</option>
                </select>
              </div>

              {/* Sliders by category */}
              {CATEGORIES.map(cat => (
                <div key={cat.label}>
                  <p className="text-xs font-semibold text-blue-400/80 uppercase tracking-widest mb-2">{cat.label}</p>
                  <div className="space-y-3">
                    {cat.keys.map(key => {
                      const cfg = SLIDER[key];
                      const val = (features as unknown as Record<string, number>)[key];
                      return (
                        <div key={key}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-300">{FEATURE_LABELS[key]}</span>
                            <span className="text-white font-mono text-xs">{cfg.fmt(val)}</span>
                          </div>
                          <input type="range" min={cfg.min} max={cfg.max} step={cfg.step} value={val}
                            onChange={e => setFeature(key, parseFloat(e.target.value))}
                            className="w-full accent-blue-500 h-1.5" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Right: Prediction output */}
          <div className="space-y-4">
            <Card className={`border ${signalBg} bg-[rgba(15,23,42,0.96)] transition-all`}>
              <CardContent className="pt-6">
                {prediction ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-gray-400 text-sm mb-1">Signal</p>
                        <div className="flex items-center gap-3">
                          <span className={`text-5xl font-bold ${signalColor} ${predLoading ? 'opacity-60' : ''}`}>
                            {prediction.signal}
                          </span>
                          <span className={`text-sm px-2 py-0.5 rounded border ${signalBg} ${signalColor} uppercase tracking-wide`}>
                            {prediction.confidence}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-400 text-sm">Expected 30d Alpha</p>
                        <p className={`text-3xl font-bold ${prediction.expectedAlpha >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {prediction.expectedAlpha >= 0 ? '+' : ''}{prediction.expectedAlpha.toFixed(2)}%
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          30d return: {prediction.predicted30dReturn >= 0 ? '+' : ''}{prediction.predicted30dReturn.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
                      <div>
                        <p className="text-gray-500 text-xs">Raw Score</p>
                        <p className="text-white font-mono text-sm">{prediction.rawScore.toFixed(4)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Percentile</p>
                        <p className="text-white text-sm">{prediction.percentile}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Expert Used</p>
                        <p className="text-blue-300 text-xs font-mono truncate">{prediction.expertUsed}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500 py-8 text-sm">Computing…</div>
                )}
              </CardContent>
            </Card>

            {/* Feature contribution chart */}
            <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
              <CardHeader>
                <CardTitle className="text-white text-base">Feature Contributions</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={290}>
                      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 32 }}>
                        <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }}
                          tickFormatter={v => v.toFixed(3)} />
                        <YAxis type="category" dataKey="name" width={135}
                          tick={{ fill: '#d1d5db', fontSize: 11 }} />
                        <Tooltip content={ContributionTooltip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                        <ReferenceLine x={0} stroke="rgba(255,255,255,0.25)" />
                        <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={entry.value >= 0 ? '#4ade80' : '#f87171'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-gray-600 text-xs mt-1 text-center">
                      Green = bullish · Red = bearish · Sorted by magnitude
                    </p>
                  </>
                ) : (
                  <div className="h-[290px] flex items-center justify-center text-gray-600 text-sm">
                    Waiting for prediction…
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Live Predictions Table ──────────────────────────────────────── */}
        <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-white text-xl">Live Prediction History</CardTitle>
                <p className="text-gray-400 text-sm mt-1">
                  Real predictions from production — compare model signals against actual 30d alpha
                </p>
              </div>

              <div className="flex flex-wrap gap-3 items-end">
                {/* Confidence */}
                <div>
                  <p className="text-gray-500 text-xs mb-1">Confidence</p>
                  <div className="flex rounded overflow-hidden border border-white/20">
                    {['high', 'medium', 'low', 'all'].map(c => (
                      <button key={c} onClick={() => setFilterConf(c)}
                        className={`px-3 py-1.5 text-xs capitalize border-r border-white/10 last:border-0 transition-colors ${
                          filterConf === c ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                        }`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Signal */}
                <div>
                  <p className="text-gray-500 text-xs mb-1">Signal</p>
                  <div className="flex rounded overflow-hidden border border-white/20">
                    {['ALL', 'LONG', 'SHORT', 'NEUTRAL'].map(s => (
                      <button key={s} onClick={() => setFilterSignal(s)}
                        className={`px-3 py-1.5 text-xs border-r border-white/10 last:border-0 transition-colors ${
                          filterSignal === s ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                        }`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Has actual */}
                <div>
                  <p className="text-gray-500 text-xs mb-1">Outcomes</p>
                  <button onClick={() => setFilterHasActual(p => !p)}
                    className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                      filterHasActual ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/20 text-gray-400 hover:bg-white/10'
                    }`}>
                    {filterHasActual ? '✓ ' : ''}Has Actual
                  </button>
                </div>
              </div>
            </div>

            {/* Summary */}
            {summary && !loadingPreds && (
              <div className="flex flex-wrap gap-6 mt-4 pt-4 border-t border-white/10">
                <Stat label="Predictions" value={summary.total.toLocaleString()} />
                <Stat label="With Actual" value={summary.withActual.toLocaleString()} />
                {summary.dirAccuracy !== null && (
                  <Stat label="Direction Accuracy" value={`${summary.dirAccuracy.toFixed(1)}%`}
                    color={summary.dirAccuracy >= 60 ? 'text-green-400' : summary.dirAccuracy >= 50 ? 'text-yellow-400' : 'text-red-400'} />
                )}
                {summary.avgPredicted !== null && (
                  <Stat label="Avg Predicted α"
                    value={`${summary.avgPredicted >= 0 ? '+' : ''}${summary.avgPredicted.toFixed(2)}%`}
                    color={summary.avgPredicted >= 0 ? 'text-green-400' : 'text-red-400'} />
                )}
                {summary.avgActual !== null && (
                  <Stat label="Avg Actual α"
                    value={`${summary.avgActual >= 0 ? '+' : ''}${summary.avgActual.toFixed(2)}%`}
                    color={summary.avgActual >= 0 ? 'text-green-400' : 'text-red-400'} />
                )}
              </div>
            )}
          </CardHeader>

          <CardContent>
            {loadingPreds ? (
              <div className="text-center text-gray-500 py-10">Loading predictions…</div>
            ) : livePreds.length === 0 ? (
              <div className="text-center text-gray-500 py-10">No predictions match filters</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500 text-xs uppercase tracking-wide">
                      <th className="text-left py-2 pr-4">Ticker</th>
                      <th className="text-left py-2 pr-4">Type</th>
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-left py-2 pr-4">Signal</th>
                      <th className="text-left py-2 pr-4">Conf</th>
                      <th className="text-right py-2 pr-4">Predicted α</th>
                      <th className="text-right py-2 pr-4">Actual α</th>
                      <th className="text-center py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {livePreds.map((p, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                        <td className="py-2 pr-4">
                          <Link href={`/filing/${p.accessionNumber}`}
                            className="font-semibold text-blue-300 hover:text-blue-200">{p.ticker}</Link>
                        </td>
                        <td className="py-2 pr-4 text-gray-400 text-xs">{p.filingType}</td>
                        <td className="py-2 pr-4 text-gray-400 text-xs">
                          {new Date(p.filingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`font-semibold text-xs ${
                            p.signal === 'LONG' ? 'text-green-400' : p.signal === 'SHORT' ? 'text-red-400' : 'text-gray-400'
                          }`}>{p.signal}</span>
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            p.confidence === 'high' ? 'bg-blue-500/20 text-blue-300' :
                            p.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>{p.confidence}</span>
                        </td>
                        <td className={`py-2 pr-4 text-right font-mono text-xs ${p.predictedAlpha >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {p.predictedAlpha >= 0 ? '+' : ''}{p.predictedAlpha.toFixed(1)}%
                        </td>
                        <td className={`py-2 pr-4 text-right font-mono text-xs ${
                          p.actualAlpha === null ? 'text-gray-700' : p.actualAlpha >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {p.actualAlpha === null ? '—' : `${p.actualAlpha >= 0 ? '+' : ''}${p.actualAlpha.toFixed(1)}%`}
                        </td>
                        <td className="py-2 text-center text-sm">
                          {p.correct === null
                            ? <span className="text-gray-700">·</span>
                            : p.correct
                              ? <span className="text-green-400">✓</span>
                              : <span className="text-red-400">✗</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'text-white' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className={`font-semibold ${color}`}>{value}</p>
    </div>
  );
}
