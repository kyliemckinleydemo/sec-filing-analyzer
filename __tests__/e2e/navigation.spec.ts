import { test, expect } from '@playwright/test';

test.describe('Navigation smoke tests', () => {
  test('homepage loads without crashing', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('/latest-filings loads', async ({ page }) => {
    await page.goto('/latest-filings');
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('/paper-trading loads', async ({ page }) => {
    await page.goto('/paper-trading');
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('/watchlist loads', async ({ page }) => {
    await page.goto('/watchlist');
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });

  test('/faq loads', async ({ page }) => {
    await page.goto('/faq');
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator('text=Application error')).not.toBeVisible();
  });
});
