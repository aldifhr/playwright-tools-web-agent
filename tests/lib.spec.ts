import { test, expect } from "@playwright/test";
import { sanitizeFile, casesFile } from "../src/lib/specs";
import { saveFact } from "../src/lib/memory";

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
