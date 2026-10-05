import { prisma } from '../lib/prisma';
import { isRefusal } from '../lib/analysis-quality';

/**
 * @module scripts/regenerate-broken-analyses
 * @description Finds filings whose stored aiSummary is a refusal/error (see
 * lib/analysis-quality) and clears their cached analysis so they get re-analyzed.
 * Clearing `analysisData` to null makes them eligible for the existing bulk pipeline
 * (`scripts/bulk-analyze-parallel.ts`, which selects `where: { analysisData: null }`).
 *
 * Re-analysis costs Anthropic API tokens (billed separately from Claude Max), so this
 * script is DRY-RUN by default and never kicks off analysis itself — it only resets
 * the broken rows. Run it in bounded batches, then run the bulk analyzer.
 *
 * Usage:
 *   npx tsx scripts/regenerate-broken-analyses.ts                 # dry run, show counts
 *   npx tsx scripts/regenerate-broken-analyses.ts --apply --limit 500
 *   npx tsx scripts/regenerate-broken-analyses.ts --apply --limit 500 --since 2025-01-01
 *
 * After clearing, regenerate with:
 *   npx tsx scripts/bulk-analyze-parallel.ts
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const limit = Number(arg('--limit') ?? '0') || 0; // 0 = no limit
  const since = arg('--since') ? new Date(arg('--since') as string) : null;

  const where: Record<string, unknown> = { aiSummary: { not: null } };
  if (since && !isNaN(since.getTime())) where.filingDate = { gte: since };

  const candidates = await prisma.filing.findMany({
    where,
    select: { id: true, accessionNumber: true, filingType: true, filingDate: true, aiSummary: true },
    orderBy: { filingDate: 'desc' },
  });

  const broken = candidates.filter((f) => isRefusal(f.aiSummary));
  const targets = limit > 0 ? broken.slice(0, limit) : broken;

  console.log(`Candidates scanned: ${candidates.length}`);
  console.log(`Broken (refusal) summaries: ${broken.length}`);
  console.log(`Selected to reset this run: ${targets.length}${limit ? ` (limit ${limit})` : ''}`);
  if (since) console.log(`Filtered to filings since: ${since.toISOString().slice(0, 10)}`);

  if (!apply) {
    console.log('\nDRY RUN — nothing changed. Re-run with --apply to clear these analyses.');
    console.log('Sample:');
    targets.slice(0, 10).forEach((f) =>
      console.log(`  - ${f.accessionNumber} (${f.filingType}, ${f.filingDate.toISOString().slice(0, 10)})`)
    );
    await prisma.$disconnect();
    return;
  }

  let cleared = 0;
  const ids = targets.map((t) => t.id);
  // Batch the updates to keep each transaction small.
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const res = await prisma.filing.updateMany({
      where: { id: { in: slice } },
      data: {
        analysisData: null,
        aiSummary: null,
        sentimentScore: null,
        riskScore: null,
        concernLevel: null,
        predicted7dReturn: null,
        predictionConfidence: null,
      },
    });
    cleared += res.count;
    console.log(`  cleared ${cleared}/${ids.length}`);
  }

  console.log(`\n✅ Cleared ${cleared} broken analyses. Now regenerate:`);
  console.log('   npx tsx scripts/bulk-analyze-parallel.ts');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('regenerate-broken-analyses: error', err);
  await prisma.$disconnect();
  process.exit(1);
});
