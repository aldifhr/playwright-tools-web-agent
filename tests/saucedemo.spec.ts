import { test, expect } from '@playwright/test';

const BASE = 'https://www.saucedemo.com';

test.describe('SauceDemo — Login', () => {
  test('Login successful with valid credentials', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await expect(page).toHaveURL(/inventory/);
    await expect(page.locator('.inventory_list')).toBeVisible();
  });

  test('Login fails with invalid password', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('wrong_password');
    await page.locator('#login-button').click();
    await expect(page.locator('[data-test="error"]')).toContainText('Username and password do not match');
  });

  test('Login fails with locked out user', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#user-name').fill('locked_out_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await expect(page.locator('[data-test="error"]')).toContainText('locked out');
  });

  test('Login fails with empty fields', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#login-button').click();
    await expect(page.locator('[data-test="error"]')).toContainText('Username is required');
  });

  test('Login fails with empty password', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#login-button').click();
    await expect(page.locator('[data-test="error"]')).toContainText('Password is required');
  });
});

test.describe('SauceDemo — Inventory', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await expect(page).toHaveURL(/inventory/);
  });

  test('All 6 products displayed on inventory page', async ({ page }) => {
    const items = page.locator('.inventory_item');
    await expect(items).toHaveCount(6);
  });

  test('Sort products by name A to Z', async ({ page }) => {
    await page.locator('.product_sort_container').selectOption('az');
    const firstTitle = page.locator('.inventory_item').first().locator('.inventory_item_name');
    await expect(firstTitle).toHaveText('Sauce Labs Backpack');
  });

  test('Sort products by price low to high', async ({ page }) => {
    await page.locator('.product_sort_container').selectOption('lohi');
    const prices = page.locator('.inventory_item_price');
    const firstPrice = await prices.first().textContent();
    expect(Number(firstPrice?.replace('$', ''))).toBeLessThanOrEqual(15);
  });

  test('Footer contains social media links', async ({ page }) => {
    const footer = page.locator('.footer');
    await expect(footer.locator('a[href*="twitter"], a[href*="x.com"]')).toBeVisible();
    await expect(footer.locator('a[href*="facebook"]')).toBeVisible();
    await expect(footer.locator('a[href*="linkedin"]')).toBeVisible();
  });
});

test.describe('SauceDemo — Product Detail', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
  });

  test('View product detail page', async ({ page }) => {
    await page.locator('#item_4_img_link').click();
    await expect(page).toHaveURL(/inventory-item/);
    await expect(page.locator('.inventory_details_name')).toBeVisible();
    await expect(page.locator('.inventory_details_price')).toBeVisible();
    await expect(page.locator('#back-to-products')).toBeVisible();
  });

  test('Add product from detail page', async ({ page }) => {
    await page.locator('#item_4_img_link').click();
    await page.locator('#add-to-cart').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
  });

  test('Back to products from detail page', async ({ page }) => {
    await page.locator('#item_4_img_link').click();
    await page.locator('#back-to-products').click();
    await expect(page).toHaveURL(/inventory\.html/);
  });
});

test.describe('SauceDemo — Add to Cart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
  });

  test('Add single product to cart', async ({ page }) => {
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
    await page.locator('.shopping_cart_link').click();
    await expect(page.locator('.cart_item')).toHaveCount(1);
    await expect(page.locator('.inventory_item_name')).toContainText('Backpack');
  });

  test('Add multiple products to cart', async ({ page }) => {
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('#add-to-cart-sauce-labs-bike-light').click();
    await page.locator('#add-to-cart-sauce-labs-bolt-t-shirt').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveText('3');
    await page.locator('.shopping_cart_link').click();
    await expect(page.locator('.cart_item')).toHaveCount(3);
  });

  test('Remove product from cart page', async ({ page }) => {
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('.shopping_cart_link').click();
    await page.locator('#remove-sauce-labs-backpack').click();
    await expect(page.locator('.cart_item')).toHaveCount(0);
  });

  test('Remove product from inventory page via Remove button', async ({ page }) => {
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await expect(page.locator('#remove-sauce-labs-backpack')).toBeVisible();
    await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
    await page.locator('#remove-sauce-labs-backpack').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveCount(0);
    await expect(page.locator('#add-to-cart-sauce-labs-backpack')).toBeVisible();
  });
});

