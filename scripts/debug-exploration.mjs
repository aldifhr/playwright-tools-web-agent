const prompt = "Open https://www.saucedemo.com, log in with standard_user / secret_sauce, then explore and list all testable areas and features";
const appUrl = process.env.DEBUG_APP_URL || "http://localhost:3000";
const baseUrl = process.env.DEBUG_BASE_URL;
const apiKey = process.env.DEBUG_API_KEY;
const model = process.env.DEBUG_MODEL || "faray";

if (!baseUrl || !apiKey) {
  throw new Error("Set DEBUG_BASE_URL and DEBUG_API_KEY in the environment.");
}

const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/chat/stream`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    provider: "openai",
    model,
    baseUrl,
    apiKey,
    messages: [{ role: "user", content: prompt }],
  }),
  signal: AbortSignal.timeout(300_000),
});

const body = await response.text();
if (!response.ok) {
  throw new Error(`Chat stream failed (${response.status}): ${body.slice(0, 1000)}`);
}

const events = [];
for (const block of body.split("\n\n")) {
  const event = block.match(/^event: (.+)$/m)?.[1];
  const data = block.match(/^data: (.+)$/m)?.[1];
  if (!event || !data) continue;
  try {
    events.push({ event, data: JSON.parse(data) });
  } catch {
    events.push({ event, data });
  }
}

const done = events.findLast((entry) => entry.event === "done");
const error = events.findLast((entry) => entry.event === "error");
if (error) throw new Error(JSON.stringify(error.data));
if (!done) throw new Error("No done event received from chat stream.");

const result = done.data;
const output = {
  model,
  browserActions: result.browserActions,
  modelRounds: result.modelRounds,
  stopReason: result.stopReason,
  coverage: result.coverage,
  artifacts: result.artifacts,
  text: result.text,
};
console.log(JSON.stringify(output, null, 2));
