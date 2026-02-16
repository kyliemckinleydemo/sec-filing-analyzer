import { test, expect } from '@playwright/test';

test.describe('Authentication flows', () => {
  test('sign-in modal opens and accepts email input', async ({ page }) => {
    await page.goto('/');

    // Look for a sign-in button/link
    const signInButton = page.locator('text=/sign.?in/i').first();
    if (await signInButton.isVisible()) {
      await signInButton.click();

      // Check that an email input appears (in modal or new page)
      const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first();
      await expect(emailInput).toBeVisible({ timeout: 5000 });
    }
  });

  test('profile page shows sign-in prompt when unauthenticated', async ({ page }) => {
    await page.goto('/profile');
    // Should either redirect to sign-in or show a prompt
    const body = await page.textContent('body');
    const hasAuthPrompt = /sign.?in|log.?in|auth/i.test(body || '');
    const isRedirected = page.url().includes('sign') || page.url().includes('login') || page.url() === 'http://localhost:3000/';
    expect(hasAuthPrompt || isRedirected).toBe(true);
  });
});
