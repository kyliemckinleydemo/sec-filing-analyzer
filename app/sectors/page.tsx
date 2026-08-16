/**
 * @module app/sectors/page
 * @description Index of sector insight pages — a comparison table of StockHuntr's
 * aggregate analysis across all sectors (filings analyzed, average concern, model
 * accuracy). Original cross-sectional data; server-rendered.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllSectorSummaries } from '@/lib/sector-insights';

export const revalidate = 21600;

export const metadata: Metadata = {
  title: 'SEC Filings by Sector — Risk, Sentiment & Model Accuracy',
  description:
    'Compare SEC filing risk, concern levels, and StockHuntr 30-day prediction accuracy across all market sectors — Technology, Financials, Health Care, Energy, and more.',
  alternates: { canonical: '/sectors' },
};

function pct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n * 100)}%`;
}

export default async function Page() {
  const sectors = await getAllSectorSummaries();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <h1 className="text-4xl font-bold text-white mb-3">SEC Filings by Sector</h1>
        <p className="text-lg text-gray-300 mb-8 max-w-2xl">
          How risk, concern, and stock-prediction accuracy differ across market sectors — computed from
          StockHuntr&apos;s corpus of AI-analyzed SEC filings. Pick a sector for the full breakdown.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-white/10">
                <th className="py-3 pr-4">Sector</th>
                <th className="py-3 px-2 text-right">Filings analyzed</th>
                <th className="py-3 px-2 text-right">Avg concern</th>
                <th className="py-3 px-2 text-right">Model accuracy</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((s) => (
                <tr key={s.slug} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 pr-4">
                    <Link href={`/sectors/${s.slug}`} className="text-teal-400 hover:underline font-medium">
                      {s.name}
                    </Link>
                  </td>
                  <td className="py-3 px-2 text-right text-white">{s.analyzedFilings.toLocaleString()}</td>
                  <td className="py-3 px-2 text-right text-gray-300">{s.avgConcern != null ? `${s.avgConcern}/10` : '—'}</td>
                  <td className="py-3 px-2 text-right text-gray-300">{pct(s.directionalAccuracy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Model accuracy is directional accuracy on filings whose 30-day window has elapsed. For research and
          education only — not investment advice.
        </p>

        <div className="mt-8 pt-6 border-t border-white/10 text-sm text-gray-400">
          See the{' '}
          <Link href="/latest-filings" className="text-teal-400 hover:underline">latest filings</Link> or{' '}
          <Link href="/learn" className="text-teal-400 hover:underline">learn how to read SEC filings</Link>.
        </div>
      </div>
    </div>
  );
}
