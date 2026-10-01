import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import AnalysisProvenance from '@/app/components/AnalysisProvenance';
import { CANONICAL_SECTORS } from '@/lib/sectors';

/**
 * @module app/news/[slug]/page
 * @description A single AI-written news article about a significant SEC filing. Server-rendered
 * from the NewsArticle table with NewsArticle JSON-LD, a visible AI-disclosure line, E-E-A-T
 * provenance (primary-source EDGAR link + methodology), and internal links to the filing,
 * company, and sector pages. Not investment advice.
 */

export const revalidate = 3600;
const SITE = 'https://www.stockhuntr.net';

async function getArticle(slug: string) {
  try {
    return await prisma.newsArticle.findUnique({ where: { slug } });
  } catch (error) {
    console.error('news article: db lookup failed', error);
    return null;
  }
}

/** Company CIK (for a real EDGAR link) — NewsArticle stores ticker, not cik. */
async function getCik(ticker: string): Promise<string | null> {
  try {
    const c = await prisma.company.findUnique({ where: { ticker }, select: { cik: true } });
    return c?.cik ?? null;
  } catch {
    return null;
  }
}

function sectorSlug(name: string | null): string | null {
  if (!name) return null;
  return CANONICAL_SECTORS.find((s) => s.name.toLowerCase() === name.toLowerCase())?.slug ?? null;
}

function edgarFilingUrl(cik: string | null, accession: string): string | null {
  if (!cik) return null;
  const cikInt = String(cik).replace(/^0+/, '') || cik;
  const accNoDashes = accession.replace(/-/g, '');
  if (!/^\d{18}$/.test(accNoDashes)) return null;
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDashes}/${accession}-index.htm`;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const a = await getArticle(params.slug);
  if (!a) return { title: 'Article not found' };
  const canonical = `/news/${a.slug}`;
  return {
    title: `${a.title} | StockHuntr News`,
    description: a.dek,
    alternates: { canonical },
    openGraph: {
      title: a.title,
      description: a.dek,
      url: `${SITE}${canonical}`,
      type: 'article',
      publishedTime: a.publishedAt.toISOString(),
      modifiedTime: a.updatedAt.toISOString(),
    },
    twitter: { card: 'summary', title: a.title, description: a.dek },
  };
}

export default async function NewsArticlePage({ params }: { params: { slug: string } }) {
  const a = await getArticle(params.slug);
  if (!a) notFound();

  const cik = await getCik(a.ticker);
  const edgarUrl = edgarFilingUrl(cik, a.filingAccession);
  const secSlug = sectorSlug(a.sector);
  const dateStr = a.publishedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title.slice(0, 110),
    description: a.dek,
    datePublished: a.publishedAt.toISOString(),
    dateModified: a.updatedAt.toISOString(),
    author: { '@type': 'Organization', name: 'StockHuntr', url: SITE },
    publisher: { '@type': 'Organization', name: 'StockHuntr', url: SITE },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/news/${a.slug}` },
    isAccessibleForFree: true,
    about: `${a.companyName} (${a.ticker}) ${a.filingType}`,
  };
  const jsonLdString = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  const paragraphs = a.bodyMarkdown.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const crumbs = [
    { name: 'Home', url: `${SITE}/` },
    { name: 'News', url: `${SITE}/news` },
    { name: `${a.ticker} ${a.filingType}`, url: `${SITE}/news/${a.slug}` },
  ];

  return (
    <main className="min-h-screen bg-[#020617] text-gray-200">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString }} />
      <div className="bg-[#020617]">
        <Breadcrumbs items={crumbs} />
      </div>
      <article className="mx-auto max-w-3xl px-4 pb-10 pt-4">
        <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">{a.title}</h1>
        <p className="mt-3 text-lg text-gray-400">{a.dek}</p>
        <p className="mt-3 text-sm text-gray-500">
          By StockHuntr · {dateStr} ·{' '}
          <Link href={`/company/${a.ticker}`} className="text-blue-400 hover:text-blue-300 underline">
            {a.ticker}
          </Link>
          {secSlug && (
            <>
              {' · '}
              <Link href={`/sectors/${secSlug}`} className="text-blue-400 hover:text-blue-300 underline">
                {a.sector}
              </Link>
            </>
          )}
        </p>

        {/* AI disclosure — required by Google News policy for AI-generated content */}
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-gray-400">
          This article was generated by StockHuntr&apos;s AI from the company&apos;s SEC filing and
          its analysis data, and reviewed programmatically for grounding. It is research, not
          investment advice.
        </p>

        <div className="mt-6 space-y-4 text-gray-200 leading-relaxed">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {/* Internal links back into the site */}
        <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm">
          <p className="text-gray-400">
            Read the full AI analysis of this filing on StockHuntr:{' '}
            <Link href={`/filing/${a.filingAccession}`} className="text-blue-400 hover:text-blue-300 underline">
              {a.companyName} {a.filingType} analysis →
            </Link>
          </p>
        </div>
      </article>

      <AnalysisProvenance
        asOf={a.filingDate}
        edgarUrl={edgarUrl}
        edgarLabel={`View this ${a.filingType} on SEC EDGAR`}
        extraSources={['Yahoo Finance (market data)']}
      />
    </main>
  );
}
