/**
 * @module app/pulse/page
 * @description The "SEC Filing Pulse" — a recurring, cross-market report computed from
 * StockHuntr's analyzed-filing corpus (sector concern heat, the period's most significant
 * filings, strongest signals). Original aggregate data, refreshed on a schedule (ISR),
 * with a visible "as of" date, Article JSON-LD, and disclaimers. Journalist-pitchable.
 * JSON-LD is site-authored with "<" escaped before injection.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { getPulse } from '@/lib/pulse';
import QASection from '@/app/components/QASection';

const SITE_URL = 'https://www.stockhuntr.net';

export const revalidate = 21600; // refresh every 6h

export const metadata: Metadata = {
  title: 'SEC Filing Pulse — Cross-Market Risk & Signal Report',
  description:
    'A recurring data report on SEC filing activity: which sectors are flashing the most concern, the period’s most significant filings, and the strongest 30-day stock signals. Computed by StockHuntr.',
  alternates: { canonical: '/pulse' },
  openGraph: {
    title: 'SEC Filing Pulse — Cross-Market Risk & Signal Report',
    description:
      'Which sectors are flashing the most concern, the most significant filings, and the strongest 30-day signals — from StockHuntr’s analyzed-filing corpus.',
    url: '/pulse',
    type: 'article',
  },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default async function Page() {
  const pulse = await getPulse();
  const asOf = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const asOfIso = new Date().toISOString();

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'SEC Filing Pulse — Cross-Market Risk & Signal Report',
    datePublished: asOfIso,
    dateModified: asOfIso,
    author: { '@type': 'Organization', name: 'StockHuntr', url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'StockHuntr', url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/pulse`,
    description: pulse?.narrative,
  };
  const articleLdString = JSON.stringify(articleLd).replace(/</g, '\\u003c');

  const periodLabel = !pulse
    ? ''
    : pulse.windowDays >= 365
    ? 'trailing 12 months'
    : `last ${pulse.windowDays} days`;

  const qa = pulse
    ? ([
        {
          question: 'What is the SEC Filing Pulse?',
          answer:
            'A recurring report from StockHuntr summarizing recent SEC filing activity: average concern levels, which sectors are flashing the most risk, the most significant individual filings, and the strongest 30-day stock signals — all computed from AI analysis of SEC EDGAR filings.',
        },
        pulse.sectorHeat[0]
          ? {
              question: 'Which sector has the most concerning SEC filings right now?',
              answer: `Over the ${periodLabel}, the ${pulse.sectorHeat[0].name} sector has the highest average concern level (${pulse.sectorHeat[0].avgConcern}/10) across ${pulse.sectorHeat[0].n} analyzed filings. This is research analysis, not investment advice.`,
            }
          : null,
      ].filter(Boolean) as { question: string; answer: string }[])
    : [];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleLdString }} />

      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <h1 className="text-4xl font-bold text-white mb-2">SEC Filing Pulse</h1>
        <p className="text-sm text-gray-500 mb-6">Updated {asOf}{pulse ? ` · ${periodLabel}` : ''}</p>

        {!pulse ? (
          <p className="text-gray-300">The pulse is being generated. Please check back shortly.</p>
        ) : (
          <>
            <p className="text-lg text-gray-300 mb-8 leading-relaxed">{pulse.narrative}</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              <Stat label="Filings analyzed" value={pulse.analyzedCount.toLocaleString()} sub={periodLabel} />
              <Stat label="Avg concern" value={pulse.avgConcern != null ? `${pulse.avgConcern}/10` : '—'} sub="0–10 scale" />
              <Stat label="High concern" value={pulse.highConcernShare != null ? `${Math.round(pulse.highConcernShare * 100)}%` : '—'} sub="7+/10" />
              <Stat label="EPS beats / misses" value={`${pulse.epsBeats} / ${pulse.epsMisses}`} sub="vs consensus" />
            </div>

            {pulse.sectorHeat.length > 0 && (
              <section className="mb-10">
                <h2 className="text-2xl font-bold text-white mb-4">Sector concern heat</h2>
                <p className="text-gray-400 mb-4">Average concern level by sector, highest first.</p>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {pulse.sectorHeat.map((s) => (
                      <tr key={s.slug} className="border-b border-white/5">
                        <td className="py-2">
                          <Link href={`/sectors/${s.slug}`} className="text-teal-400 hover:underline">{s.name}</Link>
                        </td>
                        <td className="py-2 text-right text-white font-medium w-24">{s.avgConcern}/10</td>
                        <td className="py-2 text-right text-gray-500 w-24">{s.n} filings</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {pulse.significantFilings.length > 0 && (
              <section className="mb-10">
                <h2 className="text-2xl font-bold text-white mb-4">Most significant filings</h2>
                <ul className="space-y-2">
                  {pulse.significantFilings.map((f) => (
                    <li key={f.accessionNumber} className="text-gray-300">
                      <Link href={`/filing/${f.accessionNumber}`} className="text-teal-400 hover:underline font-medium">
                        {f.ticker} {f.filingType}
                      </Link>{' '}
                      <span className="text-gray-500">— {fmtDate(f.filingDate)}</span>
                      {f.concernLevel != null && <span className="text-gray-400"> · concern {f.concernLevel.toFixed(1)}/10</span>}
                      {f.netAssessment && <span className="text-gray-500"> · {f.netAssessment}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {pulse.topSignals.length > 0 && (
              <section className="mb-10">
                <h2 className="text-2xl font-bold text-white mb-4">
                  Strongest 30-day signals
                  {Math.abs(pulse.topSignals[0].predicted30dAlpha) < 0.25 && (
                    <span className="ml-2 text-sm font-normal text-gray-500">· low-conviction window</span>
                  )}
                </h2>
                <ul className="space-y-2">
                  {pulse.topSignals.map((s) => (
                    <li key={s.accessionNumber} className="text-gray-300">
                      <Link href={`/filing/${s.accessionNumber}`} className="text-teal-400 hover:underline font-medium">
                        {s.ticker} {s.filingType}
                      </Link>{' '}
                      <span className="text-gray-500">— {fmtDate(s.filingDate)}</span>{' '}
                      <span className={s.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}>
                        {s.direction} {s.predicted30dAlpha >= 0 ? '+' : ''}{s.predicted30dAlpha.toFixed(1)}% alpha
                      </span>
                      <span className="text-gray-500"> · {Math.round(s.confidence * 100)}% conf</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <QASection heading="About the Pulse" items={qa} note="Computed from StockHuntr's analyzed-filing corpus. Not investment advice." />

            <div className="mt-8 pt-6 border-t border-white/10 text-sm text-gray-400">
              Dig into a{' '}
              <Link href="/sectors" className="text-teal-400 hover:underline">sector</Link>, the{' '}
              <Link href="/latest-filings" className="text-teal-400 hover:underline">latest filings</Link>, or{' '}
              <Link href="/learn" className="text-teal-400 hover:underline">how to read SEC filings</Link>.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-[rgba(15,23,42,0.7)] border border-white/10 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{sub}</div>
    </div>
  );
}
