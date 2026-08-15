/**
 * @module app/components/Footer
 * @description Site-wide footer rendered on every page. Its main job (beyond UX) is
 * internal linking: it surfaces the SEO/GEO content — Latest Filings, Sectors, the
 * Learn explainer library, FAQ — from every crawlable page, so search engines discover
 * and distribute link equity to it. Server component (no client JS).
 */
import Link from 'next/link';
import { CANONICAL_SECTORS } from '@/lib/sectors';
import { explainers } from '@/app/learn/explainers';

export default function Footer() {
  const topSectors = CANONICAL_SECTORS.slice(0, 6);
  const topExplainers = explainers.slice(0, 6);

  return (
    <footer className="border-t border-white/10 bg-[#020617] text-gray-400 print:hidden">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Explore</h3>
            <ul className="space-y-2">
              <li><Link href="/latest-filings" className="hover:text-white">Latest Filings</Link></li>
              <li><Link href="/query" className="hover:text-white">Ask the Market</Link></li>
              <li><Link href="/model-demo" className="hover:text-white">Model Track Record</Link></li>
              <li><Link href="/sectors" className="hover:text-white">Filings by Sector</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Sectors</h3>
            <ul className="space-y-2">
              {topSectors.map((s) => (
                <li key={s.slug}>
                  <Link href={`/sectors/${s.slug}`} className="hover:text-white">{s.name}</Link>
                </li>
              ))}
              <li><Link href="/sectors" className="text-teal-400 hover:underline">All sectors →</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Learn</h3>
            <ul className="space-y-2">
              {topExplainers.map((e) => (
                <li key={e.slug}>
                  <Link href={`/learn/${e.slug}`} className="hover:text-white">{e.question}</Link>
                </li>
              ))}
              <li><Link href="/learn" className="text-teal-400 hover:underline">All explainers →</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3">StockHuntr</h3>
            <ul className="space-y-2">
              <li><Link href="/" className="hover:text-white">Home</Link></li>
              <li><Link href="/faq" className="hover:text-white">FAQ & Methodology</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 text-xs text-gray-600">
          <p className="mb-1">
            StockHuntr analyzes SEC filings with AI to generate 30-day stock predictions. Data from SEC EDGAR,
            Yahoo Finance, and FRED.
          </p>
          <p>For research and education only. Nothing here is investment advice.</p>
        </div>
      </div>
    </footer>
  );
}
