import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * @module middleware
 * @description Canonical URL enforcement for SEO.
 *
 * Handles two classes of duplicate-URL issues surfaced in Google Search Console:
 *
 * 1. Non-www → www redirect (301)
 *    Ensures stockhuntr.net always redirects to www.stockhuntr.net.
 *    Vercel handles https enforcement automatically; this covers the host variant.
 *
 * 2. Company ticker case normalisation (301)
 *    /company/aapl and /company/AAPL are the same page. We treat uppercase as
 *    canonical (matches SEC and financial convention). Any lowercase or mixed-case
 *    ticker in the URL is permanently redirected to its uppercase form.
 *    This prevents "Duplicate without user-selected canonical" warnings for company
 *    pages that may be linked with lowercase tickers from external sources.
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get('host') ?? '';

  // 1. Redirect bare domain to www
  if (host === 'stockhuntr.net') {
    url.host = 'www.stockhuntr.net';
    return NextResponse.redirect(url, { status: 301 });
  }

  // 2. Normalise /company/[ticker] to uppercase
  //    Matches /company/aapl, /company/aapl/filing/..., etc.
  const tickerMatch = url.pathname.match(/^(\/company\/)([^/]+)(\/.*)?$/);
  if (tickerMatch) {
    const [, prefix, ticker, rest = ''] = tickerMatch;
    const upperTicker = ticker.toUpperCase();
    if (ticker !== upperTicker) {
      url.pathname = `${prefix}${upperTicker}${rest}`;
      return NextResponse.redirect(url, { status: 301 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT Next.js internals and static assets.
     * This keeps the middleware overhead minimal — it only runs on real page routes.
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot)).*)',
  ],
};
