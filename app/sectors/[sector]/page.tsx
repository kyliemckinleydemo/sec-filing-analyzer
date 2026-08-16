/**
 * @module app/sectors/[sector]/page
 * @description Sector insight page — original, aggregate analysis computed from
 * StockHuntr's analyzed-filing corpus (concern/sentiment levels, filing mix, the model's
 * directional accuracy in that sector, notable recent filings). Differentiated original
 * data (each sector genuinely differs), server-rendered with FAQPage + Dataset schema.
 * JSON-LD is site-authored aggregate data with "<" escaped before injection.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CANONICAL_SECTORS, sectorBySlug } from '@/lib/sectors';
import { getSectorInsights } from '@/lib/sector-insights';
import { buildSectorQA } from '@/lib/qa-builders';
import QASection from '@/app/components/QASection';

const SITE_URL = 'https://www.stockhuntr.net';

export const revalidate = 21600; // 6h — aggregates shift slowly

export function generateStaticParams() {
  return CANONICAL_SECTORS.map((s) => ({ sector: s.slug }));
}

export function generateMetadata({ params }: { params: { sector: string } }): Metadata {
  const sector = sectorBySlug(params.sector);
  if (!sector) return { title: 'Sector Insights' };
  const title = `${sector.name} Sector — SEC Filing Insights & Model Accuracy`;
  const description = `Aggregate analysis of ${sector.name} SEC filings: average risk/concern levels, filing mix, and StockHuntr's 30-day prediction accuracy for the sector. ${sector.blurb}`;
  return {
    title,
    description,
    alternates: { canonical: `/sectors/${sector.slug}` },
    openGraph: { title, description, url: `/sectors/${sector.slug}`, type: 'article' },
    twitter: { card: 'summary', title, description },
  };
}

function pct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n * 100)}%`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default async function Page({ params }: { params: { sector: string } }) {
  const sector = sectorBySlug(params.sector);
  if (!sector) notFound();

  const s = await getSectorInsights(params.sector);
  if (!s) notFound();

  const qa = buildSectorQA(s);

  const datasetLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${s.name} SEC Filing Analysis — StockHuntr`,
    description: `Aggregate AI analysis of ${s.analyzedFilings} SEC filings from ${s.companyCount} ${s.name} companies: concern levels, sentiment, filing mix, and 30-day prediction accuracy.`,
    url: `${SITE_URL}/sectors/${s.slug}`,
    creator: { '@type': 'Organization', name: 'StockHuntr', url: SITE_URL },
    isAccessibleForFree: true,
    keywords: [s.name, 'SEC filings', 'stock analysis', 'sector analysis'],
  };
  const datasetLdString = JSON.stringify(datasetLd).replace(/</g, '\\u003c');

  const concernLabel =
    s.avgConcern == null ? 'n/a' : s.avgConcern <= 2.5 ? 'low' : s.avgConcern <= 5 ? 'moderate' : s.avgConcern <= 7.5 ? 'elevated' : 'high';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: datasetLdString }} />

      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <nav className="text-sm text-gray-400 mb-4">
          <Link href="/sectors" className="hover:text-white">Sectors</Link> <span className="mx-1">/</span> {s.name}
        </nav>

        <h1 className="text-4xl font-bold text-white mb-3">{s.name} Sector — SEC Filing Insights</h1>
        <p className="text-lg text-gray-300 mb-2">{s.blurb}</p>
        <p className="text-gray-400 mb-8">
          Based on <strong className="text-white">{s.analyzedFilings.toLocaleString()}</strong> AI-analyzed SEC
          filings from <strong className="text-white">{s.companyCount}</strong> {s.name} companies tracked on StockHuntr.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <Stat label="Avg concern" value={s.avgConcern != null ? `${s.avgConcern}/10` : '—'} sub={concernLabel} />
          <Stat label="Avg sentiment" value={s.avgSentiment != null ? s.avgSentiment.toFixed(2) : '—'} sub="-1 to +1" />
          <Stat label="Model accuracy" value={pct(s.model.directionalAccuracy)} sub={`${s.model.pairs} outcomes`} />
          <Stat label="8-K share" value={pct(s.eightKShare)} sub="of filings" />
        </div>

        <section className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-4">Risk & concern distribution</h2>
          <p className="text-gray-300 mb-4">
            Of {s.analyzedFilings.toLocaleString()} analyzed {s.name} filings, here is how StockHuntr's concern
            score (0–10, where higher signals more material risk) breaks down:
          </p>
          <table className="w-full text-sm border-collapse">
            <tbody>
              <DistRow label="Low (0–2.5)" n={s.concernDistribution.low} total={s.analyzedFilings} />
              <DistRow label="Moderate (2.5–5)" n={s.concernDistribution.moderate} total={s.analyzedFilings} />
              <DistRow label="Elevated (5–7.5)" n={s.concernDistribution.elevated} total={s.analyzedFilings} />
              <DistRow label="High (7.5–10)" n={s.concernDistribution.high} total={s.analyzedFilings} />
            </tbody>
          </table>
        </section>

        {s.model.pairs > 0 && (
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-white mb-4">How the model performs in {s.name}</h2>
            <p className="text-gray-300">
              Across {s.model.pairs} {s.name} filings whose 30-day window has elapsed, StockHuntr's directional
              accuracy is <strong className="text-white">{pct(s.model.directionalAccuracy)}</strong>
              {s.model.avgPredictedAlpha != null && (
                <> , with an average predicted 30-day alpha of <strong className="text-white">{s.model.avgPredictedAlpha}%</strong> relative to the S&amp;P 500</>
              )}
              . This is model analysis for research, not investment advice.
            </p>
          </section>
        )}

        {s.notableRecent.length > 0 && (
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-white mb-4">Recent {s.name} filings analyzed</h2>
            <ul className="space-y-2">
              {s.notableRecent.map((f) => (
                <li key={f.accessionNumber} className="text-gray-300">
                  <Link href={`/filing/${f.accessionNumber}`} className="text-teal-400 hover:underline font-medium">
                    {f.ticker} {f.filingType}
                  </Link>{' '}
                  <span className="text-gray-400">— {fmtDate(f.filingDate)}</span>
                  {f.netAssessment && <span className="text-gray-400"> · {f.netAssessment}</span>}
                  {f.concernLevel != null && <span className="text-gray-400"> · concern {f.concernLevel.toFixed(1)}/10</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <QASection
          heading={`${s.name} sector — key questions`}
          items={qa}
          note="Answers are computed from StockHuntr's analyzed-filing corpus. Not investment advice."
        />

        <div className="mt-10 pt-6 border-t border-white/10 text-sm text-gray-400">
          Explore other{' '}
          <Link href="/sectors" className="text-teal-400 hover:underline">sectors</Link>, browse the{' '}
          <Link href="/latest-filings" className="text-teal-400 hover:underline">latest filings</Link>, or{' '}
          <Link href="/learn" className="text-teal-400 hover:underline">learn how to read SEC filings</Link>.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-[rgba(15,23,42,0.7)] border border-white/10 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{sub}</div>
    </div>
  );
}

function DistRow({ label, n, total }: { label: string; n: number; total: number }) {
  const p = total ? Math.round((n / total) * 100) : 0;
  return (
    <tr className="border-b border-white/5">
      <td className="py-2 text-gray-300">{label}</td>
      <td className="py-2 text-right text-white font-medium w-20">{n.toLocaleString()}</td>
      <td className="py-2 text-right text-gray-400 w-16">{p}%</td>
    </tr>
  );
}
