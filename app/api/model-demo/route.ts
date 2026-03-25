/**
 * @module app/api/model-demo/route
 * @description Returns recent alpha model predictions with actual outcomes for the model demo page,
 * supporting filtering by confidence level, signal direction, and presence of actual results.
 *
 * EXPORTS:
 * - GET (function) - Returns paginated predictions with signal, confidence, predicted/actual alpha,
 *   and per-row directional accuracy. Defaults to high-confidence predictions only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { predictAlpha } from '@/lib/alpha-model';
import type { AlphaFeatures } from '@/lib/alpha-model';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const confidence = searchParams.get('confidence') || 'high'; // default: high-confidence only
  const signal = searchParams.get('signal');        // 'LONG'|'SHORT'|'NEUTRAL'|null
  const hasActual = searchParams.get('hasActual');  // 'true'|'false'|null (null = all)
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

  const where: Record<string, unknown> = {
    predicted30dAlpha: { not: null },
    predictionConfidence: { not: null },
  };

  if (hasActual === 'true') {
    where.actual30dAlpha = { not: null };
  }

  const confidenceFilters: Record<string, Record<string, number>> = {
    high:   { gte: 0.80 },
    medium: { gte: 0.60, lt: 0.80 },
    low:    { lt: 0.60 },
  };
  if (confidence && confidenceFilters[confidence]) {
    where.predictionConfidence = confidenceFilters[confidence];
  }

  const filings = await prisma.filing.findMany({
    where: where as any,
    select: {
      accessionNumber: true,
      filingType: true,
      filingDate: true,
      predicted30dAlpha: true,
      predictionConfidence: true,
      actual30dAlpha: true,
      company: { select: { ticker: true, sector: true } },
    },
    orderBy: { filingDate: 'desc' },
    take: limit,
  });

  const predictions = filings
    .map(f => {
      const alpha = f.predicted30dAlpha as number;
      const conf = f.predictionConfidence || 0.5;
      const sig: 'LONG' | 'SHORT' | 'NEUTRAL' = alpha > 0 ? 'LONG' : alpha < 0 ? 'SHORT' : 'NEUTRAL';
      const confLabel = conf >= 0.80 ? 'high' : conf >= 0.60 ? 'medium' : 'low';
      const actual = f.actual30dAlpha as number | null;
      const correct: boolean | null =
        actual !== null ? Math.sign(alpha) === Math.sign(actual) : null;

      return {
        accessionNumber: f.accessionNumber,
        ticker: f.company.ticker,
        sector: f.company.sector,
        filingType: f.filingType,
        filingDate: f.filingDate,
        signal: sig,
        confidence: confLabel,
        confidenceNum: conf,
        predictedAlpha: Math.round(alpha * 100) / 100,
        actualAlpha: actual !== null ? Math.round((actual as number) * 100) / 100 : null,
        correct,
      };
    })
    .filter(p => !signal || signal === 'ALL' || p.signal === signal);

  // Summary stats for filtered set
  const withActual = predictions.filter(p => p.correct !== null);
  const correctCount = withActual.filter(p => p.correct).length;
  const dirAccuracy = withActual.length > 0
    ? Math.round((correctCount / withActual.length) * 1000) / 10
    : null;
  const avgPredicted = predictions.length > 0
    ? Math.round(predictions.reduce((s, p) => s + p.predictedAlpha, 0) / predictions.length * 100) / 100
    : null;
  const avgActual = withActual.length > 0
    ? Math.round(withActual.reduce((s, p) => s + (p.actualAlpha ?? 0), 0) / withActual.length * 100) / 100
    : null;

  return NextResponse.json({
    predictions,
    summary: {
      total: predictions.length,
      withActual: withActual.length,
      dirAccuracy,
      avgPredicted,
      avgActual,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const features = body.features as AlphaFeatures;
  const sector = body.sector as string | undefined;
  const prediction = predictAlpha(features, sector || undefined);
  return NextResponse.json({ prediction });
}
