/**
 * @module app/components/RelatedCompanies
 * @description Server-rendered "related companies in the same sector" link block for
 * company pages. Every link is a real same-sector peer (by market cap), so it genuinely
 * helps a reader explore neighbours AND cross-links the ~800 company pages to aid crawl
 * discovery (supporting indexation of the programmatic company URLs). Not filler — the
 * block only renders when real peers exist.
 */
import Link from 'next/link';

export interface RelatedCompany {
  ticker: string;
  name: string;
}

interface RelatedCompaniesProps {
  sector: string;
  companies: RelatedCompany[];
}

export default function RelatedCompanies({ sector, companies }: RelatedCompaniesProps) {
  if (!companies || companies.length === 0) return null;

  return (
    <section className="mx-auto max-w-4xl px-4 py-8" aria-label={`Other ${sector} companies`}>
      <h2 className="text-xl font-bold text-white mb-4">Other {sector} companies</h2>
      <div className="flex flex-wrap gap-2">
        {companies.map((c) => (
          <Link
            key={c.ticker}
            href={`/company/${c.ticker}`}
            className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-gray-300 hover:text-white hover:border-white/25"
          >
            <span className="font-semibold text-gray-100">{c.ticker}</span>
            <span className="text-gray-400"> · {c.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
