/**
 * @module app/learn/[slug]/page
 * @description Individual SEC-filing explainer page. Server component. Leads with the
 * direct-answer block (extracted by AI answer engines), then depth sections, related links,
 * a last-updated date, and an educational disclaimer. Emits Article + FAQPage JSON-LD.
 *
 * JSON-LD is site-authored and "<" is escaped per Next.js guidance before injection into
 * a <script type="application/ld+json"> tag.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QASection from '@/app/components/QASection';
import { explainers, getExplainer } from '../explainers';

const SITE_URL = 'https://www.stockhuntr.net';

export function generateStaticParams(): { slug: string }[] {
  return explainers.map((e) => ({ slug: e.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const explainer = getExplainer(params.slug);
  if (!explainer) {
    return { title: 'Not found' };
  }
  return {
    // Root layout's title template appends " | StockHuntr" — don't double it.
    title: explainer.question,
    description: explainer.shortAnswer,
    alternates: { canonical: `/learn/${explainer.slug}` },
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

export default function ExplainerPage({ params }: { params: { slug: string } }) {
  const explainer = getExplainer(params.slug);
  if (!explainer) {
    notFound();
  }

  const canonicalUrl = `${SITE_URL}/learn/${explainer.slug}`;
  const isoDateTime = `${explainer.updated}T00:00:00Z`;

  // Article JSON-LD — site-authored educational article.
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: explainer.question,
    description: explainer.shortAnswer,
    datePublished: isoDateTime,
    dateModified: isoDateTime,
    author: { '@type': 'Organization', name: 'StockHuntr' },
    publisher: { '@type': 'Organization', name: 'StockHuntr' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    url: canonicalUrl,
  };

  // FAQPage JSON-LD wrapping the question + direct answer. This is the ONE FAQPage per page.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: explainer.question,
        acceptedAnswer: { '@type': 'Answer', text: explainer.shortAnswer },
      },
    ],
  };

  // Escape "<" per Next.js guidance before injecting into script tags.
  const articleJsonLdString = JSON.stringify(articleJsonLd).replace(/</g, '\\u003c');
  const faqJsonLdString = JSON.stringify(faqJsonLd).replace(/</g, '\\u003c');

  const related = explainer.related
    .map((slug) => getExplainer(slug))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

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

      <article className="container mx-auto px-4 py-8 max-w-3xl">
        <nav className="mb-6 text-sm text-gray-400">
          <Link href="/learn" className="hover:text-white">
            ← All explainers
          </Link>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold mb-6 text-white leading-tight">
          {explainer.question}
        </h1>

        {/* Direct-answer block — the concise answer AI engines extract, shown first. */}
        <div className="mb-10 rounded-xl border border-white/[0.14] bg-[rgba(15,23,42,0.96)] p-5">
          <p className="text-lg text-gray-100 leading-relaxed">{explainer.shortAnswer}</p>
        </div>

        {/* Depth sections */}
        <div className="space-y-8">
          {explainer.sections.map((section, idx) => (
            <section key={idx}>
              <h2 className="text-2xl font-bold text-white mb-3">{section.heading}</h2>
              {section.body.split('\n\n').map((para, pIdx) => (
                <p key={pIdx} className="text-gray-300 leading-relaxed mb-3 last:mb-0">
                  {para}
                </p>
              ))}
            </section>
          ))}
        </div>

        {/* Related questions — reuse QASection but do NOT emit a second FAQPage schema. */}
        {related.length > 0 && (
          <QASection
            heading="Related questions"
            emitSchema={false}
            items={related.map((r) => ({ question: r.question, answer: r.shortAnswer }))}
          />
        )}

        {/* Related links list */}
        {related.length > 0 && (
          <div className="mt-4">
            <h2 className="text-xl font-semibold text-white mb-3">Related explainers</h2>
            <ul className="list-disc list-inside space-y-1">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/learn/${r.slug}`}
                    className="text-primary hover:underline"
                  >
                    {r.question}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Last updated */}
        <p className="mt-10 text-sm text-gray-400">
          Last updated: <time dateTime={explainer.updated}>{formatDate(explainer.updated)}</time>
        </p>

        {/* Educational disclaimer */}
        <footer className="mt-6 border-t border-white/10 pt-6">
          <p className="text-xs text-gray-500 leading-relaxed">
            This explainer is provided by StockHuntr for educational and informational purposes
            only. It describes SEC disclosure documents in general terms and does not constitute
            investment, financial, legal, or tax advice, nor a recommendation to buy or sell any
            security. Always consult the original filing and a licensed professional before making
            investment decisions.
          </p>
        </footer>
      </article>
    </div>
  );
}
