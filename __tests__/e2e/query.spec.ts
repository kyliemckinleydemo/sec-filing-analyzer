/**
 * @module query.spec.ts
 * @description End-to-end test suite for the "Ask the Market" query page functionality
 *
 * PURPOSE:
 * - Validates the UI components and interactions of the merged query interface
 * - Tests stock screening and AI filing analysis features
 * - Ensures proper page loading, element visibility, and user interaction flows
 * - Verifies mode switching between Auto, Screen, and AI query modes
 * - Tests input validation, example query population, and search submission
 * - Confirms filter toggles, loading states, and results display behavior
 *
 * EXPORTS:
 * - N/A (Playwright test suite, no exports)
 *
 * CLAUDE NOTES:
 * - Uses Playwright's test framework for browser automation and assertions
 * - All tests navigate to '/query' route and wait for network idle state
 * - Tests include timeout configurations (10000ms, 15000ms) for async elements
 * - Validates both stock screening queries (dividend yield, beta, PE ratio) and AI analysis queries
 * - Tests dynamic UI behavior: button state changes, mode switching, filter expansion
 * - Verifies three possible search outcomes: loading indicator, results, or error state
 * - Includes accessibility testing via getByRole selectors for search button
 * - Tests cover both visual presence and interactive functionality of components
 */

import { test, expect } from '@playwright/test';

test.describe('Ask the Market page — merged query + AI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/query');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with search input', async ({ page }) => {
    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test('page shows "Ask the Market" title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Ask the Market');
  });

  test('badge shows "Stock Screening + AI Filing Analysis"', async ({ page }) => {
    await expect(page.locator('text=Stock Screening + AI Filing Analysis')).toBeVisible({ timeout: 10000 });
  });

  test('mode toggle buttons are visible (Auto, Screen, AI)', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Auto', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Screen', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI', exact: true })).toBeVisible();
  });

  test('stock screening example queries are visible', async ({ page }) => {
    await expect(page.locator('text=Show companies with dividend yield > 3%')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Find low beta stocks under 0.8')).toBeVisible();
    await expect(page.locator('text=Show companies with revenue growth > 20%')).toBeVisible();
    await expect(page.locator('text=PE < 15 and dividend yield > 3%')).toBeVisible();
  });

  test('AI analysis example queries are visible', async ({ page }) => {
    await expect(page.getByText('AI Filing Analysis', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=What are AAPL\'s biggest risk factors from recent filings?')).toBeVisible();
  });

  test('clicking a screening example populates the input', async ({ page }) => {
    const exampleButton = page.locator('text=Show companies with dividend yield > 3%');
    await exampleButton.click();

    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toHaveValue('Show companies with dividend yield > 3%');
  });

  test('Search button is present and disabled when input is empty', async ({ page }) => {
    const searchButton = page.getByRole('button', { name: 'Search' });
    await expect(searchButton).toBeVisible({ timeout: 10000 });
    await expect(searchButton).toBeDisabled();
  });

  test('Search button becomes enabled when input has text', async ({ page }) => {
    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill('Show companies with market cap > 500B');

    const searchButton = page.getByRole('button', { name: 'Search' });
    await expect(searchButton).toBeEnabled();
  });

  test('submitting a query shows loading state or results', async ({ page }) => {
    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill('Show companies with market cap > 500B');

    const searchButton = page.getByRole('button', { name: 'Search' });
    await searchButton.click();

    // Should show either loading indicator or results
    const hasLoading = await page.locator('text=Searching...').isVisible({ timeout: 3000 }).catch(() => false);
    const hasResults = await page.locator('text=/Found|Compan|No Results|No Screening Match/').first().isVisible({ timeout: 15000 }).catch(() => false);
    const hasError = await page.locator('text=/Error|error/').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasLoading || hasResults || hasError).toBe(true);
  });

  test('data availability section is visible', async ({ page }) => {
    await expect(page.locator('text=What You Can Query')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Price & Valuation')).toBeVisible();
    await expect(page.locator('text=Fundamentals')).toBeVisible();
    await expect(page.locator('text=AI Analysis')).toBeVisible();
  });

  test('ticker/sector filter toggle is visible', async ({ page }) => {
    await expect(page.locator('text=Add ticker or sector filter')).toBeVisible({ timeout: 10000 });
  });

  test('clicking filter toggle reveals ticker and sector inputs', async ({ page }) => {
    await page.locator('text=Add ticker or sector filter').click();

    const tickerInput = page.locator('input[placeholder*="AAPL"]');
    await expect(tickerInput).toBeVisible({ timeout: 5000 });

    const sectorSelect = page.locator('select');
    await expect(sectorSelect).toBeVisible();
  });

  test('switching to AI mode changes button label to "Ask AI"', async ({ page }) => {
    await page.getByRole('button', { name: 'AI', exact: true }).click();

    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill('test');

    const askAIButton = page.getByRole('button', { name: 'Ask AI' });
    await expect(askAIButton).toBeVisible({ timeout: 5000 });
  });
});
