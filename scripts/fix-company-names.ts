/**
 * @module scripts/fix-company-names
 * @description One-time cleanup for company names mangled by the old SEC RSS title parser, which
 * left the trailing letter of a hyphenated form type stuck on the name ("10-K - MICROSOFT" ->
 * "K - MICROSOFT CORP", "10-Q - Wendy's" -> "Q - Wendy's Co") and never decoded XML entities
 * ("H&amp;R BLOCK"). The parser itself is fixed in lib/sec-rss-client.ts; this repairs existing rows.
 *
 * DRY RUN by default (read-only). Pass --apply to write. Usage:
 *   npx tsx scripts/fix-company-names.ts           # preview all diffs, no writes
 *   npx tsx scripts/fix-company-names.ts --apply    # persist the corrected names
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { decodeEntities } from '../lib/sec-rss-client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// Leading form-type remnant: a short token (K, Q, A, 10-K/A, etc.) followed by a spaced hyphen.
const FORM_REMNANT = /^[A-Z0-9]{1,4}(\/[A-Z])?\s+-\s+/;

function cleanName(name: string): string {
  return decodeEntities(name.replace(FORM_REMNANT, '')).replace(/\s+/g, ' ').trim();
}

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, ticker: true, name: true } });
  const changes = companies
    .map((c) => ({ ...c, next: cleanName(c.name) }))
    .filter((c) => c.next && c.next !== c.name);

  console.log(`${changes.length} of ${companies.length} names need cleanup${APPLY ? ' (APPLYING)' : ' (dry run)'}\n`);
  for (const c of changes) {
    console.log(`  ${c.ticker.padEnd(6)} "${c.name}"  ->  "${c.next}"`);
  }

  if (APPLY) {
    let done = 0;
    for (const c of changes) {
      await prisma.company.update({ where: { id: c.id }, data: { name: c.next } });
      done++;
    }
    console.log(`\nApplied ${done} updates.`);
  } else {
    console.log(`\nDry run only. Re-run with --apply to persist.`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
