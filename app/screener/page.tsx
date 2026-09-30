import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { CANONICAL_SECTORS } from '@/lib/sectors';

/**
 * @module app/screener/page
 * @description A real, server-rendered free stock screener. It reads filter values from
 * the URL query string, runs an actual Prisma query against the tracked-company universe,
 * and renders the matching companies (each linking to its company page). It works with no
 * JavaScript via a native GET <form>, so it is fully crawlable and genuinely functional —
 * not a doorway. All filtered variants canonicalize to /screener to avoid query-param
 * index bloat (penalty-safe).
 */

export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Free Stock Screener — Filter 800+ Companies by Fundamentals',
  description:
    'Free stock screener over 800+ US companies (all S&P 500 constituents). Filter by sector, market cap, P/E, dividend yield, and revenue growth — with links to AI-analyzed SEC filings for each result. Grounded in Yahoo Finance + SEC EDGAR data.',
  alternates: { canonical: '/screener' },
  openGraph: {
    title: 'Free Stock Screener — Filter 800+ Companies by Fundamentals',
    description:
      'Filter 800+ US companies by sector, market cap, P/E, dividend yield, and revenue growth. Free, with links to AI-analyzed SEC filings.',
    url: 'https://www.stockhuntr.net/screener',
    type: 'website',
  },
};

type SP = Record<string, string | string[] | undefined>;

function num(v: string | string[] | undefined): number | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: string | string[] | undefined): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

// nulls: 'last' so companies missing the sorted metric (often stale/delisted) never
// dominate the top of a view — Postgres otherwise sorts NULLs first on DESC.
const SORTS: Record<string, { orderBy: any; label: string }> = {
  marketcap: { orderBy: { marketCap: { sort: 'desc', nulls: 'last' } }, label: 'Market cap (high→low)' },
  yield: { orderBy: { dividendYield: { sort: 'desc', nulls: 'last' } }, label: 'Dividend yield (high→low)' },
  pe: { orderBy: { peRatio: { sort: 'asc', nulls: 'last' } }, label: 'P/E (low→high)' },
  growth: { orderBy: { revenueGrowth: { sort: 'desc', nulls: 'last' } }, label: 'Revenue growth (high→low)' },
};

function fmtB(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}
function fmtPct(v: number | null | undefined): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}
function fmtNum(v: number | null | undefined, d = 1): string {
  return v == null ? '—' : v.toFixed(d);
}

async function runScreen(sp: SP) {
  const sector = str(sp.sector);
  const minCapB = num(sp.minCap); // billions
  const maxPe = num(sp.maxPe);
  const minYieldPct = num(sp.minYield); // percent, e.g. 3 for 3%
  const minGrowthPct = num(sp.minGrowth); // percent
  const sortKey = str(sp.sort) && SORTS[str(sp.sort)!] ? str(sp.sort)! : 'marketcap';

  const AND: any[] = [];
  if (sector) AND.push({ sector: { equals: sector } });
  if (minCapB != null) AND.push({ marketCap: { gte: minCapB * 1e9 } });
  if (maxPe != null) AND.push({ peRatio: { lte: maxPe, gt: 0 } });
  if (minYieldPct != null) AND.push({ dividendYield: { gte: minYieldPct / 100 } });
  if (minGrowthPct != null) AND.push({ revenueGrowth: { gte: minGrowthPct / 100 } });

  const where = AND.length ? { AND } : {};
  try {
    const [rows, total] = await Promise.all([
      prisma.company.findMany({
        where,
        orderBy: SORTS[sortKey].orderBy,
        take: 50,
        select: {
          ticker: true,
          name: true,
          sector: true,
          currentPrice: true,
          marketCap: true,
          peRatio: true,
          dividendYield: true,
          revenueGrowth: true,
        },
      }),
      prisma.company.count({ where }),
    ]);
    return { rows, total, sortKey, filters: { sector, minCapB, maxPe, minYieldPct, minGrowthPct } };
  } catch (error) {
    console.error('screener: db query failed', error);
    return { rows: [], total: 0, sortKey, filters: { sector, minCapB, maxPe, minYieldPct, minGrowthPct } };
  }
}

const PRESETS: Array<{ href: string; label: string }> = [
  { href: '/screener?minCap=10&minYield=3&sort=yield', label: 'Large-cap dividend payers (>3%)' },
  { href: '/screener?minCap=10&maxPe=15&sort=pe', label: 'Large-cap value (P/E < 15)' },
  { href: '/screener?minGrowth=20&sort=growth', label: 'High revenue growth (>20%)' },
  { href: '/screener?sector=Information Technology&minCap=10&sort=marketcap', label: 'Large-cap technology' },
  { href: '/screener?sector=Energy&sort=marketcap', label: 'Energy sector' },
];

