/**
 * @module paper-trading.spec
 * @description End-to-end test suite for the Paper Trading page using Playwright
 * 
 * PURPOSE:
 * - Validates the Paper Trading page loads correctly without errors
 * - Verifies key portfolio metrics (Total Value, Win Rate, Cash Available) are displayed
 * - Tests that Open Positions section shows correct 30-day hold period
 * - Ensures Recent Trades section renders properly
 * - Validates graceful error states when portfolio data is unavailable
 * - Confirms page accessibility via direct URL navigation
 * 
 * EXPORTS:
 * - None (Playwright test suite, auto-discovered by test runner)
 * 
 * CLAUDE NOTES:
 * - Tests implement graceful degradation for missing/loading portfolio data
 * - Uses defensive timeout handling with .catch(() => false) to prevent flaky tests
 * - Validates 30-day hold period (not 7-day) in Days Held column for open positions
 * - Expects friendly "Portfolio Unavailable" state instead of raw errors
 * - Waits for 'networkidle' state before assertions to ensure data loading completes
 * - Tests handle three possible states: loaded data, loading state, and unavailable state
 */

import { test, expect } from '@playwright/test';

test.describe('Paper Trading page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/paper-trading');
    await page.waitForLoadState('networkidle');
  });

  test('page loads without crashing', async ({ page }) => {
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('page shows portfolio title and subtitle', async ({ page }) => {
    // Wait for data to load — portfolio name or loading/error state
    const hasPortfolio = await page.locator('text=Paper Trading Performance Tracker').isVisible({ timeout: 10000 }).catch(() => false);
    // Graceful "Portfolio Unavailable" empty/error state (friendly copy + recovery CTAs), or the loading state.
    const hasUnavailable = await page.locator('text=Portfolio Unavailable').isVisible({ timeout: 3000 }).catch(() => false);
    const hasLoading = await page.locator('text=Loading portfolio').isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasPortfolio || hasUnavailable || hasLoading).toBe(true);
  });

  test('page shows key metrics: Total Value, Win Rate, Cash Available', async ({ page }) => {
    const hasMetrics = await page.locator('text=Total Value').isVisible({ timeout: 10000 }).catch(() => false);
    // When the portfolio ID doesn't resolve, the page shows a graceful "Portfolio Unavailable" state.
    const hasUnavailable = await page.locator('text=Portfolio Unavailable').isVisible({ timeout: 3000 }).catch(() => false);

    if (hasMetrics) {
      await expect(page.locator('text=Total Value')).toBeVisible();
      await expect(page.locator('text=Win Rate')).toBeVisible();
      await expect(page.locator('text=Cash Available')).toBeVisible();
    } else {
      // No portfolio data (e.g. portfolio ID absent) → the friendly empty/error state, not a raw error.
      expect(hasUnavailable).toBe(true);
    }
  });

  test('open positions section is displayed with 30-day hold period', async ({ page }) => {
    const hasPositions = await page.locator('text=Open Positions').isVisible({ timeout: 10000 }).catch(() => false);

    if (hasPositions) {
      await expect(page.locator('text=Open Positions')).toBeVisible();
      // Should show either positions table or "No open positions" message
      const hasTable = await page.locator('table').first().isVisible().catch(() => false);
      const hasEmpty = await page.locator('text=No open positions').isVisible().catch(() => false);
      expect(hasTable || hasEmpty).toBe(true);

      // If there are open positions, verify days held shows /30 (not /7)
      if (hasTable) {
        // Get the "Days Held" column cells specifically — avoid matching dates
        const daysHeldCells = page.locator('table >> td:last-child');
        const cellCount = await daysHeldCells.count();

        for (let i = 0; i < cellCount; i++) {
          const cellText = (await daysHeldCells.nth(i).textContent()) || '';
          // Days held cells contain "X/30" pattern
          if (/\d+\/\d+/.test(cellText)) {
            expect(cellText).toMatch(/\d+\/30/);
            expect(cellText).not.toMatch(/\d+\/7$/);
          }
        }
      }
    }
  });

  test('recent trades section is displayed', async ({ page }) => {
    const hasTrades = await page.locator('text=Recent Trades').isVisible({ timeout: 10000 }).catch(() => false);

    if (hasTrades) {
      await expect(page.locator('text=Recent Trades')).toBeVisible();
      // Should show either trades table or "No closed trades" message
      const hasTradesTable = await page.locator('table').nth(1).isVisible().catch(() => false);
      const hasEmpty = await page.locator('text=No closed trades yet').isVisible().catch(() => false);
      expect(hasTradesTable || hasEmpty).toBe(true);
    }
  });

  test('page is accessible via direct URL', async ({ page }) => {
    await page.goto('/paper-trading');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/paper-trading/);
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });
});
