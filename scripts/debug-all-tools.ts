// Harness: exercises every agent tool at the library level against
// https://www.saucedemo.com and records PASS / EXPECTED-ERROR / FAIL.
// Usage: bun scripts/debug-all-tools.ts   (or: node --experimental-strip-types ...)
import { mkdir, writeFile } from "node:fs/promises";
import * as browser from "../src/lib/browser";
import {
  deleteCases,
  deleteSpec,
  listSpecs,
  loadLastRun,
  mergeCases,
  recordRun,
  runSpec,
  saveCaseResults,
  savePlanDocument,
  saveSpec,
} from "../src/lib/specs";
import { forgetFact, listFacts, saveFact } from "../src/lib/memory";

type Status = "PASS" | "EXPECTED-ERROR" | "FAIL" | "SKIP";
type Row = { tool: string; case: string; status: Status; detail: string; ms: number };

const rows: Row[] = [];
async function check(tool: string, label: string, fn: () => unknown, verify?: (out: unknown) => string | null, expectError?: RegExp) {
  const t = Date.now();
  try {
    const out = await fn();
    if (expectError) {
      rows.push({ tool, case: label, status: "FAIL", detail: `expected error ${expectError} but succeeded`, ms: Date.now() - t });
      return;
    }
    const problem = verify ? verify(out) : null;
    rows.push({ tool, case: label, status: problem ? "FAIL" : "PASS", detail: problem ?? summarize(out), ms: Date.now() - t });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (expectError && expectError.test(msg)) {
      rows.push({ tool, case: label, status: "EXPECTED-ERROR", detail: msg.slice(0, 160), ms: Date.now() - t });
    } else {
      rows.push({ tool, case: label, status: "FAIL", detail: msg.slice(0, 300), ms: Date.now() - t });
    }
  }
}

function summarize(out: unknown): string {
  const s = JSON.stringify(out) ?? "";
  return s.length > 220 ? `${s.slice(0, 220)}…` : s;
}

const ok = (cond: boolean, msg: string) => (cond ? null : msg);

// ---- browser flow: login ----
await check("browser_navigate", "open saucedemo", () => browser.navigate("https://www.saucedemo.com"),
  (o) => ok((o as { url: string }).url.includes("saucedemo"), "wrong url"));
await check("browser_snapshot", "login page", () => browser.snapshot(),
  (o) => ok((o as { elements: string }).elements.includes("#user-name"), "no #user-name in snapshot"));
await check("browser_get_text", "login text", () => browser.getText(),
  (o) => ok((o as { text: string }).text.includes("Swag Labs"), "no Swag Labs text"));
await check("browser_screenshot", "capture", () => browser.screenshot(false),
  (o) => ok((o as { image: string }).image.startsWith("data:image/png;base64,"), "bad image"));
await check("browser_type", "username", () => browser.typeText("#user-name", "standard_user"),
  (o) => ok((o as { filled: boolean }).filled === true, "not filled"));
await check("browser_type", "password", () => browser.typeText("#password", "secret_sauce"));
await check("browser_click", "login", () => browser.click("#login-button"),
  (o) => ok((o as { url: string }).url.includes("inventory"), "not on inventory"));
await check("browser_snapshot", "inventory", () => browser.snapshot(),
  (o) => ok((o as { elements: string }).elements.includes("inventory_item"), "no items"));

// ---- assertions: all 4 kinds + 1 negative ----
await check("test_assert", "text_contains pass", () => browser.assertPage({ kind: "text_contains", text: "Products" }),
  (o) => ok((o as { pass: boolean }).pass === true, "should pass"));
await check("test_assert", "visible pass", () => browser.assertPage({ kind: "visible", selector: "#add-to-cart-sauce-labs-backpack" }),
  (o) => ok((o as { pass: boolean }).pass === true, "should pass"));
await check("test_assert", "element_text pass", () => browser.assertPage({ kind: "element_text", selector: ".inventory_item_name", text: "Sauce Labs" }),
  (o) => ok((o as { pass: boolean }).pass === true, "should pass"));
await check("test_assert", "count pass", () => browser.assertPage({ kind: "count", selector: ".inventory_item", expected: 6 }),
  (o) => ok((o as { pass: boolean }).pass === true, "should pass"));
await check("test_assert", "visible negative → pass:false, no throw", () => browser.assertPage({ kind: "visible", selector: "#nope-missing" }),
  (o) => ok((o as { pass: boolean }).pass === false, "should be pass:false"));

// ---- interaction / observation ----
await check("browser_hover", "cart link", () => browser.hover("a.shopping_cart_link"),
  (o) => ok((o as { hovered: string }).hovered === "a.shopping_cart_link", "bad echo"));
