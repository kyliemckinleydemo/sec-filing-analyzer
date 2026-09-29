import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * @module app/dataset/page
 * @description Public landing page for StockHuntr's open CC-BY-4.0 dataset and the
 * remote MCP server. A hand-written, unique page (not templated) intended as a
 * citation/backlink asset for researchers and AI answer engines: it documents the
 * dataset schema, coverage, license, and download links, plus the live MCP endpoint
 * and its tools. Emits schema.org/Dataset JSON-LD so search + AI engines recognize it
 * as a citable dataset. Stats are a point-in-time snapshot (see "as of" below).
 */

const AS_OF = 'September 25, 2026';
const GENERATED = 'September 28, 2026';
const CSV_URL = 'https://www.stockhuntr.net/downloads/stockhuntr-filings.csv';
const JSONL_URL = 'https://www.stockhuntr.net/downloads/stockhuntr-filings.jsonl';

export const metadata: Metadata = {
  title: 'Open Dataset — AI-Analyzed SEC Filings (CC-BY-4.0) + MCP Server',
  description:
    'Free, open CC-BY-4.0 dataset: 17,500+ SEC filings (10-K, 10-Q, 8-K) with AI concern and sentiment scores and realized 30-day market-relative outcomes. Plus a remote MCP server for AI agents. Download CSV/JSONL, grounded in primary-source SEC EDGAR.',
  alternates: { canonical: '/dataset' },
  openGraph: {
    title: 'Open Dataset — AI-Analyzed SEC Filings (CC-BY-4.0)',
    description:
      '17,500+ SEC filings with AI concern/sentiment scores and realized 30-day outcomes. Free CC-BY-4.0 download (CSV/JSONL) + remote MCP server.',
    url: 'https://www.stockhuntr.net/dataset',
    type: 'website',
  },
};

// schema.org/Dataset structured data — all values are static, site-authored strings
// (no user input). "<" is escaped before injection per Next.js guidance. Same safe
// JSON-LD pattern used across the app (QASection, layout, sectors, learn, compare).
const DATASET_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'StockHuntr: AI-Analyzed SEC Filings with Realized 30-Day Outcomes',
  description:
    'One row per SEC filing (10-K, 10-Q, 8-K) analyzed by StockHuntr, with an AI concern score, a management-sentiment score, EPS/revenue surprise where available, the model’s 30-day alpha prediction, and — where the 30-day window has elapsed — the realized market-relative outcome. Grounded in primary-source SEC EDGAR filings.',
  url: 'https://www.stockhuntr.net/dataset',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  isAccessibleForFree: true,
  creator: { '@type': 'Organization', name: 'StockHuntr', url: 'https://www.stockhuntr.net' },
  temporalCoverage: '2023-12-13/2026-09-25',
  keywords: ['SEC filings', 'EDGAR', 'stock prediction', 'finance', '10-K', '10-Q', '8-K', 'alpha'],
  distribution: [
    { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: CSV_URL },
    { '@type': 'DataDownload', encodingFormat: 'application/x-jsonlines', contentUrl: JSONL_URL },
  ],
};

const STATS: Array<[string, string]> = [
  ['Total analyzed filings', '17,549'],
  ['With AI concern/sentiment features', '17,549'],
  ['With a realized 30-day outcome (label)', '4,009'],
  ['With a persisted live prediction', '3,918'],
  ['Distinct companies', '710'],
  ['Filing date range', '2023-12-13 → 2026-09-25'],
];

const FORMS: Array<[string, string]> = [
  ['8-K', '12,987'],
  ['10-Q', '3,467'],
  ['10-K', '1,094'],
];

const COLUMNS: Array<[string, string]> = [
  ['accession_number', 'SEC EDGAR accession number (unique filing id)'],
  ['ticker', 'Stock ticker'],
  ['company_name', 'Company name'],
  ['sector, industry', 'GICS-style classification (may be null)'],
  ['form_type', '10-K, 10-Q, or 8-K'],
  ['filing_date', 'Date filed with the SEC (YYYY-MM-DD)'],
  ['report_date', 'Period end date, if applicable'],
  ['filing_url', 'Direct link to the filing on SEC EDGAR'],
  ['predicted_30d_alpha', "Model's predicted 30-day return minus S&P 500 (%)"],
  ['predicted_30d_return', "Model's predicted 30-day raw return (%)"],
  ['prediction_confidence', 'Model confidence, 0–1'],
  ['concern_level', 'AI multi-factor concern score, 0–10 (higher = more concerning)'],
  ['sentiment_score', 'AI sentiment of management discussion, -1 to +1'],
  ['eps_surprise_pct', 'Reported EPS vs consensus (%), where available'],
  ['revenue_surprise_pct', 'Reported revenue vs consensus (%), where available'],
  ['actual_30d_alpha', 'Realized 30-day return minus S&P 500 (%), if the window has elapsed'],
  ['actual_30d_return', 'Realized 30-day raw return (%), if the window has elapsed'],
  ['outcome_known', '1 if the realized outcome is present, else 0'],
];

