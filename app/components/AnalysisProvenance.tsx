/**
 * @module app/components/AnalysisProvenance
 * @description Server-rendered E-E-A-T / provenance block for analysis pages
 * (filing, company). Makes the trust signals search engines and AI answer engines
 * look for on YMYL finance content explicit and crawlable: the primary source
 * (a real outbound link to SEC EDGAR), the analysis date, the publisher, a link
 * to the methodology, and the "not investment advice" disclaimer.
 *
 * Deliberately compact and factual — no templated filler — so it strengthens
 * expertise/trust signals without adding scaled-content-abuse risk.
 */
import Link from 'next/link';

interface AnalysisProvenanceProps {
  /** When the underlying data/analysis is dated (e.g. filing date, last update). */
  asOf?: Date | string | null;
  /** Absolute URL to the primary source on SEC EDGAR. */
  edgarUrl?: string | null;
  /** Link text for the EDGAR source, e.g. "View this 10-Q on SEC EDGAR". */
  edgarLabel?: string;
  /** Additional data sources beyond EDGAR, e.g. ["Yahoo Finance"]. */
  extraSources?: string[];
}

function formatAsOf(asOf?: Date | string | null): string | null {
  if (!asOf) return null;
  const d = typeof asOf === 'string' ? new Date(asOf) : asOf;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function AnalysisProvenance({
  asOf,
  edgarUrl,
  edgarLabel = 'View the primary source on SEC EDGAR',
  extraSources = [],
}: AnalysisProvenanceProps) {
  const asOfStr = formatAsOf(asOf);

  return (
    <section
      className="mx-auto max-w-4xl px-4 py-6"
      aria-label="About this analysis"
    >
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5 text-sm text-gray-400">
        <h2 className="text-base font-semibold text-gray-200 mb-3">About this analysis</h2>
        <dl className="space-y-2">
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-gray-300">Primary source:</dt>
            <dd>
              {edgarUrl ? (
                <a
                  href={edgarUrl}
                  target="_blank"
                  rel="noopener"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  {edgarLabel}
                </a>
              ) : (
                'U.S. SEC EDGAR primary-source filings'
              )}
            </dd>
          </div>
          {extraSources.length > 0 && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-gray-300">Additional data:</dt>
              <dd>{extraSources.join(', ')}</dd>
            </div>
          )}
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-gray-300">Method:</dt>
            <dd>
              StockHuntr analyzes filings with AI —{' '}
              <Link href="/faq" className="text-blue-400 hover:text-blue-300 underline">
                see our methodology
              </Link>
              .
            </dd>
          </div>
          {asOfStr && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-gray-300">Analysis as of:</dt>
              <dd>{asOfStr}</dd>
            </div>
          )}
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-gray-300">Published by:</dt>
            <dd>StockHuntr</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-gray-500">
          For research and education only. Nothing here is investment advice.
        </p>
      </div>
    </section>
  );
}
