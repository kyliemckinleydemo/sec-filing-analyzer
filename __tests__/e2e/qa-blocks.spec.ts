import { test, expect } from '@playwright/test';

// E2E coverage for the grounded, server-rendered Q&A "key questions" blocks added to
// company and filing pages (with FAQPage structured data for AI/search extraction).

test.describe('Company page — grounded Q&A block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/company/AAPL');
    await page.waitForLoadState('networkidle');
  });

  test('renders a "key questions" Q&A section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /key questions/i }).first()).toBeVisible();
  });

  test('emits FAQPage structured data with question entries', async ({ page }) => {
    const html = await page.content();
    expect(html).toContain('FAQPage');
    expect(html).toContain('"@type":"Question"');
  });

  test('answers reference the company and carry a not-advice note', async ({ page }) => {
    const body = ((await page.textContent('body')) || '');
    expect(body).toContain('AAPL');
    expect(body.toLowerCase()).toMatch(/not investment advice|research/);
  });
});

test.describe('Filing page — grounded Q&A block', () => {
  // A currently-analyzed filing (has aiSummary + analysisData), so the Q&A block renders.
  const accession = '0000012659-26-000026';

  test.beforeEach(async ({ page }) => {
    await page.goto(`/filing/${accession}`);
    await page.waitForLoadState('networkidle');
  });

  test('renders a "key questions" Q&A section for an analyzed filing', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /key questions/i }).first()).toBeVisible();
  });

  test('emits FAQPage structured data', async ({ page }) => {
    const html = await page.content();
    expect(html).toContain('FAQPage');
    expect(html).toContain('"@type":"Question"');
  });
});
