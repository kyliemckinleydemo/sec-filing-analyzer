/**
 * @module scripts/export-dataset
 * @description Exports StockHuntr's analyzed-filings dataset to CSV + JSONL + a dataset
 * card (README) under ./dataset. This is the open, publishable version of the corpus —
 * one row per SEC filing that has an AI analysis, with the model's 30-day alpha
 * prediction and, where the 30-day window has elapsed, the realized outcome.
 *
 * Intended for publication on Hugging Face Datasets / Kaggle / a GitHub repo as a
 * citation and backlink asset. No PII; primary source is SEC EDGAR (public domain).
 *
 * Usage: npx tsx scripts/export-dataset.ts
 */
import { prisma } from '../lib/prisma';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT_DIR = join(process.cwd(), 'dataset');

// Column order for the CSV / dataset card. Keep in sync with buildRow().
const COLUMNS = [
  'accession_number',
  'ticker',
  'company_name',
  'sector',
  'industry',
  'form_type',
  'filing_date',
  'report_date',
  'filing_url',
  'predicted_30d_alpha',
  'predicted_30d_return',
  'prediction_confidence',
  'concern_level',
  'sentiment_score',
  'eps_surprise_pct',
  'revenue_surprise_pct',
  'actual_30d_alpha',
  'actual_30d_return',
  'outcome_known',
] as const;

type Row = Record<(typeof COLUMNS)[number], string | number | null>;

