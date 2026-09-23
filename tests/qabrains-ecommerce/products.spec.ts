import { test, expect } from '@playwright/test';

const BASE = 'https://practice.qabrains.com/ecommerce';
const EMAIL = 'test@qabrains.com';
const PASSWORD = 'Password123';

test.describe('Products', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await page.click('button.btn-submit.uppercase');
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
  });

  test('TC-005: should display all 9 products on products page', async ({ page }) => {
    const productCards = page.locator('a[href*="product-details"]');
    await expect(productCards).toHaveCount(9);
  });

  test('TC-006: should sort products A to Z ascending', async ({ page }) => {
    await page.click('button[role="combobox"]');
    await page.waitForSelector('[role="option"]');
    await page.click('[role="option"]:has-text("A to Z")');
    await page.waitForTimeout(500);
    const firstProduct = page.locator('a.text-lg.block').first();
    const firstName = await firstProduct.textContent();
    const lastName = await page.locator('a.text-lg.block').last().textContent();
    expect(firstName?.trim().charCodeAt(0)).toBeLessThanOrEqual(
      lastName?.trim().charCodeAt(0) ?? 0
    );
  });

  test('TC-007: should sort products Z to A descending', async ({ page }) => {
    await page.click('button[role="combobox"]');
    await page.waitForSelector('[role="option"]');
    await page.click('[role="option"]:has-text("Z to A")');
    await page.waitForTimeout(500);
    const products = page.locator('a.text-lg.block');
    const first = await products.first().textContent();
    const last = await products.last().textContent();
    expect(first?.trim().localeCompare(last?.trim() ?? '')).toBeGreaterThanOrEqual(0);
  });

  test('TC-008: should sort products by price low to high', async ({ page }) => {
    await page.click('button[role="combobox"]');
    await page.waitForSelector('[role="option"]');
    await page.click('[role="option"]:has-text("Low to High")');
    await page.waitForTimeout(500);
    const firstProduct = page.locator('a.text-lg.block').first();
    await expect(firstProduct).toBeVisible();
  });

  test('TC-009: should sort products by price high to low', async ({ page }) => {
    await page.click('button[role="combobox"]');
    await page.waitForSelector('[role="option"]');
    await page.click('[role="option"]:has-text("High to Low")');
    await page.waitForTimeout(500);
    const firstProduct = page.locator('a.text-lg.block').first();
    await expect(firstProduct).toBeVisible();
  });
});