await check("browser_press", "Escape, no selector (arg-order regression)", () => browser.pressKey("", "Escape"),
  (o) => ok((o as { pressed: string }).pressed === "Escape", "bad echo"));
await check("browser_press", "Enter on item (tolerate if not focusable)", async () => {
  try {
    return await browser.pressKey(".inventory_item_name", "Enter");
  } catch (e) {
    return { tolerated: e instanceof Error ? e.message.slice(0, 80) : "err" };
  }
});
await check("browser_select", "sort dropdown", () => browser.selectOption(".product_sort_container", "Name (A to Z)"),
  (o) => ok(((o as { selected: string[] }).selected ?? []).length > 0, "nothing selected"));
await check("browser_wait", "selector visible", () => browser.waitFor({ selector: ".inventory_item", timeoutMs: 8000 }),
  (o) => ok(typeof (o as { waitedMs: number }).waitedMs === "number", "no waitedMs"));
await check("browser_scroll", "down", () => browser.scrollPage("down", 600),
  (o) => ok(typeof (o as { scrollY: number }).scrollY === "number", "no scrollY"));
await check("browser_tabs", "list", () => browser.listTabs());
await check("browser_network_log", "read", () => browser.networkLog());
await check("browser_console", "read", () => browser.consoleLog());
await check("browser_storage", "set+get", async () => {
  await browser.storage("set", "local", "debug_probe", "ok");
  return browser.storage("get", "local", "debug_probe");
}, (o) => ok(JSON.stringify(o).includes("ok"), "roundtrip failed"));
await check("browser_cookies", "list", () => browser.cookies("list"));
await check("browser_dialog", "empty, no throw", () => browser.readDialog(),
  (o) => ok(Array.isArray((o as { dialogs: unknown[] }).dialogs), "bad shape"));
await check("browser_downloads", "empty, no throw", () => browser.readDownloads(),
  (o) => ok(Array.isArray((o as { downloads: unknown[] }).downloads), "bad shape"));
await check("browser_go_back", "back", () => browser.goBack(),
  (o) => ok(typeof (o as { url: string }).url === "string", "no url"));
await check("browser_navigate", "reopen inventory (post-back state)", () => browser.navigate("https://www.saucedemo.com/inventory.html"));

// ---- expected failures: must reject gracefully, never crash ----
await check("browser_click", "missing selector", () => browser.click("#definitely-not-here-xyz"), undefined, /not found|waiting|timeout|strict|resolved/i);
await check("browser_upload", "no file input on page", () => browser.uploadFile("#nope", "n.txt", "x"), undefined, /./);
await check("browser_drag", "no drag source on page", () => browser.drag("#nope-a", "#nope-b"), undefined, /./);
await check("browser_bash", "disallowed command rejected", () => browser.bash("rm -rf /tmp/x"), undefined, /not allowed/i);
await check("browser_bash", "shell operators rejected", () => browser.bash("ls | grep x"), undefined, /not allowed/i);
await check("browser_bash", "allowed echo runs", () => browser.bash("echo probe-ok"),
  (o) => ok((o as { stdout: string }).stdout.includes("probe-ok"), "bad stdout"));
await check("browser_read_file", "allowed file", () => browser.readFile("SOUL.md", 200),
  (o) => ok((o as { content: string }).content.length > 0, "empty"));
await check("browser_read_file", "outside allowlist rejected", () => browser.readFile("../package.json"), undefined, /not allowed|not found/i);
await check("browser_read_file", "secrets rejected", () => browser.readFile(".env"), undefined, /not allowed|not found/i);

// ---- artifact tools ----
const CASES_FILE = "debug-tools/all-tools";
await check("test_plan", "merge 2 cases", () => mergeCases(CASES_FILE, [
  { id: "TC-001", area: "Login", type: "Positive", title: "probe login works", preconditions: "", testData: "", steps: ["open page"], expected: "logged in", priority: "High", severity: "High" },
  { id: "TC-002", area: "Login", type: "Negative", title: "probe login XFAIL path", preconditions: "", testData: "", steps: ["open page"], expected: "error shown", priority: "Medium", severity: "Medium" },
]), (o) => ok(((o as { totalCount: number }).totalCount ?? 0) >= 2, "cases missing"));
await check("test_record", "record PASS/FAIL", () => saveCaseResults(CASES_FILE, [
  { id: "TC-001", status: "PASS", actual: "ok" },
  { id: "TC-002", status: "FAIL", actual: "needs site" },
]), (o) => ok(((o as { recorded: number }).recorded ?? 0) === 2, "not recorded"));
await check("test_list", "lists specs", () => listSpecs(), (o) => ok(Array.isArray(o), "not array"));
const SPEC = "debug-tools/all-tools.spec.ts";
await check("test_save", "trivial passing spec", () => saveSpec(SPEC,
  `import { test, expect } from "@playwright/test";\ntest("probe arithmetic", async () => { expect(1 + 1).toBe(2); });\n`));
