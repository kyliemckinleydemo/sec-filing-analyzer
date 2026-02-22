/**
 * @module chat.spec.ts
 * @description End-to-end tests for chat and query page functionality using Playwright
 * 
 * PURPOSE:
 * - Tests redirect behavior from legacy /chat routes to /query routes
 * - Validates AI-powered query interface features and interactions
 * - Verifies ticker and sector filtering functionality
 * - Ensures proper handling of URL parameters and state management
 * - Tests AI mode query submission and response handling
 * - Validates example query interactions and input population
 * 
 * EXPORTS:
 * - None (test suite file)
 * 
 * CLAUDE NOTES:
 * - Uses Playwright test framework for browser automation
 * - Tests cover both authenticated and unauthenticated user flows
 * - AI response tests account for potential authentication errors
 * - Mutual exclusivity between ticker and sector filters is validated
 * - Network idle state used to ensure page stability before interactions
 * - Timeout values set to accommodate potential API delays (5-10 seconds)
 */

import { test, expect } from '@playwright/test';

test.describe('Chat page — redirects to Ask the Market', () => {
  test('/chat redirects to /query', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForURL(/\/query/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/query/);
  });

  test('/chat?ticker=AAPL redirects to /query?ticker=AAPL', async ({ page }) => {
    await page.goto('/chat?ticker=AAPL');
    await page.waitForURL(/\/query\?ticker=AAPL/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/query\?ticker=AAPL/);
  });
});

test.describe('Ask the Market page — AI features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/query');
    await page.waitForLoadState('networkidle');
  });

  test('ticker auto-fills from URL parameter', async ({ page }) => {
    await page.goto('/query?ticker=AAPL');
    await page.waitForLoadState('networkidle');

    // Filters should be visible when ticker is in URL
    const tickerInput = page.locator('input[placeholder*="AAPL"]');
    await expect(tickerInput).toHaveValue('AAPL', { timeout: 5000 });
  });

  test('sector dropdown is visible after expanding filters', async ({ page }) => {
    // Click filter toggle to expand
    await page.locator('text=Add ticker or sector filter').click();

    const sectorSelect = page.locator('select');
    await expect(sectorSelect).toBeVisible({ timeout: 10000 });

    // Check that known sectors are available as options
    await expect(sectorSelect.locator('option[value="Technology"]')).toBeAttached();
    await expect(sectorSelect.locator('option[value="Healthcare"]')).toBeAttached();
    await expect(sectorSelect.locator('option[value="Energy"]')).toBeAttached();
  });

  test('selecting a sector clears ticker input', async ({ page }) => {
    // Expand filters
    await page.locator('text=Add ticker or sector filter').click();

    const tickerInput = page.locator('input[placeholder*="AAPL"]');
    await tickerInput.fill('AAPL');
    await expect(tickerInput).toHaveValue('AAPL');

    const sectorSelect = page.locator('select');
    await sectorSelect.selectOption('Technology');

    await expect(tickerInput).toHaveValue('', { timeout: 3000 });
  });

  test('entering a ticker clears sector dropdown', async ({ page }) => {
    // Expand filters
    await page.locator('text=Add ticker or sector filter').click();

    const sectorSelect = page.locator('select');
    await sectorSelect.selectOption('Healthcare');
    await expect(sectorSelect).toHaveValue('Healthcare');

    const tickerInput = page.locator('input[placeholder*="AAPL"]');
    await tickerInput.fill('MSFT');

    await expect(sectorSelect).toHaveValue('', { timeout: 3000 });
  });

  test('AI mode sends query and shows response or auth error', async ({ page }) => {
    // Switch to AI mode
    await page.locator('button:has-text("AI")').click();

    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill('What are the latest filings?');

    const askAIButton = page.getByRole('button', { name: 'Ask AI' });
    await askAIButton.click();

    // Should either show the user message, loading, or auth error
    const hasUserMessage = await page.locator('text=What are the latest filings?').isVisible({ timeout: 5000 }).catch(() => false);
    const hasThinking = await page.locator('text=Thinking...').isVisible({ timeout: 3000 }).catch(() => false);
    const hasAnalyzing = await page.locator('text=Analyzing...').isVisible({ timeout: 3000 }).catch(() => false);
    const hasAuthError = await page.locator('text=/sign.?up|authentication|free account/i').first().isVisible({ timeout: 10000 }).catch(() => false);

    expect(hasUserMessage || hasThinking || hasAnalyzing || hasAuthError).toBe(true);
  });

  test('clicking an AI example sets input and mode', async ({ page }) => {
    const aiExample = page.locator('text=What are AAPL\'s biggest risk factors from recent filings?');
    await aiExample.click();

    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toHaveValue("What are AAPL's biggest risk factors from recent filings?");
  });
});
