import { test, expect } from '@playwright/test';

test('Login with valid credentials lands on inventory page', async ({ page }) => {
  await page.goto('https://www.saucedemo.com');
  await page.locator('#user-name').fill('standard_user');
  await page.locator('#password').fill('secret_sauce');
  await page.locator('#login-button').click();
  await expect(page).toHaveURL(/inventory\.html/);
  await expect(page).toHaveTitle('Swag Labs');
});

test('Login with invalid username shows error', async ({ page }) => {
  await page.goto('https://www.saucedemo.com');
  await page.locator('#user-name').fill('wrong_user');
  await page.locator('#password').fill('secret_sauce');
  await page.locator('#login-button').click();
  await expect(page.locator('[data-test="error"]')).toContainText('Epic sadface');
});

test('Login with invalid password shows error', async ({ page }) => {
  await page.goto('https://www.saucedemo.com');
  await page.locator('#user-name').fill('standard_user');
  await page.locator('#password').fill('wrong_pass');
  await page.locator('#login-button').click();
  await expect(page.locator('[data-test="error"]')).toContainText('Epic sadface');
});

test('Login with empty fields shows error', async ({ page }) => {
  await page.goto('https://www.saucedemo.com');
  await page.locator('#login-button').click();
  await expect(page.locator('[data-test="error"]')).toContainText('Username is required');
});
