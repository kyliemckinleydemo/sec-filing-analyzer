/**
 * @module app/feed.xml/route
 * @description RSS 2.0 feed of the most recent AI-analyzed SEC filings. Real, grounded
 * syndication surface consumed by feed readers and news aggregators (Feedly, NewsBreak,
 * Bing/Yahoo aggregation paths). Each item links back to the filing's page on StockHuntr.
 * Served at /feed.xml. When the editorial /news section ships, its articles will be added
 * here (or get their own news feed) — this filings feed stands on its own in the meantime.
 */
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const SITE = 'https://www.stockhuntr.net';
const MAX_ITEMS = 30;

/** Escape the five XML predefined entities. */
function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Strip markdown and clip stored AI prose for a clean feed description. */
function clip(s: string | null, n = 300): string {
  if (!s) return '';
  const clean = s.replace(/[*_#`]+/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n - 1).trimEnd() + '…' : clean;
}

export async function GET() {
  let filings: Array<{
    accessionNumber: string;
    filingType: string;
    filingDate: Date;
    aiSummary: string | null;
    concernLevel: number | null;
    predicted30dAlpha: number | null;
    company: { ticker: string; name: string } | null;
  }> = [];

  try {
    filings = await prisma.filing.findMany({
      where: { aiSummary: { not: null } },
      orderBy: { filingDate: 'desc' },
      take: MAX_ITEMS,
      select: {
        accessionNumber: true,
        filingType: true,
        filingDate: true,
        aiSummary: true,
        concernLevel: true,
        predicted30dAlpha: true,
        company: { select: { ticker: true, name: true } },
      },
    });
  } catch (error) {
    console.error('feed.xml: db query failed', error);
  }

  const now = new Date().toUTCString();
  const lastBuild = filings[0]?.filingDate?.toUTCString() ?? now;

  const items = filings
    .filter((f) => f.company)
    .map((f) => {
      const c = f.company!;
      const url = `${SITE}/filing/${f.accessionNumber}`;
      const dateStr = f.filingDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
      const title = `${c.name} (${c.ticker}) ${f.filingType} — ${dateStr}`;
      const bits: string[] = [];
      if (f.aiSummary) bits.push(clip(f.aiSummary, 280));
      if (typeof f.concernLevel === 'number') bits.push(`AI concern level: ${f.concernLevel.toFixed(1)}/10.`);
      bits.push('AI analysis from StockHuntr — not investment advice.');
      const description = bits.join(' ');
      return [
        '    <item>',
        `      <title>${xml(title)}</title>`,
        `      <link>${xml(url)}</link>`,
        `      <guid isPermaLink="true">${xml(url)}</guid>`,
        `      <pubDate>${f.filingDate.toUTCString()}</pubDate>`,
        `      <category>${xml(f.filingType)}</category>`,
        `      <description>${xml(description)}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>StockHuntr — Latest AI-Analyzed SEC Filings</title>
    <link>${SITE}/latest-filings</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Most recent 10-K, 10-Q, and 8-K filings with StockHuntr's AI risk scoring and cited analysis. Grounded in primary-source SEC EDGAR data. Not investment advice.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <ttl>60</ttl>
${items}
  </channel>
</rss>
`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800, s-maxage=1800',
    },
  });
}
