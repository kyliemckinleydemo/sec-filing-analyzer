/**
 * @module opengraph-image
 * @description Dynamic Open Graph image generator for news article pages
 *
 * PURPOSE:
 * Generates on-demand 1200x630 PNG social-media preview images for individual news articles.
 * Renders a branded card with article headline, ticker, and filing type to satisfy Open Graph
 * meta tags, Twitter Cards, and Google News requirements without storing pre-rendered images.
 * Uses Next.js's next/og ImageResponse API with edge-compatible rendering.
 *
 * EXPORTS:
 * - runtime: 'nodejs' - Specifies Node.js runtime for image generation
 * - size: { width: 1200, height: 630 } - Standard OG image dimensions
 * - contentType: 'image/png' - Output format for generated image
 * - alt: Static alt text for the generated image
 * - Image (default): Async component that fetches article data and renders ImageResponse
 *
 * CLAUDE NOTES:
 * - Falls back gracefully to default branding if article lookup fails or slug is invalid
 * - Truncates titles longer than 120 characters to prevent layout overflow
 * - Uses inline styles required by next/og (subset of CSS supported in ImageResponse)
 * - Gradient background and brand colors match main site design system
 * - Route convention: app/news/[slug]/opengraph-image.tsx generates /news/[slug]/opengraph-image
 */

import { ImageResponse } from 'next/og';
import { prisma } from '@/lib/prisma';

/**
 * Dynamic Open Graph / featured image for a news article. Google News and social cards
 * want a per-article image; this renders a branded 1200x630 card with the headline so the
 * NewsArticle schema and OG tags have a real image without needing stored art.
 */
export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'StockHuntr news article';

export default async function Image({ params }: { params: { slug: string } }) {
  let title = 'StockHuntr — SEC Filing News';
  let ticker = '';
  let filingType = '';
  try {
    const a = await prisma.newsArticle.findUnique({
      where: { slug: params.slug },
      select: { title: true, ticker: true, filingType: true },
    });
    if (a) {
      title = a.title;
      ticker = a.ticker;
      filingType = a.filingType;
    }
  } catch {
    /* fall back to defaults */
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)',
          padding: '64px',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 700, color: '#60a5fa' }}>
          StockHuntr
          <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 16, fontSize: 26 }}>SEC Filing News</span>
        </div>
        <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, lineHeight: 1.15 }}>
          {title.length > 120 ? title.slice(0, 117) + '…' : title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: '#94a3b8' }}>
          {ticker ? `${ticker} · ${filingType} · ` : ''}AI analysis — not investment advice
        </div>
      </div>
    ),
    { ...size }
  );
}
