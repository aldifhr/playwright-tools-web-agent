// Deterministic converter: recorded agent tool calls -> Playwright spec.
// Only page actions translate; everything else becomes a comment so the
// output never pretends to do something it cannot.

type ToolCall = { tool: string; input: unknown };

function str(value: unknown): string {
  return JSON.stringify(String(value ?? ""));
}

function inputOf(tc: ToolCall): Record<string, unknown> {
  return (tc.input ?? {}) as Record<string, unknown>;
}

export function toolCallsToSpec(toolCalls: ToolCall[], testName: string): string {
  const lines: string[] = [];
  for (const tc of toolCalls) {
    const inp = inputOf(tc);
    switch (tc.tool) {
      case "browser_navigate":
        lines.push(`  await page.goto(${str(inp.url ?? "/")});`);
        break;
      case "browser_click": {
        const sel = String(inp.selector ?? "");
        if (/^\d+$/.test(sel.trim())) {
          lines.push(`  // snapshot index ${sel.trim()} — replace with a stable CSS selector`);
        } else {
          lines.push(`  await page.click(${str(sel)});`);
        }
        break;
      }
      case "browser_type": {
        const sel = String(inp.selector ?? "");
        lines.push(`  await page.fill(${str(sel)}, ${str(inp.text ?? "")});`);
        if (inp.submit) lines.push(`  await page.keyboard.press("Enter");`);
        break;
      }
      case "browser_select":
        lines.push(`  await page.selectOption(${str(inp.selector ?? "")}, ${str(inp.value ?? "")});`);
        break;
      case "browser_press":
        if (inp.selector) lines.push(`  await page.press(${str(String(inp.selector))}, ${str(inp.key ?? "")});`);
        else lines.push(`  await page.keyboard.press(${str(inp.key ?? "")});`);
        break;
      case "browser_hover":
        lines.push(`  await page.hover(${str(inp.selector ?? "")});`);
        break;
      case "browser_drag":
        lines.push(`  await page.dragAndDrop(${str(inp.from ?? "")}, ${str(inp.to ?? "")});`);
        break;
      case "browser_scroll": {
        const dir = String(inp.direction ?? "down");
        const px = Number(inp.pixels ?? 600);
        const y = dir === "up" ? -px : dir === "top" ? "-window.scrollY" : dir === "bottom" ? "document.body.scrollHeight" : px;
        lines.push(`  await page.evaluate(() => window.scrollBy(0, ${y}));`);
        break;
      }
      case "browser_wait":
        if (inp.selector) lines.push(`  await page.waitForSelector(${str(String(inp.selector))});`);
        else if (inp.text) lines.push(`  await expect(page.getByText(${str(String(inp.text))}).first()).toBeVisible();`);
        else lines.push(`  await page.waitForTimeout(${Number(inp.timeoutMs ?? 3000)});`);
        break;
      case "browser_screenshot":
        lines.push(`  await page.screenshot({ path: "test-results/evidence.png" });`);
        break;
      case "test_assert": {
        const kind = String(inp.kind ?? "");
        if (kind === "text_contains") lines.push(`  await expect(page.getByText(${str(String(inp.text ?? ""))}).first()).toBeVisible();`);
        else if (kind === "visible") lines.push(`  await expect(page.locator(${str(String(inp.selector ?? ""))})).toBeVisible();`);
        else if (kind === "element_text") lines.push(`  await expect(page.locator(${str(String(inp.selector ?? ""))})).toContainText(${str(String(inp.text ?? ""))});`);
        else if (kind === "count") lines.push(`  await expect(page.locator(${str(String(inp.selector ?? ""))})).toHaveCount(${Number(inp.expected ?? 1)});`);
        else lines.push(`  // [test_assert] unsupported kind, skipped`);
        break;
      }
      default:
        lines.push(`  // [${tc.tool}] not a page action, skipped`);
        break;
    }
  }
  const body = lines.length ? lines.join("\n") : "  // no convertible page actions in this run";
  const safeName = testName.trim().replace(/\s+/g, " ").slice(0, 80) || "recorded session";
  return `import { test, expect } from "@playwright/test";\n\ntest(${str(safeName)}, async ({ page }) => {\n${body}\n});\n`;
}

export function suggestTraceFileName(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "recorded";
  return `${base}-${Date.now().toString(36)}.spec.ts`;
}
