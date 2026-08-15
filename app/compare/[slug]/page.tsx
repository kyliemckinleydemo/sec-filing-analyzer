/**
 * @module app/compare/[slug]/page
 * @description Individual comparison page (e.g., "Fintool vs StockHuntr"). Server component.
 * Leads with the direct-answer block (extracted by AI answer engines), then a side-by-side
 * comparison table, a "who each is for" section, related questions, a last-updated date, and
 * an educational disclaimer. Emits Article + FAQPage JSON-LD.
 *
 * JSON-LD is site-authored and "<" is escaped per Next.js guidance before injection into a
 * <script type="application/ld+json"> tag.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QASection from '@/app/components/QASection';
import { comparisons, getComparison } from '../comparisons';

const SITE_URL = 'https://www.stockhuntr.net';

export function generateStaticParams(): { slug: string }[] {
  return comparisons.map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const comparison = getComparison(params.slug);
  if (!comparison) {
    return { title: 'Not found' };
  }
  return {
    // Root layout's title template appends " | StockHuntr" — don't double it.
    title: comparison.title,
    description: comparison.directAnswer,
    alternates: { canonical: `/compare/${comparison.slug}` },
  };
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ComparisonPage({ params }: { params: { slug: string } }) {
  const comparison = getComparison(params.slug);
  if (!comparison) {
    notFound();
  }

  const canonicalUrl = `${SITE_URL}/compare/${comparison.slug}`;
  const isoDateTime = `${comparison.updated}T00:00:00Z`;

  // Article JSON-LD — site-authored editorial comparison.
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: comparison.title,
    description: comparison.directAnswer,
    datePublished: isoDateTime,
    dateModified: isoDateTime,
    author: { '@type': 'Organization', name: 'StockHuntr' },
    publisher: { '@type': 'Organization', name: 'StockHuntr' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    url: canonicalUrl,
  };

  // FAQPage JSON-LD wrapping the query as the question + the direct answer. One FAQPage per page.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: comparison.title,
        acceptedAnswer: { '@type': 'Answer', text: comparison.directAnswer },
      },
    ],
  };

  // Escape "<" per Next.js guidance before injecting into script tags.
  const articleJsonLdString = JSON.stringify(articleJsonLd).replace(/</g, '\\u003c');
  const faqJsonLdString = JSON.stringify(faqJsonLd).replace(/</g, '\\u003c');

  // Related questions for the QASection: the "who each is for" framing, phrased as questions.
  const relatedQA = [
    {
      question: `Who is StockHuntr for?`,
      answer: comparison.whoForStockHuntr,
    },
    {
      question: `Who are ${comparison.competitors.join(', ')} for?`,
      answer: comparison.whoForOthers,
    },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: articleJsonLdString }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqJsonLdString }}
      />

      <article className="container mx-auto px-4 py-10 max-w-4xl">
        <nav className="mb-6 text-sm text-gray-400">
          <Link href="/compare" className="hover:text-white">
            ← All comparisons
          </Link>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold mb-6 text-white leading-tight">
          {comparison.title}
        </h1>

        {/* Direct-answer block — the concise answer AI engines extract, shown first. */}
        <div className="mb-10 rounded-xl border border-white/[0.14] bg-[rgba(15,23,42,0.96)] p-5">
          <p className="text-lg text-gray-100 leading-relaxed">{comparison.directAnswer}</p>
        </div>

        {/* Comparison table: dimension rows × StockHuntr + each competitor. */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-4">Side-by-side comparison</h2>
          <div className="overflow-x-auto rounded-xl border border-white/[0.14]">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-white/[0.14] bg-[rgba(15,23,42,0.96)]">
                  <th className="px-4 py-3 font-semibold text-gray-300">Dimension</th>
                  <th className="px-4 py-3 font-semibold text-teal-400">StockHuntr</th>
                  {comparison.competitors.map((name) => (
                    <th key={name} className="px-4 py-3 font-semibold text-white">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.dimensions.map((dim, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-white/[0.08] last:border-0 align-top"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 font-medium text-gray-200 whitespace-nowrap"
                    >
                      {dim.label}
                    </th>
                    <td className="px-4 py-3 text-gray-300">{dim.stockhuntr}</td>
                    {comparison.competitors.map((name) => (
                      <td key={name} className="px-4 py-3 text-gray-300">
                        {dim.others[name] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Who each is for */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-4">Who each is for</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.14] bg-[rgba(15,23,42,0.96)] p-5">
              <h3 className="text-lg font-semibold text-teal-400 mb-2">StockHuntr</h3>
              <p className="text-gray-300 leading-relaxed">{comparison.whoForStockHuntr}</p>
            </div>
            <div className="rounded-xl border border-white/[0.14] bg-[rgba(15,23,42,0.96)] p-5">
              <h3 className="text-lg font-semibold text-white mb-2">
                {comparison.competitors.join(', ')}
              </h3>
              <p className="text-gray-300 leading-relaxed">{comparison.whoForOthers}</p>
            </div>
          </div>
        </section>

        {/* Related questions — reuse QASection but do NOT emit a second FAQPage schema. */}
        <QASection heading="Related questions" emitSchema={false} items={relatedQA} />

        {/* Explore other comparisons */}
        <div className="mt-4">
          <h2 className="text-xl font-semibold text-white mb-3">Other comparisons</h2>
          <ul className="list-disc list-inside space-y-1">
            {comparisons
              .filter((c) => c.slug !== comparison.slug)
              .map((c) => (
                <li key={c.slug}>
                  <Link href={`/compare/${c.slug}`} className="text-teal-400 hover:underline">
                    {c.title}
                  </Link>
                </li>
              ))}
          </ul>
        </div>

        {/* Last updated */}
        <p className="mt-10 text-sm text-gray-400">
          Last updated:{' '}
          <time dateTime={comparison.updated}>{formatDate(comparison.updated)}</time>
        </p>

        {/* Educational disclaimer */}
        <footer className="mt-6 border-t border-white/10 pt-6">
          <p className="text-xs text-gray-500 leading-relaxed">
            This comparison is provided by StockHuntr for educational and informational purposes
            only. Details about third-party products are based on publicly available information and
            may change over time; always verify current pricing and features directly with each
            provider. Nothing here constitutes investment, financial, legal, or tax advice, nor a
            recommendation to buy or sell any security or subscribe to any service.
          </p>
        </footer>
      </article>
    </div>
  );
}
