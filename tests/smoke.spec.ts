import { test, expect } from "@playwright/test";

// Baseline smoke test: proves `test_run` (empty scope) always has something
// runnable and guards the shared Chromium launch path.
test("smoke: example.com loads with the expected title", async ({ page }) => {
  await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Example Domain/);
  await expect(page.getByRole("heading", { name: "Example Domain" })).toBeVisible();
});
