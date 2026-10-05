import { prisma } from '../lib/prisma';
import { isRefusal } from '../lib/analysis-quality';

/**
 * @module scripts/check-refusal-content
 * @description Deploy-time content guard. Fails the pipeline if broken AI output
 * (refusal preambles / "[Risk analysis failed]" placeholders — see
 * lib/analysis-quality) would reach search engines, and flags newly-generated
 * refusals so a generator regression blocks the deploy instead of silently
 * publishing thin pages.
 *
 * Two levels of severity:
 *   1. BLOCKING — a refusal summary that is NOT protected (i.e. would still be
 *      emitted in the sitemap). This should be impossible given sitemap.ts +
 *      the filing-page noindex both key off isRefusal(); if it ever fires, the
 *      protection coupling has regressed and the deploy must stop.
 *   2. BLOCKING — a refusal summary on a filing analyzed in the last 14 days,
 *      which means the live generator regressed and is producing broken output.
 *   3. WARNING — the historical backlog of refusals (already noindexed + excluded
 *      from the sitemap). Reported so progress on regeneration is visible, but
 *      non-blocking so deploys aren't held hostage by the pre-existing backlog.
 *
 * Usage: npx tsx scripts/check-refusal-content.ts
 */

const RECENT_DAYS = 14;

async function main() {
  const filings = await prisma.filing.findMany({
    where: { aiSummary: { not: null } },
    select: { accessionNumber: true, filingDate: true, aiSummary: true },
  });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);

  // Mirror the sitemap's selection: most-recent 5000 non-refusal filings are the
  // ones actually advertised to search engines.
  const sitemapSet = filings
    .slice()
    .sort((a, b) => b.filingDate.getTime() - a.filingDate.getTime())
    .filter((f) => !isRefusal(f.aiSummary))
    .slice(0, 5000);
  const leakedIntoSitemap = sitemapSet.filter((f) => isRefusal(f.aiSummary));

  const broken = filings.filter((f) => isRefusal(f.aiSummary));
  const recentBroken = broken.filter((f) => f.filingDate >= cutoff);

  const total = filings.length;
  console.log(`Scanned ${total} analyzed filings.`);
  console.log(`  Broken (refusal/error) summaries: ${broken.length} (${((100 * broken.length) / total).toFixed(1)}%)`);
  console.log(`  Of those, filed in the last ${RECENT_DAYS}d: ${recentBroken.length}`);
  console.log(`  Refusals leaked into sitemap set: ${leakedIntoSitemap.length}`);

  const errors: string[] = [];

  if (leakedIntoSitemap.length > 0) {
    errors.push(
      `${leakedIntoSitemap.length} refusal filing(s) would be emitted in the sitemap — ` +
        `the sitemap/noindex protection has regressed. Examples: ` +
        leakedIntoSitemap.slice(0, 5).map((f) => f.accessionNumber).join(', ')
    );
  }

  if (recentBroken.length > 0) {
    errors.push(
      `${recentBroken.length} filing(s) analyzed in the last ${RECENT_DAYS}d have refusal summaries — ` +
        `the live generator is producing broken output. Examples: ` +
        recentBroken.slice(0, 5).map((f) => f.accessionNumber).join(', ')
    );
  }

  if (broken.length > 0 && recentBroken.length === 0 && leakedIntoSitemap.length === 0) {
    console.log(
      `\n⚠️  ${broken.length} historical filing(s) still carry refusal summaries. These are ` +
        `noindexed and excluded from the sitemap. Regenerate them with:\n` +
        `    npx tsx scripts/regenerate-broken-analyses.ts --apply --limit 500\n`
    );
  }

  if (errors.length > 0) {
    console.error('\n❌ Content guard FAILED:');
    errors.forEach((e) => console.error('   - ' + e));
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('\n✅ Content guard passed: no refusal content is publishable/indexable.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('check-refusal-content: unexpected error', err);
  await prisma.$disconnect();
  process.exit(1);
});
