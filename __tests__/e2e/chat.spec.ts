import { test, expect } from '@playwright/test';

test.describe('Chat page — AI chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText("Analyze a Company's Filings & Fundamentals");
  });

  test('ticker input field is present', async ({ page }) => {
    const tickerInput = page.locator('input[placeholder*="Enter ticker"]');
    await expect(tickerInput).toBeVisible({ timeout: 10000 });
  });

  test('label for company selection is visible', async ({ page }) => {
    await expect(page.locator('text=Select a company to analyze:')).toBeVisible({ timeout: 10000 });
  });

  test('message input and send button are present', async ({ page }) => {
    const messageInput = page.locator('input[placeholder*="Ask about a company"]');
    await expect(messageInput).toBeVisible({ timeout: 10000 });

    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).toBeVisible();
  });

  test('question categories are visible', async ({ page }) => {
    await expect(page.locator('text=Question Categories')).toBeVisible({ timeout: 10000 });
    // Categories have emoji prefixes — match the exact category headings
    await expect(page.getByRole('heading', { name: '📈 Stock Performance' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '💰 Financial Analysis' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '🤖 ML Model Performance' })).toBeVisible();
  });

  test('available data section is displayed', async ({ page }) => {
    await expect(page.locator('text=Available Data')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Financial Metrics')).toBeVisible();
    await expect(page.locator('text=Risk Analysis')).toBeVisible();
  });

  test('clicking an example question populates the input', async ({ page }) => {
    // Click one of the example question buttons
    const exampleButton = page.locator('text=/biggest stock price jump/').first();
    await exampleButton.click();

    const messageInput = page.locator('input[placeholder*="Ask about a company"]');
    const inputValue = await messageInput.inputValue();
    expect(inputValue.length).toBeGreaterThan(0);
  });

  test('ticker auto-fills from URL parameter', async ({ page }) => {
    await page.goto('/chat?ticker=AAPL');
    await page.waitForLoadState('networkidle');

    const tickerInput = page.locator('input[placeholder*="Enter ticker"]');
    await expect(tickerInput).toHaveValue('AAPL', { timeout: 5000 });
  });

  test('sector dropdown is visible with options', async ({ page }) => {
    const sectorSelect = page.locator('select');
    await expect(sectorSelect).toBeVisible({ timeout: 10000 });

    // Check that known sectors are available as options
    await expect(sectorSelect.locator('option[value="Technology"]')).toBeAttached();
    await expect(sectorSelect.locator('option[value="Healthcare"]')).toBeAttached();
    await expect(sectorSelect.locator('option[value="Energy"]')).toBeAttached();
  });

  test('selecting a sector clears ticker input', async ({ page }) => {
    const tickerInput = page.locator('input[placeholder*="Enter ticker"]');
    await tickerInput.fill('AAPL');
    await expect(tickerInput).toHaveValue('AAPL');

    const sectorSelect = page.locator('select');
    await sectorSelect.selectOption('Technology');

    await expect(tickerInput).toHaveValue('', { timeout: 3000 });
  });

  test('entering a ticker clears sector dropdown', async ({ page }) => {
    const sectorSelect = page.locator('select');
    await sectorSelect.selectOption('Healthcare');
    await expect(sectorSelect).toHaveValue('Healthcare');

    const tickerInput = page.locator('input[placeholder*="Enter ticker"]');
    await tickerInput.fill('MSFT');

    await expect(sectorSelect).toHaveValue('', { timeout: 3000 });
  });

  test('sending a message shows it in the chat or shows auth error', async ({ page }) => {
    const messageInput = page.locator('input[placeholder*="Ask about a company"]');
    await messageInput.fill('What are the latest filings?');

    const sendButton = page.getByRole('button', { name: 'Send' });
    await sendButton.click();

    // Should either show the user message in chat, show loading, or show auth error
    const hasUserMessage = await page.locator('text=What are the latest filings?').isVisible({ timeout: 5000 }).catch(() => false);
    const hasThinking = await page.locator('text=Thinking...').isVisible({ timeout: 3000 }).catch(() => false);
    const hasAuthError = await page.locator('text=/sign.?up|authentication|log.?in/i').first().isVisible({ timeout: 10000 }).catch(() => false);

    expect(hasUserMessage || hasThinking || hasAuthError).toBe(true);
  });
});