export default async function ScreenerPage({ searchParams }: { searchParams: SP }) {
  const { rows, total, sortKey, filters } = await runScreen(searchParams);
  const f = filters;

  return (
    <main className="min-h-screen bg-[#020617] text-gray-200">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-white">Free Stock Screener</h1>
        <p className="mt-3 text-gray-300 leading-relaxed">
          Filter 800+ US companies (all S&P 500 constituents) by sector, market cap, valuation,
          dividend yield, and growth. Every result links to that company&apos;s page with
          AI-analyzed SEC filings and a risk read. Fundamentals from Yahoo Finance; filings from
          SEC EDGAR. For research and education only — not investment advice.
        </p>

        {/* Presets */}
        <div className="mt-6 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:border-white/25"
            >
              {p.label}
            </Link>
          ))}
        </div>

        {/* Filter form — native GET, works with no JS */}
        <form method="get" action="/screener" className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-400">Sector</span>
            <select
              name="sector"
              defaultValue={f.sector ?? ''}
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-gray-100"
            >
              <option value="">Any sector</option>
              {CANONICAL_SECTORS.map((s) => (
                <option key={s.slug} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-400">Min market cap ($B)</span>
            <input
              type="number"
              name="minCap"
              min="0"
              step="1"
              defaultValue={f.minCapB ?? ''}
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-gray-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-400">Max P/E</span>
            <input
              type="number"
              name="maxPe"
              min="0"
              step="1"
              defaultValue={f.maxPe ?? ''}
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-gray-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-400">Min dividend yield (%)</span>
            <input
              type="number"
              name="minYield"
              min="0"
              step="0.5"
              defaultValue={f.minYieldPct ?? ''}
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-gray-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-400">Min revenue growth (%)</span>
            <input
              type="number"
              name="minGrowth"
              step="1"
              defaultValue={f.minGrowthPct ?? ''}
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-gray-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-400">Sort by</span>
            <select
              name="sort"
              defaultValue={sortKey}
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-gray-100"
            >
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2 md:col-span-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2.5 font-semibold text-white"
            >
              Screen stocks
            </button>
          </div>
        </form>

        {/* Results */}
        <h2 className="mt-10 text-xl font-bold text-white">
          {total} {total === 1 ? 'company' : 'companies'} match
          {rows.length < total ? ` (showing top ${rows.length})` : ''}
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/15 text-left text-gray-400">
                <th className="py-2 pr-3 font-normal">Ticker</th>
                <th className="py-2 pr-3 font-normal">Company</th>
                <th className="py-2 pr-3 font-normal">Sector</th>
                <th className="py-2 pr-3 font-normal text-right">Price</th>
                <th className="py-2 pr-3 font-normal text-right">Market cap</th>
                <th className="py-2 pr-3 font-normal text-right">P/E</th>
                <th className="py-2 pr-3 font-normal text-right">Yield</th>
                <th className="py-2 font-normal text-right">Rev. growth</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.ticker} className="border-b border-white/5">
                  <td className="py-2 pr-3">
                    <Link href={`/company/${c.ticker}`} className="font-semibold text-blue-300 hover:text-blue-200">
                      {c.ticker}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-gray-300">{c.name}</td>
                  <td className="py-2 pr-3 text-gray-400">{c.sector ?? '—'}</td>
                  <td className="py-2 pr-3 text-right text-gray-300">
                    {c.currentPrice != null ? `$${c.currentPrice.toFixed(2)}` : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-300">{fmtB(c.marketCap)}</td>
                  <td className="py-2 pr-3 text-right text-gray-300">{fmtNum(c.peRatio)}</td>
                  <td className="py-2 pr-3 text-right text-gray-300">{fmtPct(c.dividendYield)}</td>
                  <td className="py-2 text-right text-gray-300">{fmtPct(c.revenueGrowth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="mt-4 text-gray-400">No companies match these filters. Try widening them.</p>
          )}
        </div>

        <p className="mt-8 text-xs text-gray-500">
          Data from Yahoo Finance (fundamentals) and SEC EDGAR (filings), updated regularly. Figures
          may lag or contain errors. For research and education only. Nothing here is investment advice.
        </p>
      </div>
    </main>
  );
}
