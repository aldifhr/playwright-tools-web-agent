import { test, expect } from "@playwright/test";
import { sanitizeFile, casesFile, saveCases, saveCaseResults, readCasesWithResults, deleteSpec } from "../src/lib/specs";
import { saveFact } from "../src/lib/memory";
import { assertPublicTarget } from "../src/lib/ssrf";
import { isReadOnlyCommand } from "../src/lib/browser";
import { getBrowserTools } from "../src/lib/agent";
import { rateLimit, tryEnter, leave } from "../src/lib/rate-limit";
import { requireAuth } from "../src/lib/auth";

// Pure unit tests for agent lib helpers (no browser, no file writes:
// every assertion below either validates input or expects a throw
// before any disk mutation happens).

test("sanitizeFile accepts plain names and appends the suffix", () => {
  expect(sanitizeFile("login-saucedemo")).toBe("login-saucedemo.spec.ts");
  expect(sanitizeFile("login-saucedemo.spec.ts")).toBe("login-saucedemo.spec.ts");
});

test("sanitizeFile neutralizes traversal via basename, rejects bad extensions", () => {
  // basename() strips directories, so traversal attempts collapse to a safe name
  expect(sanitizeFile("../evil")).toBe("evil.spec.ts");
  expect(sanitizeFile("a/b.spec.ts")).toBe("b.spec.ts");
  expect(() => sanitizeFile("spec.js")).toThrow();
  expect(() => sanitizeFile("")).toThrow();
});

test("casesFile maps a spec name to its .cases.json artifact", () => {
  expect(casesFile("login-saucedemo.spec.ts")).toBe("login-saucedemo.cases.json");
  expect(casesFile("login-saucedemo")).toBe("login-saucedemo.cases.json");
});

test("saveFact rejects secrets before touching disk", () => {
  expect(() => saveFact("api-key: sk-abcdefgh12345678")).toThrow();
  expect(() => saveFact("db password: supersecretvalue123")).toThrow();
});

test("ssrf guard blocks loopback, private, and metadata targets", async () => {
  await expect(assertPublicTarget("http://localhost:3000")).rejects.toThrow(/loopback/i);
  await expect(assertPublicTarget("http://127.0.0.1/")).rejects.toThrow(/loopback|private/i);
  await expect(assertPublicTarget("http://169.254.169.254/")).rejects.toThrow(/metadata|private/i);
  await expect(assertPublicTarget("http://[::1]/")).rejects.toThrow(/loopback|private/i);
});

test("ssrf guard allows loopback only with explicit opt-in", async () => {
  const url = await assertPublicTarget("http://localhost:11434", { allowLocal: true });
  expect(url.hostname).toBe("localhost");
  // metadata stays blocked even with opt-in
  await expect(assertPublicTarget("http://169.254.169.254/", { allowLocal: true })).rejects.toThrow();
});

test("isReadOnlyCommand separates readers from executors", () => {
  expect(isReadOnlyCommand("ls tests")).toBe(true);
  expect(isReadOnlyCommand("cat package.json")).toBe(true);
  expect(isReadOnlyCommand("grep -r foo src")).toBe(true);
  expect(isReadOnlyCommand("node script.js")).toBe(false);
  expect(isReadOnlyCommand("npm test")).toBe(false);
  expect(isReadOnlyCommand("npx playwright test")).toBe(false);
  expect(isReadOnlyCommand("ls; rm -rf /")).toBe(false);
  expect(isReadOnlyCommand("")).toBe(false);
});

test("bash without approval channel denies executors, allows readers", async () => {
  const tools = getBrowserTools();
  const bash = tools.browser_bash as unknown as { execute: (input: unknown) => Promise<unknown> };
  await expect(bash.execute({ command: "npx something-evil" })).rejects.toThrow(/denied/i);
  const out = (await bash.execute({ command: "echo hi" })) as { stdout: string };
  expect(out.stdout.trim()).toBe("hi");
});

test("rate limiter allows then rejects over the limit", () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  expect(rateLimit(key, 2, 60_000)).toBeNull();
  expect(rateLimit(key, 2, 60_000)).toBeNull();
  const rejected = rateLimit(key, 2, 60_000);
  expect(rejected).not.toBeNull();
  expect(rejected?.status).toBe(429);
});

test("concurrent slots guard expensive endpoints", () => {
  const slot = `test-slot-${Date.now()}`;
  expect(tryEnter(slot, 1)).toBe(true);
  expect(tryEnter(slot, 1)).toBe(false);
  leave(slot);
  expect(tryEnter(slot, 1)).toBe(true);
  leave(slot);
});

test("manual results round-trip with validation", async () => {  const file = "tmp-manual.spec.ts";
  await saveCases(file, [
    { id: "TC-001", area: "Login", type: "Positive", title: "valid login", preconditions: "", testData: "", steps: ["open page"], expected: "dashboard", priority: "High", severity: "High" },
  ]);
  try {
    await expect(saveCaseResults(file, [{ id: "TC-999", status: "PASS" }])).rejects.toThrow(/unknown case id/i);
    await expect(saveCaseResults(file, [{ id: "TC-001", status: "MAYBE" }])).rejects.toThrow(/invalid status/i);
    const saved = await saveCaseResults(file, [{ id: "TC-001", status: "pass", actual: "dashboard shown" }]);
    expect(saved.summary.PASS).toBe(1);
    const merged = await readCasesWithResults(file);
    expect(merged[0].result.status).toBe("PASS");
    expect(merged[0].result.actual).toBe("dashboard shown");
  } finally {
    await deleteSpec(file).catch(() => null);
    const { deleteCases } = await import("../src/lib/specs");
    await deleteCases(file);
  }
});

test("auth is open without token, enforced with token", () => {
  expect(requireAuth(new Request("http://x/"))).toBeNull();
  process.env.APP_TOKEN = "secret-token";
  try {
    expect(requireAuth(new Request("http://x/"))?.status).toBe(401);
    expect(
      requireAuth(new Request("http://x/", { headers: { Authorization: "Bearer secret-token" } }))
    ).toBeNull();
    expect(
      requireAuth(new Request("http://x/", { headers: { Authorization: "Bearer wrong" } }))?.status
    ).toBe(401);
  } finally {
    delete process.env.APP_TOKEN;
  }
});

test("rowsToCases maps headers, splits steps, dedupes ids", async () => {
  const { rowsToCases, suggestFileName } = await import("../src/lib/case-import");
  const headers = ["ID", "Area", "Type", "Title", "Test Data", "Test Step", "Expected Result", "Priority"];
  const out = rowsToCases(headers, [
    ["LGN001", "Login", "Positive", "valid login", "standard_user", "1. Input user 2. Input pass 3. Click login", "dashboard", "High"],
    ["LGN001", "Login", "Negative", "dup id", "", "1. Do x", "error", ""],
    ["", "", "", "", "", "", "", ""],
  ]);
  expect(out).toHaveLength(2);
  expect(out[0].steps).toEqual(["Input user", "Input pass", "Click login"]);
  expect(out[0].priority).toBe("High");
  expect(out[1].id).not.toBe("LGN001");
  expect(out[1].priority).toBe("Medium");
  const fb = rowsToCases(["Title", "Expected Result"], [["t", "e"]], { areaFallback: "Cart", idPrefix: "CART" });
  expect(fb[0].id).toBe("CART-001");
  expect(fb[0].area).toBe("Cart");
  expect(suggestFileName("TestCase_SauceDemo.xlsx")).toBe("TestCase_SauceDemo.spec.ts");
  await expect(async () => rowsToCases(["Foo", "Bar"], [["a", "b"]])).rejects.toThrow();
});
