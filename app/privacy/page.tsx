/**
 * @module page
 * @description Privacy Policy page for StockHuntr application
 *
 * PURPOSE:
 * Renders the privacy policy page that discloses data collection, usage, and user rights
 * for the StockHuntr SEC filing analysis platform. Explains email authentication, watchlist
 * data handling, third-party service providers, and user privacy choices in a transparent,
 * accessible format.
 *
 * EXPORTS:
 * - metadata: Next.js Metadata object containing SEO title, description, and canonical URL
 * - default: PrivacyPage functional component rendering the full privacy policy content
 *
 * CLAUDE NOTES:
 * - Uses radial gradient background matching StockHuntr brand aesthetic
 * - Policy last updated August 2026 (UPDATED constant for easy maintenance)
 * - Covers passwordless authentication, analytics, alert emails, and third-party integrations
 * - Explicitly states no data selling or advertising use
 * - Links to /terms and /alerts pages for related policies and settings
 * - Contact email (support@stockhuntr.net) provided for privacy inquiries
 * - Mentions Anthropic Claude processing filing text (not personal data)
 * - Accessible markup with semantic HTML and sufficient color contrast
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | StockHuntr',
  description:
    'How StockHuntr collects, uses, and protects your information — email for passwordless sign-in, watchlist data, and analytics. We do not sell your data.',
  alternates: { canonical: '/privacy' },
};

const UPDATED = 'August 2026';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: {UPDATED}</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <p>
            StockHuntr (&quot;we&quot;, &quot;us&quot;) is a free tool for analyzing SEC filings. This policy
            explains what we collect, why, and the choices you have. Questions:{' '}
            <a href="mailto:support@stockhuntr.net" className="text-teal-400 hover:underline">support@stockhuntr.net</a>.
          </p>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Information we collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong className="text-white">Email address</strong> — for passwordless sign-in (magic links) and any alerts you opt into. We never ask for or store a password.</li>
              <li><strong className="text-white">Account content</strong> — your watchlist and paper-trading activity, tied to your account.</li>
              <li><strong className="text-white">Usage &amp; device data</strong> — basic analytics (pages visited, general device/browser info) to understand and improve the product.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">How we use it</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To authenticate you and keep you signed in.</li>
              <li>To send the filing/price/analyst alerts you choose to receive.</li>
              <li>To operate, secure, and improve StockHuntr.</li>
            </ul>
            <p className="mt-3">We do <strong className="text-white">not</strong> sell your personal information, and we do not use it for third-party advertising.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Data sources</h2>
            <p>
              The financial content we analyze comes from public sources — SEC EDGAR (filings), Yahoo Finance
              (market data), and the Federal Reserve&apos;s FRED (economic data). This is public company data, not
              your personal information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Service providers</h2>
            <p>We share limited data only with vendors that help us run the service:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong className="text-white">Resend</strong> — sends our transactional and alert emails.</li>
              <li><strong className="text-white">Vercel</strong> — hosting; <strong className="text-white">Railway</strong> — database.</li>
              <li><strong className="text-white">Anthropic (Claude)</strong> — processes <em>filing text</em> to generate analysis. We do not send your personal account data to the model.</li>
              <li><strong className="text-white">Microsoft Clarity</strong> — privacy-friendly product analytics.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Cookies</h2>
            <p>
              We use a single <code className="bg-white/10 px-1 rounded">httpOnly</code> session cookie to keep you
              signed in, plus analytics from Microsoft Clarity. We do not use advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Your choices &amp; rights</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Unsubscribe from alert emails at any time via the link in each email or your{' '}
                <Link href="/alerts" className="text-teal-400 hover:underline">alert settings</Link>.</li>
              <li>Request access to, or deletion of, your account data by emailing{' '}
                <a href="mailto:support@stockhuntr.net" className="text-teal-400 hover:underline">support@stockhuntr.net</a>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Retention &amp; security</h2>
            <p>
              We keep account data while your account is active and delete it on request. Sign-in tokens are
              short-lived and single-use. No method of transmission or storage is perfectly secure, but we take
              reasonable measures to protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Changes</h2>
            <p>We may update this policy; material changes will be reflected by the &quot;last updated&quot; date above.</p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 text-sm text-gray-400">
          See also our <Link href="/terms" className="text-teal-400 hover:underline">Terms of Service</Link>. For
          research and education only — nothing on StockHuntr is investment advice.
        </div>
      </div>
    </div>
  );
}
