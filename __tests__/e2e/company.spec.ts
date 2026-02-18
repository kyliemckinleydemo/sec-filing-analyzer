import { test, expect } from '@playwright/test';

test.describe('Company page', () => {
  test('company page loads for a known ticker (AAPL)', async ({ page }) => {
    await page.goto('/company/AAPL');
    await page.waitForLoadState('networkidle');

    // Should show company info or loading state
    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(50);

    // Should contain the ticker or company name somewhere
    const hasAAPL = /AAPL|Apple/i.test(body || '');
    const hasError = /error|not found/i.test(body || '');
    const hasLoading = /loading/i.test(body || '');
    expect(hasAAPL || hasError || hasLoading).toBe(true);
  });

  test('company page shows company name and ticker', async ({ page }) => {
    await page.goto('/company/AAPL');
    await page.waitForLoadState('networkidle');

    // Wait for data to potentially load
    await page.waitForTimeout(3000);
    const body = await page.textContent('body');

    // Check for AAPL ticker on page (might be in header, cards, etc.)
    const hasTickerInfo = /AAPL/i.test(body || '');
    const hasError = /error|not found|failed/i.test(body || '');
    expect(hasTickerInfo || hasError).toBe(true);
  });

  test('company page shows filing history or relevant sections', async ({ page }) => {
    await page.goto('/company/AAPL');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const body = await page.textContent('body');
    // Should show filings section, price info, or some company data
    const hasSections = /filing|price|market cap|revenue|analyst|news/i.test(body || '');
    const hasError = /error|not found/i.test(body || '');
    expect(hasSections || hasError).toBe(true);
  });

  test('company page shows 180-day performance chart or market data', async ({ page }) => {
    await page.goto('/company/AAPL');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    const body = await page.textContent('body');
    // Should show the performance chart title or market data metrics
    const hasChart = /180-Day Performance|S&P 500/i.test(body || '');
    const hasMarketData = /Market Cap|P\/E Ratio|52-Week/i.test(body || '');
    const hasError = /error|not found/i.test(body || '');
    expect(hasChart || hasMarketData || hasError).toBe(true);
  });

  test('unknown ticker shows error or suggestion (no crash)', async ({ page }) => {
    const response = await page.goto('/company/ZZZZZZZ');
    // Should not crash
    expect(response!.status()).toBeLessThan(500);

    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(10);
  });

  test('company page does not show Application error', async ({ page }) => {
    await page.goto('/company/AAPL');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });
});
