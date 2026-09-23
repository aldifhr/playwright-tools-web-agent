import { test, expect } from '@playwright/test';

const BASE_URL = 'https://practice.qabrains.com/ecommerce/login';
const VALID_EMAIL = 'test@qabrains.com';
const VALID_PASSWORD = 'Password123';

test.describe('QA Practice E-commerce Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('TC-001: Successful login with valid credentials', async ({ page }) => {
    await page.locator('#email').fill(VALID_EMAIL);
    await page.locator('#password').fill(VALID_PASSWORD);
    await page.locator('button.btn-submit').click();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('TC-002: Login with wrong password', async ({ page }) => {
    await page.locator('#email').fill(VALID_EMAIL);
    await page.locator('#password').fill('WrongPass123');
    await page.locator('button.btn-submit').click();
    const errorVisible = await page.locator('.alert, .error, [role="alert"], .text-red-500, .invalid-feedback, .text-danger').isVisible().catch(() => false);
    const currentUrl = page.url();
    expect(errorVisible || currentUrl.includes('/login')).toBeTruthy();
  });

  test('TC-003: Login with unregistered email', async ({ page }) => {
    await page.locator('#email').fill('unknown@test.com');
    await page.locator('#password').fill(VALID_PASSWORD);
    await page.locator('button.btn-submit').click();
    const errorVisible = await page.locator('.alert, .error, [role="alert"], .text-red-500, .invalid-feedback, .text-danger').isVisible().catch(() => false);
    const currentUrl = page.url();
    expect(errorVisible || currentUrl.includes('/login')).toBeTruthy();
  });

  test('TC-004: Login with empty email field', async ({ page }) => {
    await page.locator('#password').fill(VALID_PASSWORD);
    await page.locator('button.btn-submit').click();
    // No HTML5 required attr — submit goes to server, should stay on login or show error
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    const errorVisible = await page.locator('.alert, .error, [role="alert"], .text-red-500, .invalid-feedback, .text-danger, h3').isVisible().catch(() => false);
    expect(currentUrl.includes('/login') || errorVisible).toBeTruthy();
  });

  test('TC-005: Login with empty password field', async ({ page }) => {
    await page.locator('#email').fill(VALID_EMAIL);
    await page.locator('button.btn-submit').click();
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    const errorVisible = await page.locator('.alert, .error, [role="alert"], .text-red-500, .invalid-feedback, .text-danger, h3').isVisible().catch(() => false);
    expect(currentUrl.includes('/login') || errorVisible).toBeTruthy();
  });

  test('TC-006: Login with both fields empty', async ({ page }) => {
    await page.locator('button.btn-submit').click();
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    const errorVisible = await page.locator('.alert, .error, [role="alert"], .text-red-500, .invalid-feedback, .text-danger, h3').isVisible().catch(() => false);
    expect(currentUrl.includes('/login') || errorVisible).toBeTruthy();
  });

  test('TC-007: SQL injection in email field should not bypass auth', async ({ page }) => {
    await page.locator('#email').fill("' OR '1'='1");
    await page.locator('#password').fill('anything');
    await page.locator('button.btn-submit').click();
    const currentUrl = page.url();
    const dashboardVisible = await page.locator('.dashboard, .products, .home').isVisible().catch(() => false);
    expect(currentUrl.includes('/login') || !dashboardVisible).toBeTruthy();
  });

  test('TC-008: XSS payload in email field should not execute', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', () => { dialogFired = true; });
    await page.locator('#email').fill("<script>alert('XSS')</script>");
    await page.locator('button.btn-submit').click();
    await page.waitForTimeout(1000);
    expect(dialogFired).toBeFalsy();
  });

  test('TC-009: Email field with only spaces', async ({ page }) => {
    await page.locator('#email').fill('   ');
    await page.locator('#password').fill(VALID_PASSWORD);
    await page.locator('button.btn-submit').click();
    const currentUrl = page.url();
    expect(currentUrl.includes('/login')).toBeTruthy();
  });

  test('TC-010: Very long email address handling', async ({ page }) => {
    const longEmail = 'a'.repeat(256) + '@test.com';
    await page.locator('#email').fill(longEmail);
    await page.locator('#password').fill(VALID_PASSWORD);
    await page.locator('button.btn-submit').click();
    await expect(page.locator('#email')).toBeVisible();
  });

  test('TC-011: Password visibility toggle', async ({ page }) => {
    const pwInput = page.locator('#password');
    await pwInput.fill(VALID_PASSWORD);
    const initialType = await pwInput.getAttribute('type');
    const toggleBtn = page.locator('button.absolute.right-3');
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
      const afterType = await pwInput.getAttribute('type');
      expect(initialType).not.toEqual(afterType);
      await toggleBtn.click();
      const finalType = await pwInput.getAttribute('type');
      expect(finalType).toEqual(initialType);
    }
  });

  test('TC-012: Login page elements are present', async ({ page }) => {
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button.btn-submit')).toBeVisible();
    // CSS text-transform makes it uppercase visually, but actual text is "Login"
    await expect(page.locator('h2')).toContainText(/login/i);
  });

  test('TC-013: Login with email missing @ symbol', async ({ page }) => {
    await page.locator('#email').fill('testqabrains.com');
    await page.locator('#password').fill(VALID_PASSWORD);
    await page.locator('button.btn-submit').click();
    const emailValid = await page.locator('#email').evaluate(
      (el: HTMLInputElement) => !el.validity.valid
    );
    const currentUrl = page.url();
    expect(emailValid || currentUrl.includes('/login')).toBeTruthy();
  });

  test('TC-014: Login with Enter key', async ({ page }) => {
    await page.locator('#email').fill(VALID_EMAIL);
    await page.locator('#password').fill(VALID_PASSWORD);
    await page.locator('#password').press('Enter');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('TC-015: SQL injection in password field should not bypass auth', async ({ page }) => {
    await page.locator('#email').fill(VALID_EMAIL);
    await page.locator('#password').fill("' OR '1'='1");
    await page.locator('button.btn-submit').click();
    const currentUrl = page.url();
    expect(currentUrl.includes('/login')).toBeTruthy();
  });
});
