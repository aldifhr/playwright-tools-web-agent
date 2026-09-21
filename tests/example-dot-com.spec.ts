import { test, expect } from '@playwright/test';

test('Page title is Example Domain', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle('Example Domain');
});

test('Non-existent element is not visible', async ({ page }) => {
  await page.goto('https://example.com');
  const button = page.locator('button:has-text("Submit")');
  await expect(button).toHaveCount(0);
});
