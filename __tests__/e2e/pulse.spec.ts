import { test, expect } from '@playwright/test';

// E2E coverage for /pulse — the recurring "SEC Filing Pulse" report (narrative,
// headline stats, sector heat, significant filings, signals). Verifies content,
// internal links, Article + FAQPage structured data, and mobile layout.

test.describe('SEC Filing Pulse', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pulse');
    await page.waitForLoadState('networkidle');
  });

  test('loads with the Pulse heading and an updated date', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('SEC Filing Pulse');
    const body = ((await page.textContent('body')) || '').toLowerCase();
    expect(body).toContain('updated');
  });

  test('shows a narrative summary and headline stats', async ({ page }) => {
    const body = ((await page.textContent('body')) || '').toLowerCase();
    // Narrative + stats reference analyzed filings and concern.
    expect(body).toContain('analyzed');
    expect(body).toContain('concern');
    expect((body || '').length).toBeGreaterThan(500);
  });

  test('emits Article and FAQPage structured data', async ({ page }) => {
    const html = await page.content();
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('FAQPage');
  });

  test('cross-links to sectors and individual filings', async ({ page }) => {
    // Sector-heat rows link to sector pages; significant filings link to filing pages.
    expect(await page.locator('a[href^="/sectors/"]').count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator('a[href^="/filing/"]').count()).toBeGreaterThanOrEqual(1);
  });

  test('has a not-advice disclaimer and self-canonical', async ({ page }) => {
    const body = ((await page.textContent('body')) || '').toLowerCase();
    expect(body).toMatch(/not investment advice|research/);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain('/pulse');
  });

  test('no horizontal overflow on mobile (390px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pulse');
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