test.describe('SauceDemo — Checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
  });

  test('Complete checkout with one item', async ({ page }) => {
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('.shopping_cart_link').click();
    await page.locator('#checkout').click();
    await page.locator('[data-test="firstName"]').fill('John');
    await page.locator('[data-test="lastName"]').fill('Doe');
    await page.locator('[data-test="postalCode"]').fill('12345');
    await page.locator('[data-test="continue"]').click();
    await expect(page).toHaveURL(/checkout-step-two/);
    await page.locator('[data-test="finish"]').click();
    await expect(page).toHaveURL(/checkout-complete/);
    await expect(page.locator('.complete-header')).toContainText('Thank you for your order');
  });

  test('Checkout step 1 fails with empty fields', async ({ page }) => {
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('.shopping_cart_link').click();
    await page.locator('#checkout').click();
    await page.locator('[data-test="continue"]').click();
    await expect(page.locator('[data-test="error"]')).toContainText('First Name is required');
  });

  test('Checkout step 2 shows correct items and prices', async ({ page }) => {
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('.shopping_cart_link').click();
    await page.locator('#checkout').click();
    await page.locator('[data-test="firstName"]').fill('John');
    await page.locator('[data-test="lastName"]').fill('Doe');
    await page.locator('[data-test="postalCode"]').fill('12345');
    await page.locator('[data-test="continue"]').click();
    await expect(page.locator('.inventory_item_name')).toContainText('Backpack');
    await expect(page.locator('.summary_subtotal_label')).toBeVisible();
    await expect(page.locator('.summary_tax_label')).toBeVisible();
    await expect(page.locator('.summary_total_label')).toBeVisible();
  });

  test('Cancel checkout returns to cart', async ({ page }) => {
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('.shopping_cart_link').click();
    await page.locator('#checkout').click();
    await page.locator('[data-test="cancel"]').click();
    await expect(page).toHaveURL(/cart\.html/);
  });

  test('Back home after checkout', async ({ page }) => {
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('.shopping_cart_link').click();
    await page.locator('#checkout').click();
    await page.locator('[data-test="firstName"]').fill('John');
    await page.locator('[data-test="lastName"]').fill('Doe');
    await page.locator('[data-test="postalCode"]').fill('12345');
    await page.locator('[data-test="continue"]').click();
    await page.locator('[data-test="finish"]').click();
    await page.locator('#back-to-products').click();
    await expect(page).toHaveURL(/inventory\.html/);
  });
});

test.describe('SauceDemo — Sidebar Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
  });

  test('Sidebar menu opens and shows links', async ({ page }) => {
    await page.locator('#react-burger-menu-btn').click();
    await expect(page.locator('#inventory_sidebar_link')).toBeVisible();
    await expect(page.locator('#about_sidebar_link')).toBeVisible();
    await expect(page.locator('#logout_sidebar_link')).toBeVisible();
    await expect(page.locator('#reset_sidebar_link')).toBeVisible();
  });

  test('Logout returns to login page', async ({ page }) => {
    await page.locator('#react-burger-menu-btn').click();
    await page.locator('#logout_sidebar_link').click();
    await expect(page).toHaveURL(BASE + '/');
    await expect(page.locator('#login-button')).toBeVisible();
  });

  test('Reset App State clears cart', async ({ page }) => {
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
    await page.locator('#react-burger-menu-btn').click();
    await page.locator('#reset_sidebar_link').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveCount(0);
  });
});
