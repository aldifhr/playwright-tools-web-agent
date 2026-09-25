// Debug runner: Saucedemo login + explore via model faray.
// Usage:
//   DEBUG_BASE_URL=<gateway-url> DEBUG_API_KEY=<key> \
//     bun scripts/debug-saucedemo-faray.mjs
// Env:
//   DEBUG_APP_URL  local app (default http://localhost:3000)
//   DEBUG_BASE_URL model gateway base URL (required)
//   DEBUG_API_KEY  gateway key (required)
//   DEBUG_MODEL    model name (default faray)
import { mkdir, writeFile } from "node:fs/promises";

const PROMPT =
  process.env.DEBUG_PROMPT ||
  "Open https://www.saucedemo.com, log in with standard_user / secret_sauce, then explore and list all testable areas and features";
const appUrl = (process.env.DEBUG_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const baseUrl = process.env.DEBUG_BASE_URL;
const apiKey = process.env.DEBUG_API_KEY;
const model = process.env.DEBUG_MODEL || "faray";

if (!baseUrl || !apiKey) throw new Error("Set DEBUG_BASE_URL and DEBUG_API_KEY in the environment.");

const started = Date.now();
const response = await fetch(`${appUrl}/api/chat/stream`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    provider: "openai",
    model,
    baseUrl,
    apiKey,
    messages: [{ role: "user", content: PROMPT }],
  }),
  signal: AbortSignal.timeout(480_000),
});
if (!response.ok || !response.body) {
  throw new Error(`Chat stream failed (${response.status}): ${(await response.text()).slice(0, 1000)}`);
}

let buffer = "";
let done = null;
let streamError = null;
for await (const chunk of response.body) {
  buffer += new TextDecoder().decode(chunk);
  const blocks = buffer.split("\n\n");
  buffer = blocks.pop() ?? "";
  for (const block of blocks) {
    const event = block.match(/^event: (.+)$/m)?.[1];
    const raw = block.match(/^data: ([\s\S]+)$/m)?.[1];
    if (!event || raw === undefined) continue;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    if (event === "status") {
      console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${data.phase ?? ""} :: ${data.label ?? ""}`);
      if (data.thinking) console.log(`   thinking: ${String(data.thinking).slice(0, 300)}`);
    } else if (event === "shot") {
      console.log(`[shot] ${data.url ?? ""}`);
    } else if (event === "approval") {
      console.log(`[approval requested] ${data.tool} — auto-waiting (no approver in debug)`);
    } else if (event === "aborted") {
      console.log("[aborted]");
    } else if (event === "done") {
      done = data;
    } else if (event === "error") {
      streamError = data;
    }
  }
}
if (streamError) throw new Error(`Stream error: ${JSON.stringify(streamError).slice(0, 2000)}`);
if (!done) throw new Error("No done event received from chat stream.");

await mkdir("logs", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await writeFile(`logs/debug-saucedemo-faray-${stamp}.json`, JSON.stringify(done, null, 2));
await writeFile(`logs/debug-saucedemo-faray-${stamp}.md`, String(done.text ?? ""));

console.log("\n================ FINAL REPORT ================\n");
console.log(String(done.text ?? "(empty)"));
console.log("\n================ META ================");
console.log(
  JSON.stringify(
    {
      browserActions: done.browserActions,
      artifactActions: done.artifactActions,
      modelRounds: done.modelRounds,
      stopReason: done.stopReason,
      coverage: done.coverage,
      artifacts: done.artifacts,
      usage: done.usage,
    },
    null,
    2
  )
);
