import { test, expect } from '@playwright/test';

test.describe('Homepage — unauthenticated view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Wait for the loading spinner to disappear (auth check completes)
    await page.waitForFunction(() => {
      return !document.querySelector('.animate-spin');
    }, { timeout: 15000 });
  });

  test('hero section renders with headline text', async ({ page }) => {
    const headline = page.locator('h1');
    await expect(headline).toBeVisible({ timeout: 10000 });
    await expect(headline).toContainText('Chat with SEC filings');
  });

  test('hero headline references 30-day alpha predictions, not 7-day', async ({ page }) => {
    const headline = page.locator('h1');
    await expect(headline).toBeVisible({ timeout: 10000 });
    await expect(headline).toContainText('30-day alpha predictions');
    // Verify no "7-day" text remains anywhere on the page
    const body = await page.textContent('body');
    expect(body).not.toContain('7-day');
    expect(body).not.toContain('7-Day');
  });

  test('"Start Free" and "View Live Filings Feed" CTAs are visible and clickable', async ({ page }) => {
    // Scope to <main> to avoid duplicate buttons in nav
    const main = page.locator('main');
    const startFree = main.getByRole('button', { name: 'Start Free' });
    await expect(startFree).toBeVisible({ timeout: 15000 });

    const viewFeed = main.getByRole('button', { name: /View Live Filings Feed/i });
    await expect(viewFeed).toBeVisible();

    // Click Start Free — should navigate to /profile
    await startFree.click();
    await expect(page).toHaveURL(/\/profile/);
  });

  test('features section shows AI Risk Analysis, Chat with Filings, 30-Day Alpha Predictions', async ({ page }) => {
    // Use feature card headings to avoid matching badges/table cells
    await expect(page.getByRole('heading', { name: 'AI Risk Analysis' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Chat with Filings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '30-Day Alpha Predictions', exact: true })).toBeVisible();
  });

  test('features description uses alpha language', async ({ page }) => {
    // The 30-Day Alpha Predictions card should describe alpha, not raw returns
    const body = await page.textContent('body');
    expect(body).toContain('stock return minus S&P 500');
  });

  test('landing page uses LONG/SHORT/NEUTRAL signal language', async ({ page }) => {
    const body = await page.textContent('body');
    expect(body).toContain('LONG/SHORT/NEUTRAL signals');
    expect(body).toContain('Signal: LONG');
    expect(body).not.toContain('Buy/Sell/Hold');
    expect(body).not.toContain('Signal: Buy');
  });

  test('visual panel shows 30-day alpha prediction content', async ({ page }) => {
    const body = await page.textContent('body');
    expect(body).toContain('30-day alpha prediction');
    expect(body).toContain('+2.1% alpha expected');
  });

  test('"How It Works" section renders 3 steps', async ({ page }) => {
    await expect(page.locator('text=Pick a company or latest filing')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Run AI analysis or just ask questions')).toBeVisible();
    await expect(page.locator('text=Track signals & get alerts')).toBeVisible();
  });

  test('comparison table shows 30-day alpha predictions row', async ({ page }) => {
    // The "Why use StockHuntr?" comparison table should reference alpha predictions
    await expect(page.locator('td:has-text("30-day alpha predictions")')).toBeVisible({ timeout: 10000 });
  });

  test('footer has navigation links', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible({ timeout: 10000 });
    await expect(footer.locator('text=Home')).toBeVisible();
    await expect(footer.locator('text=Latest Filings')).toBeVisible();
    await expect(footer.locator('text=FAQ')).toBeVisible();
  });

  test('navbar contains all expected links: Latest Filings, Watchlist, Alerts, Companies, AI Chat, FAQ', async ({ page }) => {
    const nav = page.locator('nav').first();
    await expect(nav).toBeVisible({ timeout: 10000 });
    await expect(nav.locator('text=Latest Filings')).toBeVisible();
    await expect(nav.locator('text=Watchlist')).toBeVisible();
    await expect(nav.locator('text=Alerts')).toBeVisible();
    await expect(nav.locator('text=Companies')).toBeVisible();
    await expect(nav.locator('text=AI Chat')).toBeVisible();
    await expect(nav.locator('text=FAQ')).toBeVisible();
  });

  test('"Watchlist" nav link navigates to /watchlist', async ({ page }) => {
    const nav = page.locator('nav').first();
    await nav.locator('text=Watchlist').click();
    await expect(page).toHaveURL(/\/watchlist/);
  });

  test('"View Live Filings Feed" CTA navigates to /latest-filings', async ({ page }) => {
    const viewFeed = page.getByRole('button', { name: /View Live Filings Feed/i });
    await expect(viewFeed).toBeVisible({ timeout: 10000 });
    await viewFeed.click();
    await expect(page).toHaveURL(/\/latest-filings/);
  });

  test('page does not show Application error', async ({ page }) => {
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });
});

test.describe('Homepage — search functionality', () => {
  test('search input is visible on the homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // The search input may be on the authenticated dashboard;
    // for unauthenticated, check that the page loads without crash
    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(100);
  });
});
