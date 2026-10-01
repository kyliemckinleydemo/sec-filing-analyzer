import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

/**
 * @module app/news/page
 * @description /news index — the StockHuntr daily news/insights feed: AI-written articles
 * about the most significant recent SEC filings. Server-rendered from the NewsArticle table,
 * newest first. Each entry links to the full article. Research, not investment advice.
 */

export const revalidate = 1800;
const SITE = 'https://www.stockhuntr.net';

export const metadata: Metadata = {
  title: 'SEC Filing News & Insights — AI Analysis of Significant Filings',
  description:
    "StockHuntr's daily news feed: AI-written analysis of the most significant SEC filings (10-K, 10-Q, 8-K) — concern scores, what changed, and why it matters. Grounded in primary-source EDGAR. Not investment advice.",
  alternates: { canonical: '/news' },
  openGraph: {
    title: 'SEC Filing News & Insights — StockHuntr',
    description:
      'Daily AI-written analysis of the most significant SEC filings, grounded in primary-source EDGAR data.',
    url: `${SITE}/news`,
    type: 'website',
  },
};

async function getArticles() {
  try {
    return await prisma.newsArticle.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: {
        slug: true,
        title: true,
        dek: true,
        ticker: true,
        companyName: true,
        filingType: true,
        sector: true,
        concernLevel: true,
        publishedAt: true,
      },
    });
  } catch (error) {
    console.error('news index: db lookup failed', error);
    return [];
  }
}

export default async function NewsIndexPage() {
  const articles = await getArticles();

  return (
    <main className="min-h-screen bg-[#020617] text-gray-200">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-white">SEC Filing News &amp; Insights</h1>
        <p className="mt-3 text-gray-300 leading-relaxed">
          AI-written analysis of the most significant recent SEC filings — what changed, the AI
          concern score, and why it matters. A small, curated set each day, grounded in
          primary-source SEC EDGAR data. Research and education only; not investment advice.
        </p>

        {articles.length === 0 ? (
          <p className="mt-10 text-gray-400">No articles published yet. Check back soon.</p>
        ) : (
          <div className="mt-8 space-y-6">
            {articles.map((a) => (
              <article key={a.slug} className="border-b border-white/10 pb-6 last:border-0">
                <div className="text-xs text-gray-500 mb-1">
                  {a.publishedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  {' · '}
                  <span className="text-gray-400">{a.ticker} {a.filingType}</span>
                  {a.sector ? <span className="text-gray-600"> · {a.sector}</span> : null}
                </div>
                <h2 className="text-xl font-semibold text-white">
                  <Link href={`/news/${a.slug}`} className="hover:text-blue-300">
                    {a.title}
                  </Link>
                </h2>
                <p className="mt-1 text-gray-400">{a.dek}</p>
                <Link href={`/news/${a.slug}`} className="mt-2 inline-block text-sm text-blue-400 hover:text-blue-300">
                  Read analysis →
                </Link>
              </article>
            ))}
          </div>
        )}

        <p className="mt-10 text-xs text-gray-500">
          Also available as an <Link href="/feed.xml" className="text-blue-400 hover:text-blue-300 underline">RSS feed</Link>.
          Methodology on the <Link href="/faq" className="text-blue-400 hover:text-blue-300 underline">FAQ</Link>.
        </p>
      </div>
    </main>
  );
}
