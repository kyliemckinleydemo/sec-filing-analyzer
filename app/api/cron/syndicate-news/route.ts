/**
 * @module app/api/cron/syndicate-news/route
 * @description Cross-posts recent /news articles to owned accounts (Medium, X, LinkedIn).
 * Credential-gated: if a channel's env vars are absent it no-ops, so this never fails on
 * missing keys. Per-channel dedup via NewsArticle.mediumUrl / xPostedAt / linkedinPostedAt
 * so an article is never double-posted to the same channel. Auth: Bearer CRON_SECRET.
 *
 * Runs after generate-news. Only owned accounts — never third-party communities.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { postToMedium, postToX, postToLinkedIn } from '@/lib/syndication';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const LOOKBACK_DAYS = 3;
const MAX_PER_RUN = 5;

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const results: Array<Record<string, unknown>> = [];

  try {
    // Recent articles not yet fully syndicated to every channel.
    const articles = await prisma.newsArticle.findMany({
      where: {
        publishedAt: { gte: since },
        OR: [{ mediumUrl: null }, { xPostedAt: null }, { linkedinPostedAt: null }],
      },
      orderBy: { publishedAt: 'desc' },
      take: MAX_PER_RUN,
    });

    for (const a of articles) {
      const input = { slug: a.slug, title: a.title, dek: a.dek, bodyMarkdown: a.bodyMarkdown };
      const data: Record<string, unknown> = {};
      const channelResults: Record<string, string> = {};

      if (!a.mediumUrl) {
        const r = await postToMedium(input);
        channelResults.medium = r.status + (r.detail ? ` (${r.detail})` : '');
        if (r.status === 'posted' && r.url) data.mediumUrl = r.url;
      }
      if (!a.xPostedAt) {
        const r = await postToX(input);
        channelResults.x = r.status + (r.detail ? ` (${r.detail})` : '');
        if (r.status === 'posted') data.xPostedAt = new Date();
      }
      if (!a.linkedinPostedAt) {
        const r = await postToLinkedIn(input);
        channelResults.linkedin = r.status + (r.detail ? ` (${r.detail})` : '');
        if (r.status === 'posted') data.linkedinPostedAt = new Date();
      }

      if (Object.keys(data).length > 0) {
        await prisma.newsArticle.update({ where: { id: a.id }, data });
      }
      results.push({ slug: a.slug, channels: channelResults });
    }

    return NextResponse.json({ ok: true, considered: articles.length, results });
  } catch (error) {
    console.error('syndicate-news cron failed', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