await check("test_save", "empty content rejected", () => saveSpec(SPEC, "   "), undefined, /empty/i);
await check("test_run", "run trivial spec", () => runSpec(SPEC),
  (o) => ok((o as { passed: number }).passed >= 1 && (o as { failed: number }).failed === 0, `bad summary ${JSON.stringify(o).slice(0, 120)}`));
await check("test_run", "record run in log", async () => {
  const s = await runSpec(SPEC);
  await recordRun(SPEC, s);
  const last = await loadLastRun();
  return last;
}, (o) => ok(!!(o as Record<string, unknown>)[SPEC], "run not logged"));
await check("test_plan_document", "10-section doc", () => savePlanDocument("debug-tools/all-tools-plan", {
  projectName: "Probe", testerName: "Harness", date: "2026-09-25", version: "0",
  objective: "probe", inScope: ["a"], outOfScope: ["b"], testStrategy: ["manual"],
  deliverables: ["report"], environment: [{ key: "browser", value: "chromium" }],
  roles: [{ role: "QA", name: "H", responsibility: "probe" }],
  schedule: [{ event: "t", startDate: "d1", endDate: "d2" }],
  risks: [{ risk: "r", mitigation: "m" }], approval: [{ name: "n", role: "r", signature: "s" }],
}), (o) => ok((o as { sections: number }).sections === 10, "not 10 sections"));

// ---- memory tools ----
await check("memory_save", "save temp fact", () => saveFact("debug probe fact — delete me"),
  (o) => ok((o as { total: number }).total > 0, "no total"));
await check("memory_save", "secret rejected", () => saveFact("my api key is sk-secret-123"), undefined, /secret|password|key/i);
await check("memory_forget", "remove temp fact", () => forgetFact("debug probe fact"),
  (o) => ok(!listFacts().some((f) => f.includes("debug probe fact")), "still present"));

// ---- agent guards (no LLM needed): delegate + approval ----
const { getBrowserTools } = await import("../src/lib/agent");
type Exec = (input: unknown) => Promise<unknown>;
const execOf = (t: { execute: unknown }) => t.execute as Exec;
const agentTools = getBrowserTools();
await check("browser_delegate", "unavailable without sub-agent", () => execOf(agentTools.browser_delegate)({ task: "x" }),
  undefined, /not available/i);
const noApprover = getBrowserTools(undefined, undefined, undefined, undefined, undefined);
await check("browser_bash/guard", "side-effect cmd denied w/o approver", () =>
  execOf(noApprover.browser_bash)({ command: "npm test" }),
  undefined, /denied/i);
await check("browser_bash/guard", "read-only ls allowed w/o approver", () =>
  execOf(noApprover.browser_bash)({ command: "ls tests" }));

// ---- agent wiring regression: browser_press order (was swapped) ----
await check("browser_press/wiring", "tool passes (selector, key) correctly", () =>
  execOf(agentTools.browser_press)({ key: "Escape", selector: "" }),
  (o) => ok((o as { pressed: string }).pressed === "Escape", `bad echo ${JSON.stringify(o).slice(0, 120)}`));

// ---- cleanup: remove probe artifacts, close browser ----
await deleteCases(CASES_FILE).catch(() => null);
await deleteSpec(SPEC).catch(() => null);
await import("node:fs/promises").then((fs) => fs.rm("tests/debug-tools", { recursive: true, force: true }).catch(() => null));
await browser.closeBrowser().catch(() => null);

const pass = rows.filter((r) => r.status === "PASS").length;
const exp = rows.filter((r) => r.status === "EXPECTED-ERROR").length;
const fail = rows.filter((r) => r.status === "FAIL").length;
console.log("\n==== ALL-TOOLS DEBUG ====");
for (const r of rows) console.log(`${r.status.padEnd(14)} ${r.tool} :: ${r.case} [${r.ms}ms] ${r.status === "PASS" ? "" : "— " + r.detail}`);
console.log(`\nTOTAL ${rows.length}: ${pass} PASS, ${exp} EXPECTED-ERROR, ${fail} FAIL`);
await mkdir("logs", { recursive: true });
await writeFile(`logs/debug-all-tools-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, JSON.stringify(rows, null, 2));
if (fail > 0) process.exit(1);
