import Link from 'next/link';

export default function Navigation() {
  return (
    <nav className="fixed top-0 right-0 p-6 z-50">
      <div className="flex gap-6">
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
          Query
        </Link>
        <Link
          href="/latest-filings"
          className="text-gray-700 hover:text-blue-600 font-medium transition-colors"
        >
          Latest Filings
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