function csvCell(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  console.log('[export-dataset] Querying analyzed filings...');
  const filings = await prisma.filing.findMany({
    where: {
      // Only filings that carry an actual AI analysis — mirrors the sitemap policy of
      // never advertising thin pages.
      OR: [{ aiSummary: { not: null } }, { predicted30dAlpha: { not: null } }],
    },
    include: {
      company: { select: { ticker: true, name: true, sector: true, industry: true } },
    },
    orderBy: { filingDate: 'desc' },
  });

  console.log(`[export-dataset] ${filings.length} filings matched.`);

  const rows: Row[] = filings.map((f) => {
    const outcomeKnown = f.actual30dAlpha !== null;
    return {
      accession_number: f.accessionNumber,
      ticker: f.company.ticker,
      company_name: f.company.name,
      sector: f.company.sector ?? null,
      industry: f.company.industry ?? null,
      form_type: f.filingType,
      filing_date: f.filingDate.toISOString().slice(0, 10),
      report_date: f.reportDate ? f.reportDate.toISOString().slice(0, 10) : null,
      filing_url: f.filingUrl,
      predicted_30d_alpha: f.predicted30dAlpha,
      predicted_30d_return: f.predicted30dReturn,
      prediction_confidence: f.predictionConfidence,
      concern_level: f.concernLevel,
      sentiment_score: f.sentimentScore,
      eps_surprise_pct: f.epsSurprise,
      revenue_surprise_pct: f.revenueSurprise,
      actual_30d_alpha: f.actual30dAlpha,
      actual_30d_return: f.actual30dReturn,
      outcome_known: outcomeKnown ? 1 : 0,
    };
  });

  mkdirSync(OUT_DIR, { recursive: true });

  // CC-BY-4.0 license notice for the published package.
  writeFileSync(
    join(OUT_DIR, 'LICENSE'),
    `This dataset is released under the Creative Commons Attribution 4.0 International License (CC BY 4.0).
You are free to share and adapt the material for any purpose, even commercially, provided you give
appropriate credit to StockHuntr (https://www.stockhuntr.net).

Underlying SEC filing data is sourced from SEC EDGAR (public domain, U.S. government work).
Full license text: https://creativecommons.org/licenses/by/4.0/
`
  );

  // --- CSV ---
  const csv = [
    COLUMNS.join(','),
    ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(',')),
  ].join('\n');
  writeFileSync(join(OUT_DIR, 'stockhuntr-filings.csv'), csv + '\n');

  // --- JSONL ---
  const jsonl = rows.map((r) => JSON.stringify(r)).join('\n');
  writeFileSync(join(OUT_DIR, 'stockhuntr-filings.jsonl'), jsonl + '\n');

  // --- Stats for the dataset card ---
  const withPrediction = rows.filter((r) => r.predicted_30d_alpha !== null).length;
  const withOutcome = rows.filter((r) => r.outcome_known === 1).length;
  const byForm = rows.reduce<Record<string, number>>((acc, r) => {
    const k = String(r.form_type);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const tickers = new Set(rows.map((r) => r.ticker)).size;
  const dates = rows.map((r) => String(r.filing_date)).sort();
  const dateRange = dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : 'n/a';

  writeFileSync(join(OUT_DIR, 'README.md'), datasetCard({
    total: rows.length,
    withPrediction,
    withOutcome,
    tickers,
    byForm,
    dateRange,
  }));

  console.log('[export-dataset] Wrote:');
  console.log(`  ${join(OUT_DIR, 'stockhuntr-filings.csv')}`);
  console.log(`  ${join(OUT_DIR, 'stockhuntr-filings.jsonl')}`);
  console.log(`  ${join(OUT_DIR, 'README.md')}`);
  console.log(
    `[export-dataset] ${rows.length} rows | ${withPrediction} with prediction | ${withOutcome} with realized outcome | ${tickers} tickers | ${dateRange}`
  );
}

function datasetCard(s: {
  total: number;
  withPrediction: number;
  withOutcome: number;
  tickers: number;
  byForm: Record<string, number>;
  dateRange: string;
}): string {
  const formLines = Object.entries(s.byForm)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join('\n');

  return `---
license: cc-by-4.0
language:
  - en
tags:
  - finance
  - sec-filings
  - stock-prediction
  - edgar
pretty_name: StockHuntr AI-Analyzed SEC Filings
---

# StockHuntr: AI-Analyzed SEC Filings with Realized 30-Day Outcomes

This dataset contains SEC filings (10-K, 10-Q, 8-K) analyzed by [StockHuntr](https://www.stockhuntr.net).
Each row carries AI-generated features — a **concern score**, a **management-sentiment
score**, and (where available) an **EPS surprise** — extracted from the filing. For the
subset where the 30-day window following the filing has elapsed, the row also includes the
**realized 30-day market-relative alpha** (stock return minus S&P 500). That combination —
AI-derived features on one side, a realized market label on the other — makes this a ready
supervised-learning dataset for studying how filing content relates to subsequent returns.

Note on the prediction columns: StockHuntr generates its live 30-day alpha *prediction* on
demand and does not persist it for every historical filing, so \`predicted_30d_alpha\` is
populated only for a small recent subset. The durable signal in this dataset is the pairing
of AI features with the **realized** outcome.

## At a glance

| Metric | Value |
|--------|-------|
| Total analyzed filings | ${s.total} |
| With AI concern/sentiment features | ${s.total} |
| With a realized 30-day outcome (label) | ${s.withOutcome} |
| With a persisted live prediction | ${s.withPrediction} |
| Distinct companies | ${s.tickers} |
| Filing date range | ${s.dateRange} |

### Filings by form type

| Form | Count |
|------|-------|
${formLines}

## Files

- \`stockhuntr-filings.csv\` — one row per filing, columns below.
- \`stockhuntr-filings.jsonl\` — same data, one JSON object per line.

## Columns

| Column | Description |
|--------|-------------|
| \`accession_number\` | SEC EDGAR accession number (unique filing id) |
| \`ticker\` | Stock ticker |
| \`company_name\` | Company name |
| \`sector\`, \`industry\` | GICS-style classification (may be null) |
| \`form_type\` | 10-K, 10-Q, or 8-K |
| \`filing_date\` | Date filed with the SEC (YYYY-MM-DD) |
| \`report_date\` | Period end date, if applicable |
| \`filing_url\` | Direct link to the filing on SEC EDGAR |
| \`predicted_30d_alpha\` | Model's predicted 30-day return minus S&P 500 (%) |
| \`predicted_30d_return\` | Model's predicted 30-day raw return (%) |
| \`prediction_confidence\` | Model confidence, 0–1 |
| \`concern_level\` | AI multi-factor concern score, 0–10 (higher = more concerning) |
| \`sentiment_score\` | AI sentiment of management discussion, -1 to +1 |
| \`eps_surprise_pct\` | Reported EPS vs consensus (%), where available |
| \`revenue_surprise_pct\` | Reported revenue vs consensus (%), where available |
| \`actual_30d_alpha\` | **Realized** 30-day return minus S&P 500 (%), if the window has elapsed |
| \`actual_30d_return\` | **Realized** 30-day raw return (%), if the window has elapsed |
| \`outcome_known\` | 1 if the realized outcome is present, else 0 |

## Loading the dataset

\`\`\`python
import pandas as pd
df = pd.read_csv("stockhuntr-filings.csv")

# Rows suitable for supervised learning (AI features -> realized outcome):
labeled = df[df["outcome_known"] == 1]
print(len(labeled), "filings with a realized 30-day alpha outcome")

# Or stream the JSONL:
# import pandas as pd; df = pd.read_json("stockhuntr-filings.jsonl", lines=True)
\`\`\`

## Methodology

Predictions come from a Ridge-regression mixture-of-experts model (13 features:
price momentum, analyst activity, AI concern/sentiment, EPS surprise, filing type,
tone shift vs. prior filing, and macro regime). Full methodology, backtesting approach,
and accuracy figures: https://www.stockhuntr.net/faq

## Sources

- **Filings:** SEC EDGAR (public domain U.S. government data).
- **Market data:** Yahoo Finance.
- **Macro data:** FRED (Federal Reserve Bank of St. Louis).

## Intended use & limitations

For research and education. **Not investment advice.** Predictions are model outputs
with known error; realized outcomes are provided precisely so the model can be evaluated
honestly. Past performance does not guarantee future results. External data sources may
contain errors, delays, or restatements.

## Citation

\`\`\`
StockHuntr (${s.dateRange.split(' to ')[1] ?? ''}). AI-Analyzed SEC Filings with 30-Day
Predictions & Outcomes. https://www.stockhuntr.net
\`\`\`
`;
}

main()
  .catch((e) => {
    console.error('[export-dataset] Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
