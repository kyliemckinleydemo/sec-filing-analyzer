/**
 * @module page
 * @description Terms of Service page for StockHuntr application
 * 
 * PURPOSE:
 * Displays the legal terms of service governing the use of StockHuntr, including
 * disclaimers, data accuracy notices, acceptable use policies, and liability limitations.
 * Emphasizes that the service is educational only and not investment advice.
 * 
 * EXPORTS:
 * - metadata: Next.js metadata object for SEO (title, description, canonical URL)
 * - default: TermsPage React component rendering the full terms of service content
 * 
 * CLAUDE NOTES:
 * - Includes prominent disclaimer that StockHuntr is not investment advice
 * - Warns users that AI predictions and risk scores are informational only
 * - States data sources (SEC EDGAR, Yahoo Finance, FRED) without accuracy guarantee
 * - Outlines acceptable use policy (no scraping, no security violations)
 * - Contains standard "as is" warranty disclaimer and liability limitation
 * - Last updated date stored in UPDATED constant (currently "August 2026")
 * - Links to Privacy Policy page in footer
 * - Uses radial gradient dark theme consistent with app design
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | StockHuntr',
  description:
    'The terms for using StockHuntr — a free, educational SEC-filing analysis tool. Not investment advice; no warranty; use at your own risk.',
  alternates: { canonical: '/terms' },
};

const UPDATED = 'August 2026';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-4xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: {UPDATED}</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <p>
            By using StockHuntr (the &quot;Service&quot;) you agree to these terms. If you don&apos;t agree, please
            don&apos;t use the Service. Questions:{' '}
            <a href="mailto:support@stockhuntr.net" className="text-teal-400 hover:underline">support@stockhuntr.net</a>.
          </p>

          <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-5">
            <h2 className="text-2xl font-bold text-white mb-3">Not investment advice</h2>
            <p>
              StockHuntr is an <strong className="text-white">educational and research tool</strong>. Its AI
              analysis, risk/concern scores, and 30-day alpha signals are informational only — they are{' '}
              <strong className="text-white">not investment, financial, legal, or tax advice</strong>, not a
              recommendation to buy or sell any security, and not a solicitation. Predictions are model estimates
              and are frequently wrong. Markets involve risk, including loss of principal. Do your own research and
              consult a licensed financial professional before making any investment decision. You are solely
              responsible for your decisions and assume all risk.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">The Service</h2>
            <p>
              StockHuntr analyzes public SEC filings (10-K, 10-Q, 8-K) using AI and market data to produce summaries,
              risk scoring, and signals. Features may change, and the Service is provided free and &quot;as is.&quot;
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Data &amp; accuracy</h2>
            <p>
              Content is derived from public sources (SEC EDGAR, Yahoo Finance, FRED) and AI processing. We do not
              guarantee that any information — including filings data, prices, analysis, or predictions — is accurate,
              complete, current, or error-free. Always verify against primary sources before relying on anything.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Your account &amp; acceptable use</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Keep your sign-in link private; you are responsible for activity under your account.</li>
              <li>Don&apos;t misuse the Service — no scraping at scale, no attempts to break security or rate limits, no unlawful use, and no reselling of the data or output.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Intellectual property</h2>
            <p>
              Underlying filings are public. The StockHuntr name, site, and original analysis/UI are ours; the open
              dataset we publish is offered under its stated license.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">No warranty &amp; limitation of liability</h2>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any kind.
              To the fullest extent permitted by law, StockHuntr and its operators are not liable for any indirect,
              incidental, or consequential damages, or for any trading or investment losses, arising from your use of
              the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Changes &amp; termination</h2>
            <p>
              We may update these terms (reflected by the date above) and may suspend or discontinue the Service at
              any time. Continued use after changes means you accept them.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 text-sm text-gray-400">
          See also our <Link href="/privacy" className="text-teal-400 hover:underline">Privacy Policy</Link>.
        </div>
      </div>
    </div>
  );
}
