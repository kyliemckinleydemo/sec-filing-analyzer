import { MetadataRoute } from 'next';

/**
 * @module app/robots
 * @description Serves robots.txt. Explicitly allows search engines and AI retrieval
 * crawlers (OAI-SearchBot, Claude-SearchBot, PerplexityBot) — being retrievable is how
 * StockHuntr gets cited in AI answers. User-specific and API routes are disallowed.
 */

const DISALLOWED = [
  '/api/',
  '/profile',
  '/alerts',
  '/watchlist',
  '/paper-trading',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Search engines + AI retrieval and training bots all allowed on public content
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOWED,
      },
    ],
    sitemap: 'https://www.stockhuntr.net/sitemap.xml',
  };
}
