import { test, expect } from '@playwright/test';

// E2E coverage for /compare — the comparison-query landing pages (index + detail).
// Verifies content, internal links, Article + FAQPage structured data, 404 handling,
// and mobile layout.

test.describe('Compare — index', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/compare');
    await page.waitForLoadState('networkidle');
  });

  test('index loads with heading and lists comparisons', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Compare');
    const links = page.locator('a[href^="/compare/"]');
    expect(await links.count()).toBeGreaterThanOrEqual(5);
  });

  test('clicking a comparison navigates to its page', async ({ page }) => {
    const link = page.locator('a[href^="/compare/"]').first();
    const href = await link.getAttribute('href');
    await link.click();
    await page.waitForURL(new RegExp(href!.replace(/[/]/g, '\\/')), { timeout: 10000 });
    await expect(page.locator('h1')).toBeVisible();
  });

  test('is reachable from the site footer', async ({ page }) => {
    await expect(page.locator('footer a[href="/compare"]').first()).toBeVisible();
  });
});

test.describe('Compare — detail', () => {
  const slug = 'fintool-vs-stockhuntr';

  test.beforeEach(async ({ page }) => {
    await page.goto(`/compare/${slug}`);
    await page.waitForLoadState('networkidle');
  });

  test('renders the comparison title as H1 with a direct answer', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Fintool|StockHuntr/i);
    const body = ((await page.textContent('body')) || '');
    // Direct-answer block + comparison table content.
    expect(body.length).toBeGreaterThan(500);
    expect(body.toLowerCase()).toContain('stockhuntr');
  });

  test('shows a comparison table', async ({ page }) => {
    await expect(page.locator('table').first()).toBeVisible();
  });

  test('emits Article and FAQPage structured data', async ({ page }) => {
    const html = await page.content();
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('FAQPage');
  });

  test('has a not-advice disclaimer and self-canonical', async ({ page }) => {
    const body = ((await page.textContent('body')) || '').toLowerCase();
    expect(body).toMatch(/not investment advice|educational|research/);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain(`/compare/${slug}`);
  });

  test('unknown comparison returns 404', async ({ page }) => {
    const res = await page.goto('/compare/not-a-real-comparison');
    expect(res?.status()).toBe(404);
  });

  test('no horizontal overflow on mobile (390px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/compare/${slug}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
