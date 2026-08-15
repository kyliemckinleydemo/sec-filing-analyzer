/**
 * @module scripts/backfill-missed-filings
 * @description One-time backfill for companies whose filings the RSS cron silently
 * dropped due to the SEC company_tickers.json ticker-mapping bug (fixed by CIK-based
 * matching in lib/sec-rss-client.ts). Fetches each company's recent 10-K/10-Q/8-K from
 * SEC's submissions API (by CIK) and upserts Company + Filing records so they appear in
 * the app; the analyze-filings cron will analyze them over time.
 *
 * Usage: npx tsx scripts/backfill-missed-filings.ts [--months 12]
 */
import { prisma } from '../lib/prisma';

const UA = { 'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FORMS = ['10-K', '10-Q', '8-K'];

// Companies SEC mislabels/omits (matches TICKER_CIK_OVERRIDES in sec-rss-client.ts).
const TARGETS: Record<string, string> = {
  'BRK.B': '0001067983', 'MMC': '0000062709', 'AEP': '0000004904', 'K': '0000055067',
  'CTRA': '0000858470', 'HOLX': '0000859737', 'IPG': '0000051644', 'SEE': '0001012100',
  'HBI': '0001359841', 'THS': '0001320695', 'DENN': '0000852772', 'SCVL': '0000895447',
  'GES': '0000912463', 'JHG': '0001274173', 'ALE': '0000066756', 'BK': '0001390777',
  'CMA': '0000028412', 'SNV': '0000018349', 'KIRK': '0001056285', 'SJW': '0000766829', 'FI': '0000798354', 'SATS': '0001415404', 'DAY': '0001725057',
};

const monthsArg = process.argv.indexOf('--months');
const MONTHS = monthsArg >= 0 && process.argv[monthsArg + 1] ? parseInt(process.argv[monthsArg + 1], 10) : 12;

async function main() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - MONTHS);
  console.log(`[backfill] ${Object.keys(TARGETS).length} companies, filings since ${cutoff.toISOString().slice(0, 10)}`);

  let totalStored = 0, totalCompanies = 0;

  for (const [ticker, cik] of Object.entries(TARGETS)) {
    try {
      const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: UA });
      if (!res.ok) { console.log(`  ${ticker}: submissions ${res.status}`); await sleep(200); continue; }
      const j: any = await res.json();
      const name: string = j.name || ticker;
      const r = j.filings?.recent;
      if (!r) { console.log(`  ${ticker}: no recent filings block`); await sleep(200); continue; }

      const cikInt = String(parseInt(cik, 10));

      // Ensure the company exists with the correct CIK.
      const company = await prisma.company.upsert({
        where: { ticker },
        create: { ticker, cik: cikInt, name },
        update: { cik: cikInt, name },
      });
      totalCompanies++;

      let stored = 0;
      for (let i = 0; i < r.form.length; i++) {
        const form = r.form[i];
        if (!FORMS.includes(form)) continue;
        const filingDate = new Date(r.filingDate[i]);
        if (filingDate < cutoff) continue;
        const accessionNumber: string = r.accessionNumber[i];
        const reportDate = r.reportDate[i] ? new Date(r.reportDate[i]) : null;
        const accNoDashes = accessionNumber.replace(/-/g, '');
        const primaryDoc = r.primaryDocument[i] || '';
        const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDashes}/${primaryDoc}`;

        await prisma.filing.upsert({
          where: { accessionNumber },
          create: {
            companyId: company.id, cik: cikInt, accessionNumber,
            filingType: form, filingDate, reportDate, filingUrl,
          },
          update: { filingDate, reportDate },
        });
        stored++;
      }
      totalStored += stored;
      console.log(`  ${ticker} (${name}): ${stored} filings`);
      await sleep(250); // SEC rate limit
    } catch (e: any) {
      console.error(`  ${ticker}: ERROR ${e.message}`);
    }
  }

  console.log(`[backfill] done. companies=${totalCompanies} filings upserted=${totalStored}`);
}

main().catch((e) => { console.error('[backfill] fatal', e); process.exit(1); }).finally(() => prisma.$disconnect());
