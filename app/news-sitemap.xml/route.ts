/**
 * @module app/news-sitemap.xml/route
 * @description Google News sitemap. Per Google's spec it lists ONLY articles published in
 * the last 48 hours (and well under the 1,000-URL cap), with <news:news> tags. Served at
 * /news-sitemap.xml and referenced from robots.txt. Separate from the main sitemap.xml.
 */
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const SITE = 'https://www.stockhuntr.net';
const PUBLICATION = 'StockHuntr';

function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  let rows: Array<{ slug: string; title: string; publishedAt: Date }> = [];
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  try {
    rows = await prisma.newsArticle.findMany({
      where: { publishedAt: { gte: since } },
      orderBy: { publishedAt: 'desc' },
      take: 1000,
      select: { slug: true, title: true, publishedAt: true },
    });
  } catch (error) {
    console.error('news-sitemap: db query failed', error);
  }

  const urls = rows
    .map((r) =>
      [
        '  <url>',
        `    <loc>${SITE}/news/${r.slug}</loc>`,
        '    <news:news>',
        `      <news:publication><news:name>${PUBLICATION}</news:name><news:language>en</news:language></news:publication>`,
        `      <news:publication_date>${r.publishedAt.toISOString()}</news:publication_date>`,
        `      <news:title>${xml(r.title)}</news:title>`,
        '    </news:news>',
        '  </url>',
      ].join('\n')
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=900',
    },
  });
}
