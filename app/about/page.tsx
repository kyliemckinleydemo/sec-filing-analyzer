/**
 * @module app/about/page
 * @description About page — the site's authorship / trust (E-E-A-T) surface. Names the
 * person and company behind StockHuntr, explains who makes it and why it can be trusted,
 * and links to the methodology. Finance sites are held to a high credibility bar by
 * search and AI answer engines; a 404 /about with no named author was the biggest
 * remaining trust gap. Emits AboutPage + Person/Organization JSON-LD so engines can
 * resolve the authorship entity.
 *
 * SECURITY: The JSON-LD below is 100% static, developer-authored content (no user input
 * is ever interpolated), and "<" is escaped before injection — the same safe pattern used
 * in app/layout.tsx. dangerouslySetInnerHTML is required because Next.js has no first-class
 * JSON-LD primitive; it is safe here precisely because the payload is a compile-time constant.
 */
import type { Metadata } from 'next';
import Link from 'next/link';

const SITE_URL = 'https://www.stockhuntr.net';

// ── Author / publisher identity ────────────────────────────────────────────────
// Founder named per owner instruction. Published by Great Falls Ventures.
const FOUNDER_NAME = 'Kylie McKinley';
const FOUNDER_ROLE = 'Founder';
const PUBLISHER = 'Great Falls Ventures';

// Set this to the founder/company LinkedIn URL to surface it as a trust signal on the
// page and in the Organization `sameAs` structured data. Leave empty to omit (no broken
// or placeholder links will render). TODO(owner): paste the real LinkedIn profile URL.
const LINKEDIN_URL = '';

export const metadata: Metadata = {
  title: 'About StockHuntr — Who Builds It & How It Works',
  description:
    `StockHuntr is a free AI tool for reading SEC filings, built by ${FOUNDER_NAME} (${PUBLISHER}). ` +
    'Learn who is behind the site, our sources (SEC EDGAR, Yahoo Finance, FRED), and our methodology.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About StockHuntr — Who Builds It & How It Works',
    description:
      `Who is behind StockHuntr, where our data comes from, and how our AI analysis and 30-day predictions work.`,
    url: `${SITE_URL}/about`,
    type: 'profile',
  },
};

// AboutPage + the founder Person + publisher Organization, so engines can resolve the
// authorship entity behind the site's financial analysis.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'AboutPage',
      '@id': `${SITE_URL}/about#webpage`,
      url: `${SITE_URL}/about`,
      name: 'About StockHuntr',
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'Person',
      '@id': `${SITE_URL}/#founder`,
      name: FOUNDER_NAME,
      jobTitle: FOUNDER_ROLE,
      worksFor: { '@id': `${SITE_URL}/#organization` },
      ...(LINKEDIN_URL ? { sameAs: [LINKEDIN_URL] } : {}),
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'StockHuntr',
      url: `${SITE_URL}/`,
      founder: { '@id': `${SITE_URL}/#founder` },
      publishingPrinciples: `${SITE_URL}/faq`,
      ...(LINKEDIN_URL ? { sameAs: [LINKEDIN_URL] } : {}),
    },
  ],
};

// Static, compile-time constant. Escape "<" per Next.js docs (defense-in-depth only —
// there is no user-controlled data in this object).
const jsonLdString = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString }}
      />
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-4xl font-bold text-white mb-2">About StockHuntr</h1>
        <p className="text-sm text-gray-400 mb-8">
          Who builds it, where the data comes from, and how to read our analysis.
        </p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <p>
            StockHuntr is a free AI tool for reading and analyzing SEC filings. You can ask
            questions about any 10-K, 10-Q, or 8-K in plain English and get cited answers
            drawn straight from the filing, plus AI risk/concern scoring across the S&amp;P 500
            and other large US companies — all grounded in primary-source{' '}
            <a
              href="https://www.sec.gov/edgar"
              className="text-teal-400 hover:underline"
              rel="noopener"
              target="_blank"
            >
              SEC EDGAR
            </a>{' '}
            data.
          </p>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Who is behind StockHuntr</h2>
            <p>
              StockHuntr is built and maintained by{' '}
              <strong className="text-white">{FOUNDER_NAME}</strong>, {FOUNDER_ROLE.toLowerCase()},
              and published by <strong className="text-white">{PUBLISHER}</strong>. It is an
              independent research tool — not a broker, investment adviser, or ratings agency.
            </p>
            {LINKEDIN_URL && (
              <p className="mt-3">
                Connect on{' '}
                <a
                  href={LINKEDIN_URL}
                  className="text-teal-400 hover:underline"
                  rel="noopener me"
                  target="_blank"
                >
                  LinkedIn
                </a>
                .
              </p>
            )}
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Where our data comes from</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-white">SEC EDGAR</strong> — the primary source for every
                filing we analyze. Each filing page links back to the original document on
                EDGAR so you can verify any claim.
              </li>
              <li>
                <strong className="text-white">Yahoo Finance</strong> — market data (prices,
                valuation multiples, analyst targets) used in company snapshots.
              </li>
              <li>
                <strong className="text-white">FRED (St. Louis Fed)</strong> — treasury rates and
                macro indicators used in the model.
              </li>
              <li>
                <strong className="text-white">Anthropic Claude</strong> — the AI model that reads
                filing text and produces summaries, risk scoring, and cited answers. AI output can
                be imperfect; always confirm against the linked source filing.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">How to read our analysis</h2>
            <p>
              AI summaries and risk scores are decision-support, not a verdict. The secondary
              30-day prediction is a market-relative (alpha) estimate with a published track
              record — read it as a probabilistic signal, not a promise. Our full methodology,
              data sources, and accuracy numbers are documented in the{' '}
              <Link href="/faq" className="text-teal-400 hover:underline">
                FAQ &amp; Methodology
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Independence &amp; disclaimer</h2>
            <p>
              StockHuntr is for research and education only. Nothing on this site is investment
              advice, and we do not receive compensation for coverage of any company. Questions or
              corrections:{' '}
              <a href="mailto:support@stockhuntr.net" className="text-teal-400 hover:underline">
                support@stockhuntr.net
              </a>
              .
            </p>
          </section>

          <div className="pt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/faq" className="text-teal-400 hover:underline">
              FAQ &amp; Methodology →
            </Link>
            <Link href="/dataset" className="text-teal-400 hover:underline">
              Open dataset &amp; API →
            </Link>
            <Link href="/latest-filings" className="text-teal-400 hover:underline">
              Browse latest filings →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
