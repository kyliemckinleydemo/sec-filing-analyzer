import { test, expect } from '@playwright/test';

// E2E coverage for the new sticky site header (replaced the old floating pill):
// wordmark, complete desktop nav, active-state highlighting, sticky positioning,
// and the mobile hamburger menu.

test.describe('Site header — desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('shows the StockHuntr wordmark linking to home', async ({ page }) => {
    const wordmark = page.locator('header a[href="/"]').filter({ hasText: 'StockHuntr' });
    await expect(wordmark.first()).toBeVisible();
  });

  test('shows all primary nav links', async ({ page }) => {
    const header = page.locator('header');
    for (const label of ['Latest Filings', 'Pulse', 'Sectors', 'Ask the Market', 'Track Record', 'Watchlist', 'FAQ']) {
      await expect(header.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
  });

  test('header is sticky-positioned', async ({ page }) => {
    const pos = await page.locator('header').evaluate((el) => getComputedStyle(el).position);
    expect(pos).toBe('sticky');
  });

  test('highlights the active section link', async ({ page }) => {
    await page.goto('/sectors');
    await page.waitForLoadState('networkidle');
    const active = page.locator('header a[aria-current="page"]');
    await expect(active).toHaveText(/Sectors/);
  });
});

test.describe('Site header — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('collapses to a hamburger that opens a working menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const header = page.locator('header');

    // Desktop links are hidden; the toggle is shown.
    const toggle = header.getByRole('button', { name: /open menu/i });
    await expect(toggle).toBeVisible();

    // Open the menu and follow a link.
    await toggle.click();
    const pulseLink = header.getByRole('link', { name: 'Pulse', exact: true }).filter({ visible: true });
    await expect(pulseLink).toBeVisible();
    await pulseLink.click();
    await page.waitForURL(/\/pulse/, { timeout: 10000 });
  });
});
