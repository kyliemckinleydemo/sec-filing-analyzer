/**
 * @module app/api/cron/analyze-filings/route
 * @description Cron job that keeps AI analysis current by analyzing a BOUNDED batch of
 * recent, unanalyzed filings each run (fetch → Claude analysis → persist → predict).
 * Runs frequently so it catches up gradually and stays current without any single run
 * being long or expensive.
 *
 * COST: each filing = several Claude (Haiku) calls billed via the Anthropic API key —
 * SEPARATE from any Claude subscription. Guardrails:
 *   - MAX_PER_RUN caps filings analyzed per invocation (env ANALYSIS_MAX_PER_RUN).
 *   - ANALYSIS_ENABLED env must be "true" to spend; otherwise the job reports what it
 *     WOULD do (dry run) and spends nothing. This makes enabling paid analysis an
 *     explicit, reversible decision.
 *
 * Auth: Bearer CRON_SECRET or a Vercel cron user-agent.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeAndPersistFiling } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOOKBACK_DAYS = 45; // only keep the recent window current; backfill older via script
const DEFAULT_MAX_PER_RUN = 6; // conservative; each filing ~30-60s and costs tokens

function authorized(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent') || '';
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron =
    userAgent.includes('vercel-cron/') ||
    request.headers.get('x-vercel-cron') === '1' ||
    userAgent.toLowerCase().includes('vercel');
  const hasValidAuth = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  return isVercelCron || hasValidAuth;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const enabled = process.env.ANALYSIS_ENABLED === 'true';
  const maxPerRun = parseInt(process.env.ANALYSIS_MAX_PER_RUN || String(DEFAULT_MAX_PER_RUN), 10);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const where = {
    filingDate: { gte: since },
    concernLevel: null,
    filingUrl: { not: '' },
  };

  const backlog = await prisma.filing.count({ where });

  const filings = await prisma.filing.findMany({
    where,
    include: {
      company: {
        select: {
          name: true, currentPrice: true, fiftyTwoWeekHigh: true, fiftyTwoWeekLow: true,
          marketCap: true, analystTargetPrice: true, sector: true,
        },
      },
    },
    orderBy: { filingDate: 'desc' },
    take: maxPerRun,
  });

  // Dry run: report the backlog without spending Anthropic tokens.
  if (!enabled) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      note: 'ANALYSIS_ENABLED != "true" — no filings analyzed (no cost). Set ANALYSIS_ENABLED=true to activate.',
      recentBacklog: backlog,
      wouldAnalyze: filings.length,
      maxPerRun,
      lookbackDays: LOOKBACK_DAYS,
    });
  }

  let analyzed = 0, noUrl = 0, fetchFailed = 0, failed = 0, predicted = 0;
  const errors: string[] = [];

  for (const f of filings) {
    const r = await analyzeAndPersistFiling({
      id: f.id,
      filingUrl: f.filingUrl,
      filingType: f.filingType,
      filingDate: f.filingDate,
      companyId: f.companyId,
      company: f.company,
    });
    if (r.status === 'ok') {
      analyzed++;
      if (r.predictionStatus === 'ok') predicted++;
    } else if (r.status === 'no-url') noUrl++;
    else if (r.status === 'fetch-failed') fetchFailed++;
    else {
      failed++;
      if (r.error) errors.push(r.error);
    }
  }

  return NextResponse.json({
    success: true,
    dryRun: false,
    recentBacklog: backlog,
    processed: filings.length,
    analyzed,
    predicted,
    noUrl,
    fetchFailed,
    failed,
    remainingAfterRun: Math.max(0, backlog - analyzed),
    errors: errors.slice(0, 5),
  });
}
