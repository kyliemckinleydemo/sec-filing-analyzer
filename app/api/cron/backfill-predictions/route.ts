/**
 * @module app/api/cron/backfill-predictions/route
 * @description Cron job that generates and persists 30-day alpha predictions for recently
 * analyzed filings that don't have one yet. Predictions are otherwise only created
 * on-demand (filing page visits), which leaves Top Signals, the Model Track Record tile,
 * and the MCP get_top_signals tool sparse. Free to run — pure compute over stored data.
 *
 * Auth: Bearer CRON_SECRET or a Vercel cron user-agent.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateAndPersistPrediction } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOOKBACK_DAYS = 200;
const MAX_PER_RUN = 400; // predictions are fast; bounded to stay within timeout

function authorized(request: Request): boolean {
  // Require the shared secret only — Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when
  // CRON_SECRET is configured. Spoofable UA / x-vercel-cron headers must NOT grant access.
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const filings = await prisma.filing.findMany({
    where: {
      filingDate: { gte: since },
      concernLevel: { not: null },
      predicted30dAlpha: null,
    },
    include: {
      company: {
        select: {
          currentPrice: true, fiftyTwoWeekHigh: true, fiftyTwoWeekLow: true,
          marketCap: true, analystTargetPrice: true, sector: true,
        },
      },
    },
    orderBy: { filingDate: 'desc' },
    take: MAX_PER_RUN,
  });

  let ok = 0, insufficient = 0, failed = 0;
  for (const f of filings) {
    const r = await generateAndPersistPrediction({
      id: f.id,
      filingDate: f.filingDate,
      companyId: f.companyId,
      concernLevel: f.concernLevel,
      sentimentScore: f.sentimentScore,
      epsSurprise: (f as any).epsSurprise ?? null,
      company: f.company,
    });
    if (r.status === 'ok') ok++;
    else if (r.status === 'insufficient-data') insufficient++;
    else failed++;
  }

  const remaining = await prisma.filing.count({
    where: { filingDate: { gte: since }, concernLevel: { not: null }, predicted30dAlpha: null },
  });

  return NextResponse.json({
    success: true,
    processed: filings.length,
    predicted: ok,
    insufficientData: insufficient,
    failed,
    remainingUnpredicted: remaining,
  });
}
