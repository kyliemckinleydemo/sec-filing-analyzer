/**
 * @module app/components/Navigation
 * @description Fixed-position navigation component rendering primary site navigation with five main routes using Next.js Link components
 *
 * PURPOSE:
 * - Render fixed top-right navigation bar with Home, Latest Filings, Watchlist, Query, and FAQ links
 * - Apply glassmorphism styling with white/80 opacity background and backdrop blur for modern visual effect
 * - Hide navigation from printed pages using print:hidden utility class
 * - Provide hover state transitions with color change from gray-700 to blue-600 on link interaction
 *
 * DEPENDENCIES:
 * - next/link - Provides Link component for client-side navigation without full page reloads
 *
 * EXPORTS:
 * - Navigation (component) - Default export returning fixed navigation bar with five styled navigation links
 *
 * PATTERNS:
 * - Import and place in root layout or page component: <Navigation />
 * - Navigation automatically positions itself at top-right with z-50 stacking context
 * - Use alongside other page content; fixed positioning ensures visibility during scroll
 *
 * CLAUDE NOTES:
 * - Fixed positioning (top-0 right-0) keeps navigation visible during scroll but may overlap content on small screens
 * - Glassmorphism effect (bg-white/80 backdrop-blur-sm) requires content behind nav to be visible for blur effect
 * - All five links share identical styling classes; could be refactored to mapping pattern if link configuration grows
 * - Print utility (print:hidden) ensures navigation doesn't appear in PDF exports or printed documents
 */
import Link from 'next/link';

export default function Navigation() {
  return (
    <nav className="fixed top-0 right-0 p-6 z-50 print:hidden">
      <div className="flex gap-6 bg-white/80 backdrop-blur-sm rounded-lg px-4 py-2 shadow-sm">
        <Link
          href="/"
          className="text-gray-700 hover:text-blue-600 font-medium transition-colors"
        >
          Home
        </Link>
        <Link
          href="/query"
          className="text-gray-700 hover:text-blue-600 font-medium transition-colors"
        >
          Ask the Market
        </Link>
        <Link
          href="/latest-filings"
          className="text-gray-700 hover:text-blue-600 font-medium transition-colors"
        >
          Latest Filings
        </Link>
        <Link
          href="/watchlist"
          className="text-gray-700 hover:text-blue-600 font-medium transition-colors"
        >
          Watchlist
        </Link>
        <Link
          href="/faq"
          className="text-gray-700 hover:text-blue-600 font-medium transition-colors"
        >
          FAQ
        </Link>
      </div>
    </nav>
  );
}
