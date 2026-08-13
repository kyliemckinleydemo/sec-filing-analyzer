/**
 * @module lib/indexnow
 * @description Pings the IndexNow API (Bing, and via it other participating engines)
 * when pages are created or updated, so new filing pages get crawled within minutes
 * instead of days. Bing's index also grounds ChatGPT web search and Copilot.
 *
 * The key is intentionally public — IndexNow verifies ownership by fetching
 * the matching key file served from the site root (public/<key>.txt).
 */

const INDEXNOW_KEY = '0a01cbeff859b5dc55b508ec35e6bb73';
const HOST = 'www.stockhuntr.net';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS_PER_PING = 500;

/**
 * Submits site-relative paths (e.g. "/filing/0001234567-24-000001") to IndexNow.
 * Fail-soft: logs and returns false on any error — callers must never fail
 * their own job because a search ping did not go through.
 */
export async function submitToIndexNow(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;

  // Only ping the live endpoint from production — avoids submitting test
  // fixtures or local dev URLs to the real IndexNow API.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[IndexNow] Skipped (${paths.length} URLs) — not production`);
    return true;
  }

  const urlList = Array.from(new Set(paths))
    .slice(0, MAX_URLS_PER_PING)
    .map((p) => `https://${HOST}${p.startsWith('/') ? p : `/${p}`}`);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
    });

    // IndexNow returns 200 or 202 on success
    if (res.status === 200 || res.status === 202) {
      console.log(`[IndexNow] Submitted ${urlList.length} URLs (status ${res.status})`);
      return true;
    }
    console.error(`[IndexNow] Submission rejected: ${res.status} ${await res.text()}`);
    return false;
  } catch (error: any) {
    console.error(`[IndexNow] Submission failed: ${error.message}`);
    return false;
  }
}
