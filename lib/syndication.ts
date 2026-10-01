/**
 * @module lib/syndication
 * @description Owned-account cross-posting for /news articles: Medium, X (Twitter), and
 * LinkedIn. Each channel is CREDENTIAL-GATED — a graceful no-op if its env vars are absent,
 * so the syndication cron never fails on missing keys. Posts link back to the canonical
 * /news article (Medium uses canonicalUrl so there's no duplicate-content penalty). Only
 * owned accounts — never third-party communities (Reddit/HN/etc. would be spam).
 */
import crypto from 'crypto';

export interface SyndicationInput {
  slug: string;
  title: string;
  dek: string;
  bodyMarkdown: string;
}

export interface ChannelResult {
  channel: 'medium' | 'x' | 'linkedin';
  status: 'posted' | 'skipped' | 'error';
  url?: string;
  detail?: string;
}

const SITE = 'https://www.stockhuntr.net';
const canonical = (slug: string) => `${SITE}/news/${slug}`;

/** Medium: create a post under the authenticated user, canonicalized back to our site. */
export async function postToMedium(a: SyndicationInput): Promise<ChannelResult> {
  const token = process.env.MEDIUM_INTEGRATION_TOKEN;
  if (!token) return { channel: 'medium', status: 'skipped', detail: 'no MEDIUM_INTEGRATION_TOKEN' };
  try {
    const meRes = await fetch('https://api.medium.com/v1/users/me', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!meRes.ok) return { channel: 'medium', status: 'error', detail: `me ${meRes.status}` };
    const me = await meRes.json();
    const authorId = me?.data?.id;
    if (!authorId) return { channel: 'medium', status: 'error', detail: 'no author id' };

    const content = `${a.bodyMarkdown}\n\n---\n\n*Originally published at [StockHuntr](${canonical(a.slug)}). Research, not investment advice.*`;
    const postRes = await fetch(`https://api.medium.com/v1/users/${authorId}/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: a.title,
        contentFormat: 'markdown',
        content,
        canonicalUrl: canonical(a.slug),
        tags: ['SEC filings', 'investing', 'stocks', 'AI'],
        publishStatus: 'public',
      }),
    });
    if (!postRes.ok) return { channel: 'medium', status: 'error', detail: `post ${postRes.status}` };
    const post = await postRes.json();
    return { channel: 'medium', status: 'posted', url: post?.data?.url };
  } catch (e) {
    return { channel: 'medium', status: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Percent-encode per RFC 3986 (OAuth 1.0a). */
function pct(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** X (Twitter) v2 tweet via OAuth 1.0a user-context signing (built-in crypto). */
export async function postToX(a: SyndicationInput): Promise<ChannelResult> {
  const ck = process.env.X_API_KEY;
  const cs = process.env.X_API_SECRET;
  const at = process.env.X_ACCESS_TOKEN;
  const ats = process.env.X_ACCESS_SECRET;
  if (!ck || !cs || !at || !ats) return { channel: 'x', status: 'skipped', detail: 'missing X_* keys' };
  try {
    const url = 'https://api.twitter.com/2/tweets';
    const text = `${a.title}\n\n${canonical(a.slug)}`;
    // OAuth1 params (the JSON body is NOT part of the signature for v2 POST).
    const oauth: Record<string, string> = {
      oauth_consumer_key: ck,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: at,
      oauth_version: '1.0',
    };
    const paramStr = Object.keys(oauth)
      .sort()
      .map((k) => `${pct(k)}=${pct(oauth[k])}`)
      .join('&');
    const base = `POST&${pct(url)}&${pct(paramStr)}`;
    const signingKey = `${pct(cs)}&${pct(ats)}`;
    const signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
    const header =
      'OAuth ' +
      Object.entries({ ...oauth, oauth_signature: signature })
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
        .join(', ');

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: header, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return { channel: 'x', status: 'error', detail: `tweet ${res.status}` };
    const j = await res.json();
    const id = j?.data?.id;
    return { channel: 'x', status: 'posted', url: id ? `https://x.com/i/web/status/${id}` : undefined };
  } catch (e) {
    return { channel: 'x', status: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

/** LinkedIn organization share (ugcPosts), linking back to the article. */
export async function postToLinkedIn(a: SyndicationInput): Promise<ChannelResult> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const org = process.env.LINKEDIN_ORG_URN; // e.g. urn:li:organization:12345678
  if (!token || !org) return { channel: 'linkedin', status: 'skipped', detail: 'missing LINKEDIN_* vars' };
  try {
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: org,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: `${a.title} — ${a.dek}` },
            shareMediaCategory: 'ARTICLE',
            media: [
              {
                status: 'READY',
                originalUrl: canonical(a.slug),
                title: { text: a.title.slice(0, 200) },
              },
            ],
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    });
    if (!res.ok) return { channel: 'linkedin', status: 'error', detail: `share ${res.status}` };
    return { channel: 'linkedin', status: 'posted' };
  } catch (e) {
    return { channel: 'linkedin', status: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}
