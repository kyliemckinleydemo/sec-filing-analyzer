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
  status: 'ok' | 'insufficient-data' | 'skipped-no-financials' | 'error';
  predicted30dAlpha?: number;
  confidence?: number;
}

/**
 * A 30-day ALPHA prediction is only meaningful for filings with real financial signal — the model
 * runs on EPS surprise + fundamentals. On a procedural filing it has nothing to work with and emits
 * noise (the ±0.1% "low-conviction" signals). So we only predict for 10-K/10-Q (always financial
 * reports) or an 8-K that carries an EPS surprise (an earnings 8-K). Risk/concern analysis still runs
 * on everything; this only gates the prediction step.
 */
function isFinanciallySubstantive(filingType: string, epsSurprise?: number | null): boolean {
  return filingType === '10-K' || filingType === '10-Q' || epsSurprise != null;
}

/** Numeric EPS surprise (%) from the analysis's structured metrics, if the filing had earnings. */
function epsSurpriseFromAnalysis(analysis: { financialMetrics?: { structuredData?: any } }): number | null {
  const sd = analysis.financialMetrics?.structuredData;
  if (!sd || sd.epsSurprise == null) return null;
  if (sd.epsSurprise === 'inline') return 0;
  const mag = typeof sd.epsSurpriseMagnitude === 'number' ? Math.abs(sd.epsSurpriseMagnitude) : 1;
  return sd.epsSurprise === 'miss' ? -mag : mag; // 'beat' => positive
}

// 8-K item codes that carry material events worth full analysis (agreements, bankruptcy, M&A,
// earnings, obligations/impairments, delisting, unregistered sales, auditor/restatement, control
// & exec/board changes, and the catch-all "other material event" 8.01).
const MATERIAL_8K_ITEMS = new Set([
  '1.01', '1.02', '1.03', '2.01', '2.02', '2.03', '2.04', '2.05', '2.06',
  '3.01', '3.02', '3.03', '4.01', '4.02', '5.01', '5.02', '5.03', '5.08', '8.01',
]);

/**
 * A genuinely procedural 8-K worth skipping: it contains item headers, NONE of them material, and
 * it's limited to routine annual-meeting vote results (Item 5.07) plus optional exhibits (9.01).
 * Conservative on purpose — if we can't classify the items, or any material item is present, we
 * analyze it. This targets the clearest noise (proxy/vote-result 8-Ks) with ~zero false skips.
 */
function isProceduralEightK(text: string): boolean {
  const items = new Set<string>();
  for (const m of text.matchAll(/Item\s+(\d\.\d{2})/gi)) items.add(m[1]);
  if (items.size === 0) return false;
  for (const it of items) if (MATERIAL_8K_ITEMS.has(it)) return false;
  return items.has('5.07') && [...items].every((it) => it === '5.07' || it === '9.01');
}

/**
 * Generate and persist a 30-day alpha prediction for a filing from stored features.
 * Idempotent-friendly: callers decide whether to skip filings that already have one.
 */
export async function generateAndPersistPrediction(filing: {
  id: string;
  filingType: string;
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
  // Skip prediction for filings with no financial signal (procedural 8-Ks) — see helper above.
  if (!isFinanciallySubstantive(filing.filingType, filing.epsSurprise)) {
    return { status: 'skipped-no-financials' };
  }

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

    // Skip the full 6-call analysis for genuinely procedural 8-Ks (e.g. Item 5.07 vote results) —
    // no financials, no material event. Mark processed with an honest low concern to save spend.
    if (filing.filingType === '8-K' && isProceduralEightK(text)) {
      await prisma.filing.update({
        where: { id: filing.id },
        data: {
          analysisData: JSON.stringify({ procedural: true }),
          riskScore: 1,
          sentimentScore: 0,
          concernLevel: 1,
          aiSummary:
            'Procedural 8-K (routine disclosure such as annual-meeting vote results). No detailed AI analysis was performed.',
        },
      });
      return { status: 'ok', concernLevel: 1, predictionStatus: 'skipped-no-financials' };
    }

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

    // Generate the prediction (gated to financially-substantive filings inside the helper). Feed the
    // EPS surprise the analysis found instead of dropping it (this path used to hardcode null).
    const epsSurprise = epsSurpriseFromAnalysis(analysis);
    let predictionStatus: PredictionResult['status'] = 'error';
    try {
      const pred = await generateAndPersistPrediction({
        id: filing.id,
        filingType: filing.filingType,
        filingDate: filing.filingDate,
        companyId: filing.companyId,
        concernLevel: analysis.concernAssessment.concernLevel,
        sentimentScore: analysis.sentiment.sentimentScore,
        epsSurprise,
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
