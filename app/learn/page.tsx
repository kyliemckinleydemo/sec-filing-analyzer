/**
 * @module app/learn/page
 * @description Index page for the /learn explainer library — a curated, evergreen set of
 * plain-language answers to common questions about reading SEC filings. Server component;
 * lists every explainer with a link and its direct answer.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { explainers } from './explainers';

export const metadata: Metadata = {
  title: 'Learn: How to Read SEC Filings',
  description:
    'Plain-language explainers answering the questions people actually ask about SEC filings: 8-K items, 10-K vs 10-Q, going concern, EPS surprises, XBRL, Form 4 insider trades, and more.',
  alternates: { canonical: '/learn' },
};

export default function LearnIndexPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      <div className="container mx-auto px-4 py-8">
        <nav className="mb-4">
          <Link href="/" className="text-sm text-gray-400 hover:text-white">
            ← Back to Home
          </Link>
        </nav>

        <header className="mb-10 max-w-3xl">
          <h1 className="text-4xl font-bold mb-3 text-white">How to Read SEC Filings</h1>
          <p className="text-gray-300 leading-relaxed">
            Clear, jargon-free answers to the questions investors actually ask about SEC
            filings — what each form and item means, and how to read the parts that matter.
            Educational reference only; nothing here is investment advice.
          </p>
        </header>

        <ul className="grid gap-4 sm:grid-cols-2">
          {explainers.map((e) => (
            <li key={e.slug}>
              <Link
                href={`/learn/${e.slug}`}
                className="block h-full rounded-xl border border-white/[0.14] bg-[rgba(15,23,42,0.96)] p-5 transition hover:border-white/30 hover:bg-[rgba(15,23,42,1)]"
              >
                <h2 className="text-lg font-semibold text-white mb-2">{e.question}</h2>
                <p className="text-sm text-gray-400 leading-relaxed line-clamp-4">
                  {e.shortAnswer}
                </p>
                <span className="mt-3 inline-block text-sm font-medium text-primary">
                  Read explainer →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-xs text-gray-500 max-w-3xl">
          StockHuntr provides these explainers for educational purposes only. They are general
          information about SEC disclosure documents and do not constitute investment, financial,
          legal, or tax advice.
        </p>
      </div>
    </div>
  );
}
