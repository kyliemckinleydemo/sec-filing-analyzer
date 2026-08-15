/**
 * @module app/compare/page
 * @description Index page for the /compare section — curated comparison pages answering
 * "X vs Y" and "alternatives to X" style queries in the AI-SEC-research space. Server
 * component; lists every comparison with a link and its direct answer.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { comparisons } from './comparisons';

export const metadata: Metadata = {
  title: 'Compare SEC Filing AI Tools',
  description:
    'Honest, side-by-side comparisons of AI tools for SEC filing research — StockHuntr vs Fintool, AlphaSense alternatives, Bloomberg Terminal alternatives, free options, and the best AI SEC filing analysis tools.',
  alternates: { canonical: '/compare' },
};

export default function CompareIndexPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <nav className="mb-4">
          <Link href="/" className="text-sm text-gray-400 hover:text-white">
            ← Back to Home
          </Link>
        </nav>

        <header className="mb-10 max-w-3xl">
          <h1 className="text-4xl font-bold mb-3 text-white">Compare SEC Filing AI Tools</h1>
          <p className="text-gray-300 leading-relaxed">
            Straightforward, non-promotional comparisons of tools for researching SEC filings
            with AI — including how StockHuntr stacks up against Fintool, AlphaSense, the
            Bloomberg Terminal, and free SEC EDGAR. Each page leads with a direct answer, a
            side-by-side table, and an honest "who each is for." Educational reference only;
            nothing here is investment advice.
          </p>
        </header>

        <ul className="grid gap-4 sm:grid-cols-2">
          {comparisons.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/compare/${c.slug}`}
                className="block h-full rounded-xl border border-white/[0.14] bg-[rgba(15,23,42,0.96)] p-5 transition hover:border-white/30 hover:bg-[rgba(15,23,42,1)]"
              >
                <h2 className="text-lg font-semibold text-white mb-2">{c.title}</h2>
                <p className="text-sm text-gray-400 leading-relaxed line-clamp-4">
                  {c.directAnswer}
                </p>
                <span className="mt-3 inline-block text-sm font-medium text-teal-400">
                  Read comparison →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-xs text-gray-500 max-w-3xl">
          StockHuntr provides these comparisons for educational and informational purposes only.
          Details about third-party products are based on publicly available information and may
          change; verify current pricing and features with each provider. Nothing here constitutes
          investment, financial, legal, or tax advice.
        </p>
      </div>
    </div>
  );
}
