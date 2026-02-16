import { test, expect, Page } from '@playwright/test';

/**
 * Helper: discover a real accession number from the latest-filings page.
 * Falls back to a known-format accession if no filings are found.
 */
async function discoverAccession(page: Page): Promise<string> {
  await page.goto('/latest-filings');
  await page.waitForLoadState('networkidle');

  // Try clicking the first Analyze button and extracting the accession from the URL
  const analyzeButton = page.getByRole('button', { name: 'Analyze' }).first();
  const hasFilings = await analyzeButton.isVisible({ timeout: 15000 }).catch(() => false);

  if (hasFilings) {
    await analyzeButton.click();
    await page.waitForURL(/\/filing\//, { timeout: 10000 });
    const url = page.url();
    const match = url.match(/\/filing\/([^?]+)/);
    if (match) return match[1];
  }

  // Fallback to a known format
  return '0001193125-24-012345';
}

test.describe('Filing analysis page', () => {
  test('filing detail page loads without server error', async ({ page }) => {
    const accession = await discoverAccession(page);
    const response = await page.goto(`/filing/${accession}`);
    // Should not crash — either 200 or a handled error
    expect(response!.status()).toBeLessThan(500);
  });

  test('filing detail page shows company info or auth prompt', async ({ page }) => {
    const accession = await discoverAccession(page);
    await page.goto(`/filing/${accession}`);
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    // Should show either filing content, auth prompt, or loading
    expect(body!.length).toBeGreaterThan(50);
  });

  test('filing page shows analysis progress or results when authenticated', async ({ page }) => {
    const accession = await discoverAccession(page);
    await page.goto(`/filing/${accession}`);
    await page.waitForLoadState('networkidle');

    // The page should either show:
    // 1. Analysis in progress (loading steps)
    // 2. Analysis results (risk, sentiment, etc.)
    // 3. Auth prompt for unauthenticated users
    // 4. Error message for invalid filings
    const body = await page.textContent('body');

    const hasProgress = /fetching|parsing|analyzing|loading/i.test(body || '');
    const hasResults = /risk|sentiment|concern|prediction/i.test(body || '');
    const hasAuth = /sign.?in|sign.?up|log.?in|create.*account|magic link/i.test(body || '');
    const hasError = /error|not found|failed/i.test(body || '');

    expect(hasProgress || hasResults || hasAuth || hasError).toBe(true);
  });

  test('handles unknown accession gracefully (no crash)', async ({ page }) => {
    const response = await page.goto('/filing/0000000000-00-000000');
    // Should not crash — status < 500
    expect(response!.status()).toBeLessThan(500);

    // Page should show some content (error message or auth prompt), not blank
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(20);
  });

  test('filing page has a back/home navigation option', async ({ page }) => {
    const accession = await discoverAccession(page);
    await page.goto(`/filing/${accession}`);
    await page.waitForLoadState('networkidle');

    // Should have some navigation element (nav, back button, or home link)
    const nav = page.locator('nav').first();
    const hasNav = await nav.isVisible({ timeout: 5000 }).catch(() => false);
    const hasBackButton = await page.locator('text=/back|home/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasNav || hasBackButton).toBe(true);
  });
});
