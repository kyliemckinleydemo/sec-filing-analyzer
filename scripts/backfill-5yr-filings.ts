/**
 * @module scripts/backfill-5yr-filings
 * @description Fetches 5 years of historical SEC filings (10-K, 10-Q, 8-K) from EDGAR
 * for all companies in the database. Handles SEC submissions API pagination for older
 * filing history. Expands training dataset from Dec-2023 baseline to 5 years.
 *
 * Rate: ~8 req/sec (safely under SEC's 10 req/sec limit).
 * Expected runtime: 20-40 min for 829 companies (includes pagination requests).
 *
 * Usage: npx tsx scripts/backfill-5yr-filings.ts
 * Next:  npx tsx scripts/backfill-historical-price-features.ts
 */

import { prisma } from '../lib/prisma';

const SEC_BASE = 'https://data.sec.gov';
const USER_AGENT = 'SEC Filing Analyzer/1.0 (educational project; contact: research@example.com)';
const RATE_LIMIT_MS = 120; // ~8 req/sec

const FIVE_YEARS_AGO = new Date();
FIVE_YEARS_AGO.setFullYear(FIVE_YEARS_AGO.getFullYear() - 5);

const TARGET_FORMS = new Set(['10-K', '10-Q', '8-K']);

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

async function secFetch(url: string): Promise<any> {
  await sleep(RATE_LIMIT_MS);
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (res.status === 429) {
    console.log('  [Rate limit] Waiting 5s...');
    await sleep(5000);
    return secFetch(url);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

interface FilingEntry {
  accessionNumber: string;
  filingDate: string;
  form: string;
  primaryDocument: string;
}

function parseFilingsBlock(block: {
  accessionNumber: string[];
  filingDate: string[];
  form: string[];
  primaryDocument?: string[];
}): FilingEntry[] {
  return block.accessionNumber.map((acc, i) => ({
    accessionNumber: acc,
    filingDate: block.filingDate[i] ?? '',
    form: block.form[i] ?? '',
    primaryDocument: block.primaryDocument?.[i] ?? '',
  }));
}

async function getHistoricalFilings(cik: string): Promise<FilingEntry[]> {
  const paddedCik = cik.padStart(10, '0');

  const sub = await secFetch(`${SEC_BASE}/submissions/CIK${paddedCik}.json`);
  const all: FilingEntry[] = parseFilingsBlock(sub.filings.recent);

  // Paginate older filings
  if (Array.isArray(sub.filings.files)) {
    for (const file of sub.filings.files as { name: string }[]) {
      try {
        const older = await secFetch(`${SEC_BASE}/submissions/${file.name}`);
        all.push(...parseFilingsBlock(older));
      } catch {
        // Skip failed pagination pages
      }
    }
  }

  return all.filter(f =>
    TARGET_FORMS.has(f.form) &&
    f.filingDate &&
    new Date(f.filingDate) >= FIVE_YEARS_AGO,
  );
}

function normalizeAccession(acc: string): string {
  const clean = acc.replace(/-/g, '');
  if (clean.length !== 18) return acc;
  return `${clean.slice(0, 10)}-${clean.slice(10, 12)}-${clean.slice(12)}`;
}

function buildFilingUrl(cik: string, accession: string): string {
  const numCik = parseInt(cik, 10);
  const accNoDashes = accession.replace(/-/g, '');
  const accWithDashes = normalizeAccession(accNoDashes);
  return `https://www.sec.gov/Archives/edgar/data/${numCik}/${accNoDashes}/${accWithDashes}-index.htm`;
}

async function main() {
  console.log('=== BACKFILL 5-YEAR HISTORICAL FILINGS ===\n');
  console.log(`Cutoff: ${FIVE_YEARS_AGO.toISOString().split('T')[0]}`);
  console.log(`Forms:  ${[...TARGET_FORMS].join(', ')}\n`);

  const companies = await prisma.company.findMany({
    select: { id: true, cik: true, ticker: true },
    where: { cik: { not: '0000000000' } },
    orderBy: { ticker: 'asc' },
  });

  console.log(`Companies to process: ${companies.length}\n`);

  const stats = { processed: 0, added: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];

    try {
      const filings = await getHistoricalFilings(company.cik);

      let addedForCompany = 0;

      for (const filing of filings) {
        const normalized = normalizeAccession(filing.accessionNumber);

        const exists = await prisma.filing.findUnique({
          where: { accessionNumber: normalized },
          select: { id: true },
        });

        if (exists) {
          stats.skipped++;
          continue;
        }

        await prisma.filing.create({
          data: {
            companyId: company.id,
            cik: company.cik,
            accessionNumber: normalized,
            filingType: filing.form,
            filingDate: new Date(filing.filingDate),
            filingUrl: buildFilingUrl(company.cik, filing.accessionNumber),
          },
        });

        addedForCompany++;
        stats.added++;
      }

      stats.processed++;
      if (addedForCompany > 0 || i < 5) {
        console.log(`[${company.ticker}] +${addedForCompany} new (${filings.length} total found)`);
      }
    } catch (error: any) {
      console.error(`[${company.ticker}] Error: ${error.message}`);
      stats.errors++;
    }

    if (stats.processed % 100 === 0 && stats.processed > 0) {
      console.log(`\n--- ${stats.processed}/${companies.length} processed | ${stats.added} added ---\n`);
    }
  }

  console.log('\n=== COMPLETE ===');
  console.log(`Processed: ${stats.processed} companies`);
  console.log(`Added:     ${stats.added} new filings`);
  console.log(`Skipped:   ${stats.skipped} (already existed)`);
  console.log(`Errors:    ${stats.errors}`);
  console.log('\nNext: npx tsx scripts/backfill-historical-price-features.ts');

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
