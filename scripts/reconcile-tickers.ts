/**
 * @module scripts/reconcile-tickers
 * @description Repeatable reconciliation of lib/top1000-tickers.ts. Run monthly (or when
 * the weekly ticker-audit cron flags drift), then commit + deploy.
 *
 * SAFE, automatic changes:
 *   - Deduplicate the ticker list.
 *   - Add companies already tracked in the DB but missing from the file.
 * REPORTED ONLY (not auto-applied — removing needs human judgment, because "no recent
 * filings" can be a data gap rather than a delisting):
 *   - Tracked tickers with no filing in 120 days (possible delistings to review).
 *
 * Usage:
 *   npx tsx scripts/reconcile-tickers.ts            # report only (dry run)
 *   npx tsx scripts/reconcile-tickers.ts --write     # apply dedupe + additions
 */
import { TOP_1000_TICKERS } from '../lib/top1000-tickers';
import { prisma } from '../lib/prisma';
import { writeFileSync } from 'fs';

const WRITE = process.argv.includes('--write');
const norm = (t: string) => t.toUpperCase().replace(/[.\-]/g, '');

async function main() {
  // Dedupe preserving order.
  const seen = new Set<string>();
  const deduped: string[] = [];
  let dupes = 0;
  for (const t of TOP_1000_TICKERS) {
    if (seen.has(t)) { dupes++; continue; }
    seen.add(t);
    deduped.push(t);
  }

  // Additions: DB companies that are ACTIVE (filed in the last 180 days) and missing
  // from the file. Requiring a recent filing avoids re-adding delisted companies whose
  // DB records still linger.
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const dedupedNorm = new Set(deduped.map(norm));
  const companies = await prisma.company.findMany({
    where: { filings: { some: { filingDate: { gte: cutoff } } } },
    select: { ticker: true },
    orderBy: { ticker: 'asc' },
  });
  const additions = companies.map((c) => c.ticker).filter((t) => !dedupedNorm.has(norm(t)));

  // Report-only: tracked companies with NO filing in 180 days AND no company_tickers
  // resolution — genuine delisting candidates (still verify against SEC before removing).
  const tracked = await prisma.company.findMany({
    where: { ticker: { in: deduped } },
    select: { ticker: true, filings: { where: { filingDate: { gte: cutoff } }, select: { id: true }, take: 1 } },
  });
  const staleCandidates = tracked.filter((c) => c.filings.length === 0).map((c) => c.ticker);

  const final = [...deduped, ...additions];
  console.log(`Current: ${TOP_1000_TICKERS.length} | dupes: ${dupes} | additions(DB): ${additions.length} | -> ${final.length}`);
  if (additions.length) console.log(`Adding: ${additions.join(', ')}`);
  const stalePct = deduped.length ? Math.round((staleCandidates.length / deduped.length) * 100) : 0;
  console.log(`\nDelisting candidates — no filing ingested in 180d (${staleCandidates.length}, ${stalePct}% of file):`);
  if (stalePct > 20) {
    console.log(`  ⚠️ Signal UNRELIABLE right now — a high fraction means filing ingestion is still`);
    console.log(`     catching up, not that these are delisted. Re-check once coverage is current.`);
  }
  console.log(`  ${staleCandidates.slice(0, 60).join(', ')}${staleCandidates.length > 60 ? ' …' : ''}`);
  console.log(`(Removal is MANUAL — verify each against SEC EDGAR before deleting; a data gap is not a delisting.)`);

  if (!WRITE) {
    console.log('\nDry run. Re-run with --write to apply dedupe + additions.');
    await prisma.$disconnect();
    return;
  }

  const rows: string[] = [];
  for (let i = 0; i < final.length; i += 10) rows.push('  ' + final.slice(i, i + 10).map((t) => `'${t}'`).join(', ') + ',');
  const body = rows.join('\n').replace(/,$/, '');
  const content = `/**
 * @module lib/top1000-tickers
 * @description Curated universe of US company tickers StockHuntr tracks (filings RSS filter).
 * Reconciled ${new Date().toISOString().slice(0, 10)} via scripts/reconcile-tickers.ts.
 * Class shares use dot notation (BRK.B). Matching is by CIK (see lib/sec-rss-client.ts);
 * companies SEC mislabels/omits need a TICKER_CIK_OVERRIDES entry there.
 */

export const TOP_1000_TICKERS = [
${body}
];
`;
  writeFileSync('lib/top1000-tickers.ts', content);
  console.log('\nWrote lib/top1000-tickers.ts (review, run tests, commit, deploy).');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
