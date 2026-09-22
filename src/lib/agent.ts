import { tool } from "ai";
import { z } from "zod";
import * as browser from "./browser";
import { saveSpec, runSpec, saveCases, savePlanDocument, recordRun, listSpecs } from "./specs";
import { saveFact, forgetFact } from "./memory";
import { RUN_CANCELLED } from "./runs";
import { recordToolLog } from "./tool-logs";

const TestCaseSchema = z.object({
  id: z.string().describe("Unique ID, for example TC-001"),
  area: z.string().describe("Feature area, for example Login"),
  type: z.string().describe("Positive / Negative / Boundary / other"),
  title: z.string().describe("Case title — MUST exactly match the test() name in the spec"),
  preconditions: z.string().optional().default(""),
  testData: z.string().optional().default(""),
  steps: z.array(z.string()).describe("Step 1, 2, 3..."),
  expected: z.string().describe("Expected result"),
  priority: z.enum(["High", "Medium", "Low"]).optional().default("Medium"),
  severity: z.enum(["High", "Medium", "Low"]).optional().default("Medium"),
});

const PlanItemSchema = z.object({ key: z.string(), value: z.string() });
const PlanRoleSchema = z.object({ role: z.string(), name: z.string(), responsibility: z.string() });
const PlanScheduleSchema = z.object({ event: z.string(), startDate: z.string(), endDate: z.string() });
const PlanRiskSchema = z.object({ risk: z.string(), mitigation: z.string() });
const PlanApprovalSchema = z.object({ name: z.string(), role: z.string(), signature: z.string() });

export { statusLabel, IDLE_STATUS, THINKING_STATUS } from "./agent-status";

// Tools that pause for explicit user approval before executing.
// Extend this set to gate more tools; approval UI lives in Chat.tsx,
// resolution arrives via POST /api/chat/approve.
const APPROVAL_TOOLS = new Set(["browser_bash"]);

