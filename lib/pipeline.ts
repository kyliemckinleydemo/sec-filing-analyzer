/**
 * @module lib/pipeline
 * @description Single source of truth for the data-population pipeline: fetching SEC
 * filing text, running Claude analysis, and generating 30-day alpha predictions — all
 * from data already in the database (no external calls for prediction). Used by the
 * automated crons (analyze-filings, backfill-predictions) and by batch scripts, so the
 * exact same logic runs everywhere.
 *
 * Analysis costs Anthropic API tokens (Haiku tier for bulk). Prediction generation is
 * free (pure compute over stored features).
 */
import { prisma } from '@/lib/prisma';
import { claudeClient } from '@/lib/claude-client';
import { predictAlpha, extractAlphaFeatures } from '@/lib/alpha-model';

export const MAJOR_FIRMS = [
  'Goldman Sachs', 'Morgan Stanley', 'JP Morgan', 'Bank of America',
  'Citi', 'Wells Fargo', 'Barclays', 'UBS',
];

/** Fetch raw SEC filing HTML/text with a compliant User-Agent and a hard timeout. */
export async function fetchFilingText(filingUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(filingUrl, {
      headers: { 'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Nearest macro-regime row (SPX 30d return, VIX) to a filing date, within ±7 days. */
async function macroForDate(
  filingDate: Date
): Promise<{ spxReturn30d: number | null; vixClose: number | null } | null> {
  try {
    const from = new Date(filingDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(filingDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const rows: any[] = await (prisma as any).macroIndicators.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true, spxReturn30d: true, vixClose: true },
      orderBy: { date: 'asc' },
    });
    if (rows.length === 0) return null;
    const t = filingDate.getTime();
    return rows.reduce((best, m) =>
      Math.abs(m.date.getTime() - t) < Math.abs(best.date.getTime() - t) ? m : best
    );
  } catch {
    return null;
  }
}

/** Analyst upgrade / major-downgrade counts in the 30 days before a filing. */
async function analystCounts(companyId: string, filingDate: Date) {
  try {
    const thirtyDaysAgo = new Date(filingDate);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const acts = await prisma.analystActivity.findMany({
      where: { companyId, activityDate: { gte: thirtyDaysAgo, lt: filingDate } },
      select: { actionType: true, firm: true },
    });
    return {
      upgradesLast30d: acts.filter((a) => a.actionType === 'upgrade').length,
      majorDowngradesLast30d: acts.filter(
        (a) => a.actionType === 'downgrade' && MAJOR_FIRMS.some((f) => a.firm.includes(f))
      ).length,
    };
  } catch {
    return { upgradesLast30d: 0, majorDowngradesLast30d: 0 };
  }
}

export interface PredictionResult {
  status: 'ok' | 'insufficient-data' | 'error';
  predicted30dAlpha?: number;
  confidence?: number;
}

/**
 * Generate and persist a 30-day alpha prediction for a filing from stored features.
 * Idempotent-friendly: callers decide whether to skip filings that already have one.
 */
export async function generateAndPersistPrediction(filing: {
  id: string;
  filingDate: Date;
  companyId: string;
  concernLevel: number | null;
  sentimentScore: number | null;
  epsSurprise?: number | null;
  company: {
    currentPrice: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    marketCap: number | null;
    analystTargetPrice: number | null;
    sector: string | null;
  };
}): Promise<PredictionResult> {
  const c = filing.company;
  const hasMinimumData =
    !!c.currentPrice && c.currentPrice > 0 && (!!c.fiftyTwoWeekLow || filing.concernLevel != null);
  if (!hasMinimumData) return { status: 'insufficient-data' };

  try {
    const [macro, analyst] = await Promise.all([
      macroForDate(filing.filingDate),
      analystCounts(filing.companyId, filing.filingDate),
    ]);

    const features = extractAlphaFeatures(
      {
        currentPrice: c.currentPrice || 0,
        fiftyTwoWeekHigh: c.fiftyTwoWeekHigh || 0,
        fiftyTwoWeekLow: c.fiftyTwoWeekLow || 0,
        marketCap: c.marketCap || 0,
        analystTargetPrice: c.analystTargetPrice,
      },
      {
        concernLevel: filing.concernLevel,
        sentimentScore: filing.sentimentScore,
        epsSurprise: filing.epsSurprise ?? null,
        spxTrend30d: macro?.spxReturn30d ?? null,
        vixLevel: macro?.vixClose ?? null,
      },
      analyst
    );

    const p = predictAlpha(features, c.sector);
    const confidenceNumeric = p.confidence === 'high' ? 0.85 : p.confidence === 'medium' ? 0.65 : 0.5;

    await prisma.filing.update({
      where: { id: filing.id },
      data: {
        predicted30dReturn: p.predicted30dReturn,
        predicted30dAlpha: p.expectedAlpha,
        predictionConfidence: confidenceNumeric,
        predicted7dReturn: p.predicted30dReturn * (7 / 30),
      },
    });

    await prisma.prediction.create({
      data: {
        filingId: filing.id,
        predictedReturn: p.predicted30dReturn,
        confidence: confidenceNumeric,
        features: JSON.stringify(p.featureContributions),
        modelVersion: 'alpha-v1.0',
      },
    });

    return { status: 'ok', predicted30dAlpha: p.expectedAlpha, confidence: confidenceNumeric };
  } catch {
    return { status: 'error' };
  }
}

export interface AnalyzeResult {
  status: 'ok' | 'no-url' | 'fetch-failed' | 'error';
  concernLevel?: number;
  predictionStatus?: PredictionResult['status'];
  error?: string;
}

/**
 * Fetch a filing's text, run full Claude analysis (Haiku bulk tier), persist the
 * analysis fields, then generate a prediction. Per-filing failures are returned as a
 * status rather than thrown, so batch callers can continue past one bad filing.
 */
export async function analyzeAndPersistFiling(filing: {
  id: string;
  filingUrl: string | null;
  filingType: string;
  filingDate: Date;
  companyId: string;
  company: {
    name: string;
    currentPrice: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    marketCap: number | null;
    analystTargetPrice: number | null;
    sector: string | null;
  };
}): Promise<AnalyzeResult> {
  if (!filing.filingUrl) return { status: 'no-url' };

  try {
    const text = await fetchFilingText(filing.filingUrl);
    if (!text) return { status: 'fetch-failed' };

    const sample = text.slice(0, 50000);
    const analysis = await claudeClient.analyzeFullFiling(
      sample,
      sample,
      undefined,
      filing.filingType,
      filing.company.name,
      undefined,
      'bulk'
    );

    await prisma.filing.update({
      where: { id: filing.id },
      data: {
        analysisData: JSON.stringify(analysis),
        riskScore: analysis.risks.riskScore,
        sentimentScore: analysis.sentiment.sentimentScore,
        concernLevel: analysis.concernAssessment.concernLevel,
        aiSummary: analysis.summary,
      },
    });

    // Generate the prediction now that the filing has analysis features.
    let predictionStatus: PredictionResult['status'] = 'error';
    try {
      const pred = await generateAndPersistPrediction({
        id: filing.id,
        filingDate: filing.filingDate,
        companyId: filing.companyId,
        concernLevel: analysis.concernAssessment.concernLevel,
        sentimentScore: analysis.sentiment.sentimentScore,
        epsSurprise: null,
        company: filing.company,
      });
      predictionStatus = pred.status;
    } catch {
      predictionStatus = 'error';
    }

    return {
      status: 'ok',
      concernLevel: analysis.concernAssessment.concernLevel,
      predictionStatus,
    };
  } catch (e: any) {
    return { status: 'error', error: e?.message || String(e) };
  }
}
