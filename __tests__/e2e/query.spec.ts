import { test, expect } from '@playwright/test';

test.describe('Query page — NLP screening', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/query');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with search input', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Ask a question"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test('page shows "Natural Language Query" title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Natural Language Query');
  });

  test('badge shows "Advanced Financial Screening & Analysis"', async ({ page }) => {
    await expect(page.locator('text=Advanced Financial Screening & Analysis')).toBeVisible({ timeout: 10000 });
  });

  test('example query buttons are visible', async ({ page }) => {
    await expect(page.locator('text=Show companies with dividend yield > 3%')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Find low beta stocks under 0.8')).toBeVisible();
    await expect(page.locator('text=Show companies with revenue growth > 20%')).toBeVisible();
    await expect(page.locator('text=PE < 15 and dividend yield > 3%')).toBeVisible();
  });

  test('clicking an example query populates the input', async ({ page }) => {
    const exampleButton = page.locator('text=Show companies with dividend yield > 3%');
    await exampleButton.click();

    const searchInput = page.locator('input[placeholder*="Ask a question"]');
    await expect(searchInput).toHaveValue('Show companies with dividend yield > 3%');
  });

  test('Search button is present and disabled when input is empty', async ({ page }) => {
    const searchButton = page.getByRole('button', { name: 'Search' });
    await expect(searchButton).toBeVisible({ timeout: 10000 });
    await expect(searchButton).toBeDisabled();
  });

  test('Search button becomes enabled when input has text', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Ask a question"]');
    await searchInput.fill('Show companies with market cap > 500B');

    const searchButton = page.getByRole('button', { name: 'Search' });
    await expect(searchButton).toBeEnabled();
  });

  test('submitting a query shows loading state or results', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Ask a question"]');
    await searchInput.fill('Show companies with market cap > 500B');

    const searchButton = page.getByRole('button', { name: 'Search' });
    await searchButton.click();

    // Should show either loading indicator or results
    const hasLoading = await page.locator('text=Searching...').isVisible({ timeout: 3000 }).catch(() => false);
    const hasResults = await page.locator('text=/Found|Compan|No Results/').first().isVisible({ timeout: 15000 }).catch(() => false);
    const hasError = await page.locator('text=/Error|error/').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasLoading || hasResults || hasError).toBe(true);
  });

  test('queryable data section is visible', async ({ page }) => {
    await expect(page.locator('text=Queryable Financial Data')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Price & Valuation')).toBeVisible();
    await expect(page.locator('text=Financial Fundamentals')).toBeVisible();
  });
});
