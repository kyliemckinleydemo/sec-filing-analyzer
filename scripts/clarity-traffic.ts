/**
 * @module scripts/clarity-traffic
 * @description Pulls web-traffic stats from the Microsoft Clarity Data Export API
 * ("Project Live Insights") — our only analytics source (client-side Clarity tag;
 * nothing is stored in our DB). Reports total sessions / page views and a per-URL
 * breakdown (highlighting /news pages).
 *
 * The Clarity Data Export API caps at the LAST 1–3 DAYS (numOfDays 1|2|3) — there is
 * no longer window. For a 4-day (or longer) figure, use the Clarity dashboard with a
 * custom date range instead.
 *
 * Auth: set CLARITY_API_TOKEN (Clarity dashboard → Settings → Data export → Generate
 * API token). The token is read from the environment ONLY — never commit it.
 *
 * Usage:
 *   CLARITY_API_TOKEN=... npx tsx scripts/clarity-traffic.ts [numOfDays]
 *   (numOfDays defaults to 3, the API max)
 */

const ENDPOINT = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

async function fetchInsights(token: string, numOfDays: number, dimension1?: string) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('numOfDays', String(numOfDays));
  if (dimension1) url.searchParams.set('dimension1', dimension1);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Clarity API ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Clarity API returned non-JSON: ${text.slice(0, 300)}`);
  }
}

/** Pull the Traffic metric's totals out of the (array-of-metrics) response shape. */
function summarizeTraffic(payload: any): string[] {
  const out: string[] = [];
  const metrics = Array.isArray(payload) ? payload : payload?.metrics ?? [];
  const traffic = metrics.find((m: any) => (m?.metricName || m?.name) === 'Traffic');
  const info = traffic?.information?.[0];
  if (info) {
    const keys = ['totalSessionCount', 'distinctUserCount', 'totalBotSessionCount', 'pagesPerSessionPercentage'];
    for (const k of keys) if (info[k] != null) out.push(`  ${k}: ${info[k]}`);
  }
  if (out.length === 0) out.push('  (no Traffic metric found — raw keys: ' + JSON.stringify(metrics.map((m: any) => m?.metricName ?? m?.name)) + ')');
  return out;
}

/** List per-URL rows (when dimension1=URL), newest Clarity shape tolerant. */
function summarizeByUrl(payload: any, limit = 20): string[] {
  const metrics = Array.isArray(payload) ? payload : payload?.metrics ?? [];
  const traffic = metrics.find((m: any) => (m?.metricName || m?.name) === 'Traffic');
  const rows: any[] = traffic?.information ?? [];
  const parsed = rows
    .map((r: any) => ({
      url: r.Url ?? r.URL ?? r.url ?? '(unknown)',
      sessions: Number(r.totalSessionCount ?? r.sessions ?? 0),
      users: Number(r.distinctUserCount ?? 0),
    }))
    .filter((r) => r.url !== '(unknown)')
    .sort((a, b) => b.sessions - a.sessions);
  const out: string[] = [];
  out.push(`  Top pages by sessions (of ${parsed.length}):`);
  parsed.slice(0, limit).forEach((r) => out.push(`    ${r.sessions.toString().padStart(5)}  ${r.url}`));
  const news = parsed.filter((r) => r.url.includes('/news'));
  const newsSessions = news.reduce((s, r) => s + r.sessions, 0);
  out.push(`  /news pages: ${news.length} with traffic, ${newsSessions} total sessions`);
  return out;
}

async function main() {
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) {
    console.error('CLARITY_API_TOKEN not set. Generate one in Clarity → Settings → Data export.');
    process.exit(1);
  }
  const numOfDays = Math.min(3, Math.max(1, Number(process.argv[2] || '3')));
  console.log(`=== Microsoft Clarity traffic — last ${numOfDays} day(s) ===`);

  const totals = await fetchInsights(token, numOfDays);
  console.log('Site totals:');
  summarizeTraffic(totals).forEach((l) => console.log(l));

  console.log('\nBy URL:');
  try {
    const byUrl = await fetchInsights(token, numOfDays, 'URL');
    summarizeByUrl(byUrl).forEach((l) => console.log(l));
  } catch (e: any) {
    console.log('  (per-URL breakdown unavailable: ' + e.message + ')');
  }
}

main().catch((e) => {
  console.error('clarity-traffic error:', e.message);
  process.exit(1);
});