// Dipakai /api/chat/stream (SSE per-step).
// onCall dipanggil TEPAT SEBELUM tool dieksekusi → cocok untuk status real-time.
// shouldAbort dicek sebelum tiap tool → implementasi interrupt.
// awaitApproval dipanggil untuk tool sensitif → human-in-the-loop (resep AI SDK).
export function getBrowserTools(
  onCall?: (toolName: string, input: unknown) => void,
  shouldAbort?: () => boolean,
  delegateTask?: (task: string) => Promise<unknown>,
  awaitApproval?: (toolName: string, input: unknown) => Promise<boolean>
) {
  const wrap = <T extends object>(
    toolName: string,
    fn: (input: T) => Promise<unknown>
  ) => {
    return async (input: T) => {
      if (shouldAbort?.()) throw new Error(RUN_CANCELLED);
      if (APPROVAL_TOOLS.has(toolName)) {
        if (!awaitApproval) {
          // No approval channel (e.g. sub-agent): deny by default.
          // Only provably side-effect-free commands pass without a human.
          const cmd = (input as { command?: unknown } | null)?.command;
          if (typeof cmd !== "string" || !browser.isReadOnlyCommand(cmd)) {
            throw new Error(
              `User denied ${toolName}. Do not retry it; inform the user the action was not performed.`
            );
          }
        } else {
          const approved = await awaitApproval(toolName, input);
          if (shouldAbort?.()) throw new Error(RUN_CANCELLED);
          if (!approved) {
            throw new Error(
              `User denied ${toolName}. Do not retry it; inform the user the action was not performed.`
            );
          }
        }
      }
      try {
        onCall?.(toolName, input);
      } catch {}
      const started = Date.now();
      try {
        const output = await fn(input);
        const loggedInput = toolName === "browser_type"
          ? { ...input, text: "[redacted]" }
          : input;
        void recordToolLog({
          tool: toolName,
          status: "success",
          durationMs: Date.now() - started,
          input: loggedInput,
          output,
        });
        return output;
      } catch (error) {
        const loggedInput = toolName === "browser_type"
          ? { ...input, text: "[redacted]" }
          : input;
        void recordToolLog({
          tool: toolName,
          status: "error",
          durationMs: Date.now() - started,
          input: loggedInput,
          error: error instanceof Error ? error.message : "tool failed",
        });
        throw error;
      }
    };
  };

  return {
    browser_navigate: tool({
       description: "Open a URL in the automated browser",
      inputSchema: z.object({ url: z.string().describe("full URL") }),
      execute: wrap("browser_navigate", async ({ url }: { url: string }) =>
        browser.navigate(url)
      ),
    }),
    browser_snapshot: tool({
      description: "Inspect the active page structure (tag, role, accessible name, text)",
      inputSchema: z.object({}),
      execute: wrap("browser_snapshot", async () => browser.snapshot()),
    }),
    browser_get_text: tool({
      description: "Read the visible page text",
      inputSchema: z.object({}),
      execute: wrap("browser_get_text", async () => browser.getText()),
    }),
    browser_click: tool({
       description:
        "Click an element using a CSS selector or numeric snapshot index",
      inputSchema: z.object({ selector: z.string() }),
      execute: wrap("browser_click", async ({ selector }: { selector: string }) =>
        browser.click(selector)
      ),
    }),
    browser_type: tool({
       description: "Fill a form input",
      inputSchema: z.object({
        selector: z.string(),
        text: z.string(),
        submit: z.boolean().optional().default(false),
      }),
      execute: wrap(
        "browser_type",
        async ({
          selector,
          text,
          submit,
        }: {
          selector: string;
          text: string;
          submit?: boolean;
        }) => browser.typeText(selector, text, submit)
      ),
    }),
    browser_screenshot: tool({
      description: "Capture a screenshot of the active page (base64 PNG)",
      inputSchema: z.object({
        fullPage: z.boolean().optional().default(false),
      }),
      execute: wrap(
        "browser_screenshot",
        async ({ fullPage }: { fullPage?: boolean }) =>
          browser.screenshot(!!fullPage)
      ),
    }),
    browser_go_back: tool({
      description: "Go back to the previous page",
      inputSchema: z.object({}),
      execute: wrap("browser_go_back", async () => browser.goBack()),
    }),
    browser_scroll: tool({
      description: "Scroll the page to reveal content below the fold, then snapshot again",
      inputSchema: z.object({
        direction: z.enum(["down", "up", "top", "bottom"]).optional().default("down"),
        pixels: z.number().int().min(100).max(5000).optional().default(600),
      }),
      execute: wrap(
        "browser_scroll",
        async ({ direction, pixels }: { direction?: "down" | "up" | "top" | "bottom"; pixels?: number }) =>
          browser.scrollPage(direction ?? "down", pixels ?? 600)
      ),
    }),
    test_assert: tool({
      description: "Run a deterministic assertion against the live page and get a PASS/FAIL result. Use this to verify outcomes instead of eyeballing.",
      inputSchema: z.object({
        kind: z.enum(["text_contains", "visible", "count"]).describe("text_contains needs text; visible and count need selector; count also needs expected"),
        selector: z.string().optional().default(""),
        text: z.string().optional().default(""),
        expected: z.number().int().min(0).optional().default(1),
      }),
      execute: wrap(
        "test_assert",
        async ({ kind, selector, text, expected }: { kind: "text_contains" | "visible" | "count"; selector?: string; text?: string; expected?: number }) => {
          if (kind === "text_contains") {
            if (!text) throw new Error("text is required for text_contains");
            return browser.assertPage({ kind, text });
          }
          if (!selector) throw new Error("selector is required for visible/count");
          return kind === "visible"
            ? browser.assertPage({ kind, selector })
            : browser.assertPage({ kind, selector, expected: expected ?? 1 });
        }
      ),
    }),
    browser_close: tool({
      description: "Close the browser",
      inputSchema: z.object({}),
      execute: wrap("browser_close", async () => browser.closeBrowser()),
    }),
    browser_bash: tool({
       description: "Run a restricted command without a shell (npm, node, grep, ls, and other safe commands)",
      inputSchema: z.object({ command: z.string().min(1).max(500) }),
      execute: wrap("browser_bash", async ({ command }: { command: string }) =>
        browser.bash(command)
      ),
    }),
    browser_read_file: tool({
       description: "Read allowed project files in read-only mode",
      inputSchema: z.object({
        path: z.string().min(1),
        limit: z.number().int().positive().max(10000).optional(),
      }),
      execute: wrap(
        "browser_read_file",
        async ({ path, limit }: { path: string; limit?: number }) =>
          browser.readFile(path, limit)
      ),
    }),
    browser_delegate: tool({
       description: "Delegate a controlled QA exploration or test-planning subtask",
      inputSchema: z.object({ task: z.string().min(1).max(2_000) }),
      execute: wrap("browser_delegate", async ({ task }: { task: string }) => {
         if (!delegateTask) throw new Error("Sub-agent is not available in this mode");
        return delegateTask(task);
      }),
    }),
    test_save: tool({
      description:
        "Save a Playwright test file (.spec.ts) in tests/ after site exploration",
      inputSchema: z.object({
        file: z
          .string()
          .describe("file name, e.g. login-saucedemo.spec.ts"),
        content: z.string().describe("full spec content"),
      }),
      execute: wrap(
        "test_save",
        async ({ file, content }: { file: string; content: string }) =>
          saveSpec(file, content)
      ),
    }),
    test_plan_document: tool({
      description:
        "Save a ten-section QA test plan document as Markdown: Project Information, Objective, Scope, Test Strategy, Deliverables, Environment, Roles, Schedule, Risk & Mitigation, and Approval",
      inputSchema: z.object({
        file: z.string().describe("base file name, e.g. saucedemo-test-plan"),
        projectName: z.string(),
        testerName: z.string(),
        date: z.string(),
        version: z.string(),
        objective: z.string(),
        inScope: z.array(z.string()),
        outOfScope: z.array(z.string()),
        testStrategy: z.array(z.string()),
        deliverables: z.array(z.string()),
        environment: z.array(PlanItemSchema),
        roles: z.array(PlanRoleSchema),
        schedule: z.array(PlanScheduleSchema),
        risks: z.array(PlanRiskSchema),
        approval: z.array(PlanApprovalSchema),
      }),
      execute: wrap("test_plan_document", async (input) => savePlanDocument(input.file, input)),
    }),
    test_run: tool({
      description:
        "Run Playwright tests and return the result (passed/failed plus errors)",
      inputSchema: z.object({
        file: z
          .string()
          .optional()
          .describe(
             "specific filename; leave empty to run all tests"
          ),
      }),
      execute: wrap("test_run", async ({ file }: { file?: string }) => {
        const summary = await runSpec(file || undefined);
        await recordRun(file || null, summary);
        return summary;
      }),
    }),
    memory_save: tool({
      description:
        "Save durable facts to memory (user preferences, public demo site facts, important URLs). Never use this for passwords, API keys, or tokens",
      inputSchema: z.object({
        fact: z.string().describe("satu fakta singkat, satu baris"),
      }),
      execute: wrap("memory_save", async ({ fact }: { fact: string }) =>
        saveFact(fact)
      ),
    }),
    memory_forget: tool({
      description: "Remove an outdated memory fact by keyword",
      inputSchema: z.object({
        query: z.string().describe("keyword for the fact to remove"),
      }),
      execute: wrap("memory_forget", async ({ query }: { query: string }) =>
        forgetFact(query)
      ),
    }),
    test_plan: tool({
      description:
        "Save structured test cases (ID, Area, Type, Title, Preconditions, TestData, Steps, Expected, Priority, Severity) as .cases.json. Use before test_save",
      inputSchema: z.object({
        file: z
          .string()
          .describe("base file name, e.g. login-saucedemo.spec.ts"),
        cases: z.array(TestCaseSchema).min(1).max(50),
      }),
      execute: wrap(
        "test_plan",
        async ({
          file,
          cases,
        }: {
          file: string;
          cases: z.infer<typeof TestCaseSchema>[];
        }) => saveCases(file, cases)
      ),
    }),
    test_list: tool({
      description:
        "List saved spec files (.spec.ts) in tests/",
      inputSchema: z.object({}),
      execute: wrap("test_list", async () => listSpecs()),
    }),
  };
}
