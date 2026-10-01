/**
 * @module app/api/cron/generate-news/route
 * @description Daily generator for the /news section. Selects the day's MOST SIGNIFICANT
 * recently-analyzed filings (hard cap), writes an original, grounded, AI-authored article
 * for each via Claude, and persists it as a NewsArticle. Penalty-safe by construction:
 * significance-gated + hard daily cap (never one-per-filing), idempotent (filingAccession
 * is unique), and each article adds unique analysis rather than restating the filing.
 *
 * Auth: Bearer CRON_SECRET. Cost-guarded: at most MAX_PER_RUN Claude calls per run.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { claudeClient } from '@/lib/claude-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Penalty-safe caps / gates.
const MAX_PER_RUN = 4; // hard daily cap — never a per-filing firehose
const LOOKBACK_DAYS = 2; // only very recent filings
const MIN_CONCERN = 4; // significance gate — skip low-signal routine filings
const CANDIDATE_POOL = 12;

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

function slugify(ticker: string, filingType: string, date: Date, accession: string): string {
  const d = date.toISOString().slice(0, 10);
  const type = filingType.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const suffix = accession.replace(/[^0-9]/g, '').slice(-4);
  return `${ticker.toLowerCase()}-${type}-${d}-${suffix}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const generated: Array<{ slug: string; ticker: string }> = [];
  const errors: Array<{ accession: string; error: string }> = [];

  try {
    // Candidate pool: recent, analyzed, significant — ranked by concern (desc), newest first.
    const candidates = await prisma.filing.findMany({
      where: {
        filingDate: { gte: since },
        aiSummary: { not: null },
        concernLevel: { gte: MIN_CONCERN },
      },
      orderBy: [{ concernLevel: 'desc' }, { filingDate: 'desc' }],
      take: CANDIDATE_POOL,
      select: {
        accessionNumber: true,
        filingType: true,
        filingDate: true,
        aiSummary: true,
        analysisData: true,
        concernLevel: true,
        predicted30dAlpha: true,
        predictionConfidence: true,
        company: { select: { ticker: true, name: true, sector: true } },
      },
    });

    // Skip any filing we've already written about (idempotent).
    const accessions = candidates.map((c) => c.accessionNumber);
    const existing = await prisma.newsArticle.findMany({
      where: { filingAccession: { in: accessions } },
      select: { filingAccession: true },
    });
    const done = new Set(existing.map((e) => e.filingAccession));

    const toWrite = candidates.filter((c) => c.company && !done.has(c.accessionNumber)).slice(0, MAX_PER_RUN);

    for (const f of toWrite) {
      const c = f.company!;
      try {
        let netAssessment: string | null = null;
        let concernLabel: string | null = null;
        let topRiskChanges: string[] = [];
        if (f.analysisData) {
          try {
            const a = JSON.parse(f.analysisData);
            netAssessment = a?.concernAssessment?.netAssessment ?? null;
            concernLabel = a?.concernAssessment?.concernLabel ?? null;
            topRiskChanges = (a?.risks?.topChanges ?? []).filter(Boolean).slice(0, 4);
          } catch {
            /* ignore malformed analysisData */
          }
        }

        const filingDateStr = f.filingDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        });

        const article = await claudeClient.generateNewsArticle({
          companyName: c.name,
          ticker: c.ticker,
          filingType: f.filingType,
          filingDateStr,
          aiSummary: f.aiSummary,
          netAssessment,
          concernLabel,
          concernLevel: f.concernLevel,
          topRiskChanges,
          predicted30dAlpha: f.predicted30dAlpha,
          sector: c.sector ?? null,
        });

        const slug = slugify(c.ticker, f.filingType, f.filingDate, f.accessionNumber);

        await prisma.newsArticle.create({
          data: {
            slug,
            title: article.title,
            dek: article.dek,
            bodyMarkdown: article.body,
            filingAccession: f.accessionNumber,
            ticker: c.ticker,
            companyName: c.name,
            sector: c.sector ?? null,
            filingType: f.filingType,
            filingDate: f.filingDate,
            concernLevel: f.concernLevel,
            predicted30dAlpha: f.predicted30dAlpha,
            predictionConfidence: f.predictionConfidence,
            model: 'claude-sonnet-4-5',
          },
        });
        generated.push({ slug, ticker: c.ticker });
      } catch (err) {
        errors.push({ accession: f.accessionNumber, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return NextResponse.json({
      ok: true,
      candidatesConsidered: candidates.length,
      generated: generated.length,
      articles: generated,
      errors,
      caps: { maxPerRun: MAX_PER_RUN, minConcern: MIN_CONCERN, lookbackDays: LOOKBACK_DAYS },
    });
  } catch (error) {
    console.error('generate-news cron failed', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error), generated: generated.length },
      { status: 500 }
    );
  }
}
