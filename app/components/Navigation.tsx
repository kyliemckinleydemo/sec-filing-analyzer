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
          href="/query"
          className="text-gray-700 hover:text-blue-600 font-medium transition-colors"
        >
          Query
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
