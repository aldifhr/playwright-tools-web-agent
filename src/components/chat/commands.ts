// Slash commands for the chat composer. Each command expands into a full
// QA prompt (except /help, which is answered locally without an LLM call).

export type CommandDef = {
  name: string;
  desc: string;
  usage: string;
  build: (args: string) => string;
};

const TARGET = (args: string) => args.trim() || "the current site";

export const COMMANDS: CommandDef[] = [
  {
    name: "testcase",
    desc: "Explore a site and save structured test cases",
    usage: "/testcase [url or feature]",
    build: (args) =>
      `Explore ${TARGET(args)} with the browser tools, then save structured test cases via test_plan covering Positive, Negative, and Boundary types with steps and expected results. Verify the saved file with the quality gate before reporting.`,
  },
  {
    name: "testplan",
    desc: "Create a ten-section QA test plan document",
    usage: "/testplan [url or feature]",
    build: (args) =>
      `Explore ${TARGET(args)} only as much as needed (max 8 browser actions), then save a ten-section QA test plan document via test_plan_document. Use TBD only for genuinely unavailable info and report the quality gate.`,
  },
  {
    name: "audit",
    desc: "QA audit: links, a11y basics, console errors",
    usage: "/audit [url]",
    build: (args) =>
      `QA-audit ${TARGET(args)}: navigate, snapshot, and check for broken links, missing alt text and aria labels, form validation behavior, and visible errors. Verify key findings with test_assert and report a table of issues with severity.`,
  },
  {
    name: "coverage",
    desc: "Report manual + automated coverage from saved files",
    usage: "/coverage [spec file]",
    build: (args) =>
      `Report test coverage: use browser_read_file to read the saved .cases.json and .results.json files in tests/${args.trim() ? ` (focus on files matching "${args.trim()}")` : ""}, then present a coverage table per area (total, executed, PASS/FAIL/BLOCKED/SKIPPED rates) plus untested gaps.`,
  },
  {
    name: "smoke",
    desc: "Run a quick login + cart smoke test",
    usage: "/smoke [url]",
    build: (args) =>
      `Run a smoke test on ${TARGET(args)}: load the page, verify it renders, perform the primary happy-path flow, and assert each step with test_assert. Report PASS/FAIL per step.`,
  },
  {
    name: "screenshot",
    desc: "Capture the page as visual evidence",
    usage: "/screenshot [url]",
    build: (args) =>
      `Open ${TARGET(args)} and capture a screenshot as visual evidence with a short caption describing what is visible.`,
  },
  {
    name: "locators",
    desc: "Discover robust automation locators",
    usage: "/locators [url]",
    build: (args) =>
      `Open ${TARGET(args)} and report robust locators (data-test first, then getByRole, then id) for the key interactive elements as a Markdown table: Element | Locator | Type.`,
  },
];

export const HELP_TEXT = `**Available commands**

${COMMANDS.map((c) => `- \`${c.usage}\` — ${c.desc}`).join("\n")}

Type \`/\` in the composer to autocomplete.`;

export function parseCommand(input: string): { name: string; args: string } | null {
  const match = /^\/([a-zA-Z-]+)\s*(.*)$/.exec(input.trim());
  if (!match) return null;
  return { name: match[1].toLowerCase(), args: (match[2] ?? "").trim() };
}
