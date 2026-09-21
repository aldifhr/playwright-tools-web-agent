import { test, expect } from '@playwright/test';

test.describe('SauceDemo Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com');
  });

  test('Login with valid credentials', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await expect(page).toHaveURL(/inventory.html/);
  });

  test('Login with invalid password', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('wrong_password');
    await page.locator('#login-button').click();
    await expect(page.locator('.error-message-container')).toBeVisible();
  });

  test('Login with empty credentials', async ({ page }) => {
    await page.locator('#login-button').click();
    await expect(page.locator('.error-message-container')).toBeVisible();
  });

  test('Add single item to cart', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
  });

  test('Add multiple items to cart', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('#add-to-cart-sauce-labs-bike-light').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveText('2');
  });

  test('Remove item from cart', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('#remove-sauce-labs-backpack').click();
    await expect(page.locator('.shopping_cart_badge')).toBeHidden();
  });

  test('Sort products by name A-Z', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await page.locator('.product_sort_container').selectOption('az');
    const firstItem = await page.locator('.inventory_item_name').first().textContent();
    expect(firstItem).toBe('Sauce Labs Backpack');
  });

  test('Sort products by price low-high', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await page.locator('.product_sort_container').selectOption('lohi');
    const firstPrice = await page.locator('.inventory_item_price').first().textContent();
    expect(firstPrice).toBe('$7.99');
  });

  test('View cart with items', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('.shopping_cart_link').click();
    await expect(page.locator('.cart_item')).toHaveCount(1);
  });

  test('Remove item from cart page', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('.shopping_cart_link').click();
    await page.locator('#remove-sauce-labs-backpack').click();
    await expect(page.locator('.cart_item')).toHaveCount(0);
  });

  test('Checkout with valid information', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('.shopping_cart_link').click();
    await page.locator('#checkout').click();
    await page.locator('#first-name').fill('John');
    await page.locator('#last-name').fill('Doe');
    await page.locator('#postal-code').fill('12345');
    await page.locator('#continue').click();
    await page.locator('#finish').click();
    await expect(page.locator('.complete-header')).toHaveText('Thank you for your order!');
  });

  test('Checkout with missing required field', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('.shopping_cart_link').click();
    await page.locator('#checkout').click();
    await page.locator('#last-name').fill('Doe');
    await page.locator('#postal-code').fill('12345');
    await page.locator('#continue').click();
    await expect(page.locator('.error-message-container')).toBeVisible();
  });
});