const MCP_TOOLS: Array<[string, string]> = [
  ['get_latest_filings', 'Recent filings, filterable by ticker and form type.'],
  ['get_filing_analysis', 'Full AI analysis for a single filing by accession number.'],
  ['get_company', 'Company snapshot: sector, fundamentals, recent filings.'],
  ['search_companies', 'Find tracked companies by name or ticker.'],
  ['get_top_signals', "The model's highest-conviction 30-day prediction signals."],
  ['get_model_track_record', 'Predicted vs realized outcomes and accuracy.'],
];

export default function DatasetPage() {
  const jsonLdString = JSON.stringify(DATASET_JSONLD).replace(/</g, '\\u003c');
  return (
    <main className="min-h-screen bg-[#020617] text-gray-200">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString }} />
      <div className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-white">
          Open Dataset: AI-Analyzed SEC Filings with 30-Day Outcomes
        </h1>
        <p className="mt-4 text-lg text-gray-300 leading-relaxed">
          StockHuntr publishes a free, open dataset of SEC filings analyzed by AI — one row per
          10-K, 10-Q, or 8-K, each carrying an AI concern score, a management-sentiment score, and
          (where the 30-day window has elapsed) the <strong>realized</strong> 30-day market-relative
          return. That pairing of AI-derived features with a realized market label makes it a
          ready supervised-learning dataset for studying how filing content relates to subsequent
          returns. Released under{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            CC-BY-4.0
          </a>
          . Snapshot as of {AS_OF} (generated {GENERATED}).
        </p>

        {/* Downloads */}
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={CSV_URL}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-3 font-semibold text-white"
            download
          >
            Download CSV (~3 MB)
          </a>
          <a
            href={JSONL_URL}
            className="rounded-lg border border-white/20 hover:bg-white/5 px-5 py-3 font-semibold text-white"
            download
          >
            Download JSONL (~9 MB)
          </a>
        </div>

        {/* At a glance */}
        <h2 className="mt-12 text-2xl font-bold text-white">At a glance</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <table className="w-full text-sm">
            <tbody>
              {STATS.map(([k, v]) => (
                <tr key={k} className="border-b border-white/10">
                  <td className="py-2 pr-4 text-gray-400">{k}</td>
                  <td className="py-2 font-medium text-gray-100">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full text-sm self-start">
            <thead>
              <tr className="border-b border-white/10 text-left text-gray-400">
                <th className="py-2 font-normal">Form type</th>
                <th className="py-2 font-normal">Count</th>
              </tr>
            </thead>
            <tbody>
              {FORMS.map(([k, v]) => (
                <tr key={k} className="border-b border-white/10">
                  <td className="py-2 pr-4 text-gray-300">{k}</td>
                  <td className="py-2 font-medium text-gray-100">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Columns */}
        <h2 className="mt-12 text-2xl font-bold text-white">Columns</h2>
        <p className="mt-2 text-sm text-gray-400">
          Both files carry the same columns; JSONL is one JSON object per line.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {COLUMNS.map(([c, d]) => (
                <tr key={c} className="border-b border-white/10 align-top">
                  <td className="py-2 pr-4 font-mono text-blue-300 whitespace-nowrap">{c}</td>
                  <td className="py-2 text-gray-300">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* MCP server */}
        <h2 className="mt-12 text-2xl font-bold text-white">Live data via the MCP server</h2>
        <p className="mt-2 text-gray-300 leading-relaxed">
          For programmatic and agent access to live data, StockHuntr runs a remote{' '}
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noopener"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Model Context Protocol
          </a>{' '}
          (MCP) server. Point any MCP-aware client (Claude, ChatGPT, or your own agent) at:
        </p>
        <pre className="mt-3 rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-gray-200 overflow-x-auto">
          https://www.stockhuntr.net/api/mcp
        </pre>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {MCP_TOOLS.map(([t, d]) => (
                <tr key={t} className="border-b border-white/10 align-top">
                  <td className="py-2 pr-4 font-mono text-blue-300 whitespace-nowrap">{t}</td>
                  <td className="py-2 text-gray-300">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Methodology / sources / citation */}
        <h2 className="mt-12 text-2xl font-bold text-white">Methodology &amp; sources</h2>
        <p className="mt-2 text-gray-300 leading-relaxed">
          Predictions come from a Ridge-regression mixture-of-experts model (price momentum,
          analyst activity, AI concern/sentiment, EPS surprise, filing type, tone shift vs. the
          prior filing, and macro regime). Full methodology and accuracy figures are on the{' '}
          <Link href="/faq" className="text-blue-400 hover:text-blue-300 underline">
            FAQ &amp; methodology
          </Link>{' '}
          page. Filings come from SEC EDGAR (public-domain U.S. government data); market data from
          Yahoo Finance; macro data from FRED.
        </p>

        <h2 className="mt-12 text-2xl font-bold text-white">How to cite</h2>
        <pre className="mt-3 rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-gray-200 whitespace-pre-wrap">
{`StockHuntr (2026). AI-Analyzed SEC Filings with 30-Day
Predictions & Outcomes. CC-BY-4.0. https://www.stockhuntr.net/dataset`}
        </pre>

        <p className="mt-10 text-xs text-gray-500">
          For research and education only. Nothing here is investment advice. Predictions are model
          outputs with known error; realized outcomes are included precisely so the model can be
          evaluated honestly. Past performance does not guarantee future results.
        </p>
      </div>
    </main>
  );
}
