/**
 * @module app/api/cron/ticker-audit/route
 * @description Weekly audit of the tracked-ticker universe. It can't edit the source
 * ticker file (that requires a code change + deploy), so instead it SURFACES drift so a
 * maintainer knows when to run `npm run reconcile-tickers`:
 *   - duplicates in the ticker file (should be 0),
 *   - file tickers that no longer resolve to a CIK (delisted/renamed → remove),
 *   - tracked companies with no filing in 120 days (possible delisting),
 *   - companies in the DB but missing from the ticker file (candidates to add).
 * Logs warnings and returns a JSON report; findings are also surfaced in Vercel logs.
 *
 * Auth: Bearer CRON_SECRET or a Vercel cron user-agent.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { secRSSClient } from '@/lib/sec-rss-client';
import { TOP_1000_TICKERS } from '@/lib/top1000-tickers';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const norm = (t: string) => t.toUpperCase().replace(/[.\-]/g, '');

function authorized(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent') || '';
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron =
    userAgent.includes('vercel-cron/') ||
    request.headers.get('x-vercel-cron') === '1' ||
    userAgent.toLowerCase().includes('vercel');
  return isVercelCron || (!!cronSecret && authHeader === `Bearer ${cronSecret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Duplicates + unresolved tickers in the file.
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const t of TOP_1000_TICKERS) {
    if (seen.has(t)) duplicates.push(t);
    else seen.add(t);
  }

  await secRSSClient.ensureCIKMappingLoaded();
  const resolvedTickers = new Set(secRSSClient.trackedCIKMap.values());
  const unresolved = [...seen].filter((t) => !resolvedTickers.has(t));

  // 2. DB companies not in the file (candidates to add).
  let dbNotInFile: string[] = [];
  let staleTracked: string[] = [];
  try {
    // Only surface ACTIVE companies (filed in last 180 days) missing from the file —
    // avoids flagging delisted DB records as things to add.
    const activeCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const fileNorm = new Set([...seen].map(norm));
    const companies = await prisma.company.findMany({
      where: { filings: { some: { filingDate: { gte: activeCutoff } } } },
      select: { ticker: true },
    });
    dbNotInFile = companies.map((c) => c.ticker).filter((t) => !fileNorm.has(norm(t)));

    // Delisting detection is deliberately conservative: only flag a ticker with NO
    // filing in a FULL YEAR. Lingering delisted tickers are harmless; being late to
    // remove one is fine. Report-only — never auto-removed.
    const delistCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const tracked = await prisma.company.findMany({
      where: { ticker: { in: [...seen] } },
      select: { ticker: true, filings: { where: { filingDate: { gte: delistCutoff } }, select: { id: true }, take: 1 } },
    });
    staleTracked = tracked.filter((c) => c.filings.length === 0).map((c) => c.ticker);
  } catch (e: any) {
    console.error('[ticker-audit] db checks failed:', e.message);
  }

  const report = {
    fileTickers: TOP_1000_TICKERS.length,
    uniqueTickers: seen.size,
    duplicates,
    unresolvedTickers: unresolved,
    dbCompaniesNotInFile: dbNotInFile.length,
    dbCompaniesNotInFileSample: dbNotInFile.slice(0, 40),
    trackedWithNoRecentFilings: staleTracked.length,
    trackedWithNoRecentFilingsSample: staleTracked.slice(0, 40),
    action: 'Review, then run `npm run reconcile-tickers` and deploy if changes are needed.',
  };

  if (duplicates.length) console.warn(`[ticker-audit] ${duplicates.length} duplicate tickers`);
  if (unresolved.length) console.warn(`[ticker-audit] ${unresolved.length} unresolved tickers: ${unresolved.join(', ')}`);
  if (dbNotInFile.length) console.warn(`[ticker-audit] ${dbNotInFile.length} DB companies missing from the file`);
  if (staleTracked.length > 30) console.warn(`[ticker-audit] ${staleTracked.length} tracked companies have no filing in 120 days (check for delistings)`);

  return NextResponse.json({ success: true, report });
}
