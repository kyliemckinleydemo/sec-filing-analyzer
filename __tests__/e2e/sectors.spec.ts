import { test, expect } from '@playwright/test';

// E2E coverage for the /sectors insight pages (cross-sectional index + per-sector
// detail), added in the aggregate-data GEO work. Verifies content, sector links,
// Dataset + FAQPage structured data, 404 handling, and mobile layout.

test.describe('Sectors — index', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sectors');
    await page.waitForLoadState('networkidle');
  });

  test('index loads with heading and lists sectors', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('SEC Filings by Sector');
    const sectorLinks = page.locator('a[href^="/sectors/"]');
    // 11 canonical sectors.
    expect(await sectorLinks.count()).toBeGreaterThanOrEqual(10);
  });

  test('clicking a sector navigates to its detail page', async ({ page }) => {
    const link = page.locator('a[href^="/sectors/"]').first();
    const href = await link.getAttribute('href');
    await link.click();
    await page.waitForURL(new RegExp(href!.replace(/[/]/g, '\\/')), { timeout: 10000 });
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('Sectors — detail', () => {
  const slug = 'financials';

  test.beforeEach(async ({ page }) => {
    await page.goto(`/sectors/${slug}`);
    await page.waitForLoadState('networkidle');
  });

  test('renders sector name in H1 with aggregate stats', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Financials');
    const body = ((await page.textContent('body')) || '').toLowerCase();
    expect(body).toContain('concern');
    expect(body).toContain('filings');
  });

  test('emits Dataset and FAQPage structured data', async ({ page }) => {
    const html = await page.content();
    expect(html).toContain('"@type":"Dataset"');
    expect(html).toContain('FAQPage');
  });

  test('has a not-advice disclaimer and cross-links', async ({ page }) => {
    const body = ((await page.textContent('body')) || '').toLowerCase();
    expect(body).toMatch(/not investment advice|research/);
    await expect(page.locator('a[href="/sectors"]').first()).toBeVisible();
  });

  test('has a self-canonical link', async ({ page }) => {
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain(`/sectors/${slug}`);
  });

  test('unknown sector returns 404', async ({ page }) => {
    const res = await page.goto('/sectors/not-a-real-sector');
    expect(res?.status()).toBe(404);
  });

  test('no horizontal overflow on mobile (390px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sectors/${slug}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
