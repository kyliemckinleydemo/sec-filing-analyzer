import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * @module middleware
 * @description Canonical URL enforcement for SEO.
 *
 * 1. Non-www → www redirect (301)
 * 2. Company ticker case normalisation (301) — /company/aapl → /company/AAPL
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
  const { pathname } = url;
  const tickerMatch = pathname.match(/^\/company\/([^/]+)(\/.*)?$/);
  if (tickerMatch) {
    const ticker = tickerMatch[1];
    const rest = tickerMatch[2] ?? '';
    const upperTicker = ticker.toUpperCase();
    if (ticker !== upperTicker) {
      url.pathname = `/company/${upperTicker}${rest}`;
      return NextResponse.redirect(url, { status: 301 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot)).*)',
  ],
};
