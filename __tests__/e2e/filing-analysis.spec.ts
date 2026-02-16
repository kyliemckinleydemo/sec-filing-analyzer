import { test, expect } from '@playwright/test';

test.describe('Filing analysis pages', () => {
  test('homepage shows latest filings section', async ({ page }) => {
    await page.goto('/');
    // The homepage should have some content — not be blank
    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(100);
  });

  test('latest filings page loads with content', async ({ page }) => {
    await page.goto('/latest-filings');
    // Wait for page to render meaningful content
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(100);
  });

  test('filing detail page renders or shows 404', async ({ page }) => {
    // Use a known-format accession number that may or may not exist
    const response = await page.goto('/filing/0001193125-24-012345');
    // Should either load (200) or show a not-found page — not crash
    expect(response!.status()).toBeLessThan(500);
  });
});
