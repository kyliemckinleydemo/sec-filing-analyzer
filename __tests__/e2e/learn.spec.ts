import { test, expect } from '@playwright/test';

// E2E coverage for the /learn explainer library (index + explainer detail pages),
// added in the GEO-content work. Verifies content, internal links, structured data,
// 404 handling, and mobile layout integrity.

test.describe('Learn — explainer library index', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/learn');
    await page.waitForLoadState('networkidle');
  });

  test('index loads with heading and lists explainers', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('How to Read SEC Filings');
    const explainerLinks = page.locator('a[href^="/learn/"]');
    // At least ~10 curated explainers are linked.
    expect(await explainerLinks.count()).toBeGreaterThanOrEqual(10);
  });

  test('clicking an explainer card navigates to its page', async ({ page }) => {
    const firstLink = page.locator('a[href^="/learn/"]').first();
    const href = await firstLink.getAttribute('href');
    await firstLink.click();
    await page.waitForURL(new RegExp(href!.replace(/[/]/g, '\\/')), { timeout: 10000 });
    await expect(page.locator('h1')).toBeVisible();
  });

  test('index is reachable from the site footer', async ({ page }) => {
    const footerLearn = page.locator('footer a[href="/learn"]');
    await expect(footerLearn.first()).toBeVisible();
  });
});

test.describe('Learn — explainer detail page', () => {
  const slug = 'what-is-an-8-k-filing';

  test.beforeEach(async ({ page }) => {
    await page.goto(`/learn/${slug}`);
    await page.waitForLoadState('networkidle');
  });

  test('renders the question as H1 with a direct answer', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('8-K');
    // The direct-answer block (the extractable snippet) is present and non-trivial.
    const body = (await page.textContent('body')) || '';
    expect(body.length).toBeGreaterThan(400);
  });

  test('shows a last-updated date and a not-advice disclaimer', async ({ page }) => {
    const body = (await page.textContent('body')) || '';
    expect(body.toLowerCase()).toContain('updated');
    expect(body.toLowerCase()).toMatch(/not investment advice|educational|informational/);
  });

  test('emits Article and FAQPage structured data', async ({ page }) => {
    const html = await page.content();
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('FAQPage');
  });

  test('has a canonical link to itself', async ({ page }) => {
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain(`/learn/${slug}`);
  });

  test('unknown slug returns 404', async ({ page }) => {
    const res = await page.goto('/learn/this-slug-does-not-exist');
    expect(res?.status()).toBe(404);
  });

  test('no horizontal overflow on mobile (390px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/learn/${slug}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
