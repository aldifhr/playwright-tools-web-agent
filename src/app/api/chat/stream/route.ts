import { NextRequest } from "next/server";
import { z } from "zod";
import { generateText, stepCountIs, type ModelMessage } from "ai";
import { getModel, PROVIDERS } from "@/lib/providers";
import {
  getBrowserTools,
  statusLabel,
} from "@/lib/agent";
import { getSystemPrompt } from "@/lib/soul";
import * as browser from "@/lib/browser";
import {
  createRun,
  cancelRun,
  isCancelled,
  endRun,
  RUN_CANCELLED,
} from "@/lib/runs";
import { createApproval, isAlwaysAllowed, rejectRunApprovals } from "@/lib/approvals";
import { loadInstalledSkillsSync } from "@/lib/skills";
import { assertPublicTarget } from "@/lib/ssrf";
import { flushLogs } from "@/lib/tool-logs";
import { guardApi } from "@/lib/api-guard";
import { leave, tryEnter } from "@/lib/rate-limit";
export const maxDuration = 300;
// Generous budget for full-coverage explorations. Override with MAX_AGENT_STEPS.
// The per-step 120s timeout and the concurrent-run cap remain as backstops.
const MAX_STEPS = Math.max(10, Number(process.env.MAX_AGENT_STEPS) || 100);

function thinkingFor(toolName?: string, input?: unknown) {  const values = typeof input === "object" && input ? input as Record<string, unknown> : {};
  const target = typeof values.url === "string" ? ` ${values.url}` : " the current target";
  const selector = typeof values.selector === "string" ? ` ${values.selector}` : " the discovered element";
  switch (toolName) {
    case "browser_navigate": return `Opening${target} to start the test flow.`;
    case "browser_snapshot": return "Inspecting the page structure to find stable elements and locators.";
    case "browser_get_text": return "Checking visible text to validate the page state.";
    case "browser_click": return `Testing a click on${selector} to observe state or navigation changes.`;
    case "browser_type": return `Filling${selector} to continue the test scenario.`;
    case "browser_screenshot": return "Capturing visual evidence for the report.";
    case "browser_go_back": return "Going back one page to verify the previous navigation path.";
    case "browser_close": return "Closing the browser after the test step is complete.";
    case "browser_network_log": return "Logging network requests to debug the API layer.";
    case "browser_console": return "Reading console errors for the bug report.";
    case "browser_select": return "Selecting a dropdown option to continue the flow.";
    case "browser_wait": return "Waiting for the expected content to appear.";
    case "browser_storage": return "Inspecting storage for session state.";
    case "browser_cookies": return "Checking cookies for session state.";
    case "browser_upload": return "Uploading a file into the form.";
    case "browser_press": return "Pressing a key to continue the flow.";
    case "browser_hover": return "Hovering to reveal hidden content.";
    case "browser_drag": return "Dragging an element to its target.";
    case "browser_dialog": return "Reading a dialog message.";
    case "browser_tabs": return "Listing open tabs to follow the popup.";
    case "browser_tab_select": return "Switching to the new tab.";
    case "browser_tab_close": return "Closing the extra tab.";
    case "browser_downloads": return "Verifying the downloaded file.";
    case "browser_scroll": return "Scrolling the page to reveal content below the fold.";
    case "test_assert": return "Running a deterministic assertion to verify the expected outcome.";
    default: return "Choosing the next QA action from the latest observation.";
  }
}

const StreamBodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(50_000) }))
    .min(1)
    .max(100),
  provider: z.enum(["openai", "anthropic"]).optional().default("openai"),
  model: z.string().max(120).optional(),
  apiKey: z.string().max(500).optional().default(""),
  baseUrl: z.string().max(500).optional().default(""),
});

// POST /api/chat/stream — SSE. Event:
//   status { label }   → tahap kerja agent (real-time, dari tool yang dieksekusi)
//   done   { text, toolCalls, screenshots, usage, model, provider }
//   error  { error }
export async function POST(req: NextRequest) {
  const blocked = guardApi(req, { scope: "chat-stream", limit: 30 });
  if (blocked) return blocked;
  if (!tryEnter("chat-stream", 3)) {
    return Response.json(
      { error: "too many concurrent runs — try again shortly" },
      { status: 429 }
    );
  }
  // NOTE: the slot is released in the stream's finally block below, not here —
  // handleStream returns the Response immediately while the run continues.
  return handleStream(req);
}

async function handleStream(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }
  const parsed = StreamBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  const {
    messages,
    provider = "openai",
    model,
    apiKey = "",
    baseUrl = "",
  } = parsed.data;
  // The server forwards the user's key to this URL — same validation as /api/models.
  if (baseUrl.trim()) {
    if (baseUrl.trim().length > 500) {
      return Response.json({ error: "base URL is too long" }, { status: 400 });
    }
    try {
      await assertPublicTarget(baseUrl.trim(), { allowLocal: true });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "invalid base URL" },
        { status: 400 }
      );
    }
  }

  const chosenModel = model || PROVIDERS[provider].models[0];
  // The prompt is stable for the lifetime of a run. Rebuilding it per tool
  // step rereads MEMORY.md and every approved skill unnecessarily.
  const systemPrompt = getSystemPrompt({ provider, model: chosenModel, baseUrl });
  // Skill exposure telemetry: which skill ids were loaded into this run's prompt.
  const runSkillIds = loadInstalledSkillsSync().map((s) => s.id);
  const wantsVisualEvidence = messages.some(
    (message) =>
      message.role === "user" &&
      /screenshot|screenshots|bukti visual|bukti gambar|lihat tampilan/i.test(message.content)
  );
  let llm: ReturnType<typeof getModel>;
  try {
    llm = getModel(provider, chosenModel, apiKey, baseUrl);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "model configuration failed" },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const runId = createRun();
  // client disconnect (tutup tab / abort fetch) otomatis = cancel run
  req.signal.addEventListener("abort", () => cancelRun(runId));
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;      const safeClose = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {}
        }
      };
      const send = (event: string, data: unknown) => {
        if (closed || req.signal.aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };
      send("init", { runId });
      // Heartbeat: SSE comment every 15s so idle stretches (long model
      // thinking gaps with zero tool events) don't look dead to proxies
      // or the browser. Comment frames are ignored by the client parser.
      const heartbeat = setInterval(() => {
        if (closed || req.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 15_000);

      try {
        const delegateTask = async (task: string) => {
          if (isCancelled(runId)) throw new Error(RUN_CANCELLED);
           send("status", { label: "Delegating QA subtask…", thinking: "Breaking the browser work into a smaller QA subtask." });
          const subTools = getBrowserTools(
             (toolName, input) => send("status", { label: `Sub-agent: ${statusLabel(toolName, input)}`, thinking: thinkingFor(toolName, input), agent: "sub" }),
            () => isCancelled(runId),
            undefined,
            undefined,
            runId
          );
          const subResult = await generateText({
            model: llm,
            system:
               "You are a QA sub-agent. Work only on the assigned subtask. " +
               "Explore briefly, use at most 8 tool steps, then return a concise factual result to the main agent. " +
               "You cannot approve shell commands: stick to read-only commands (ls, cat, grep) and never run node/npm/npx. " +
               "Do not delegate again.",
            messages: [{ role: "user", content: task }],
            tools: subTools,
            stopWhen: stepCountIs(8),
            abortSignal: req.signal,
          });
          return {
            role: "qa_subagent",
            task,
            text: subResult.text || "Sub-agent finished without a summary.",
          };
        };

        const awaitApproval = async (toolName: string, input: unknown) => {
          if (isCancelled(runId)) return false;
          if (isAlwaysAllowed(runId)) return true;
          const { id, promise } = createApproval(runId);
          send("approval", { id, runId, tool: toolName, input });
          return promise;
        };

        const tools = getBrowserTools(
          (toolName, input) => {
             lastLabel = statusLabel(toolName, input);
             send("status", { label: lastLabel, thinking: thinkingFor(toolName, input), agent: "main" });
          },
          () => isCancelled(runId),
          delegateTask,
          awaitApproval,
          runId
        );

        let modelMessages: ModelMessage[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const toolCalls: { tool: string; input: unknown }[] = [];
        const screenshots: { url: string; image: string }[] = [];
        const artifacts: { kind: string; file: string; meta: Record<string, unknown> }[] = [];
        let fullText = "";
        let usage: unknown = null;
        let lastShotUrl: string | null = null;
        let lastLabel = "Working…";
        let autoShots = 0;
        let consecutiveTimeouts = 0;
        const MAX_CONSECUTIVE_TIMEOUTS = 3;
        // A single model step must never hang forever: cap it, then let the
        // loop retry (or finish with a partial summary after repeated timeouts).
        const STEP_TIMEOUT_MS = 120_000;
        let capped = false;
        const MAX_AUTO_SHOTS = 6;

        for (let i = 0; i < MAX_STEPS; i++) {
          if (isCancelled(runId)) {
            send("aborted", {});
            return;
          }
           // Client aborts (Stop button, tab close) must cancel the model call
           // immediately — not after the 120s step timeout.
           const stepSignal = AbortSignal.any([req.signal, AbortSignal.timeout(STEP_TIMEOUT_MS)]);
           const outcome = await generateText({
             model: llm,
             system: systemPrompt,
             messages: modelMessages,
             tools,
             stopWhen: stepCountIs(1),
             abortSignal: stepSignal,
           }).then(
             (r) => ({ ok: true as const, r }),
             (e: unknown) => ({ ok: false as const, e })
           );
           if (!outcome.ok) {
             if (isCancelled(runId)) {
               send("aborted", {});
               return;
             }
             consecutiveTimeouts += 1;
             if (consecutiveTimeouts > MAX_CONSECUTIVE_TIMEOUTS) break;
             send("status", {
               label: lastLabel,
               thinking: `Model step timed out after 120s (${consecutiveTimeouts}/3) — retrying the step.`,
               agent: "main",
             });
             i -= 1;
             continue;
           }
           const result = outcome.r;
           consecutiveTimeouts = 0;
          const step = result.steps[0];
          usage = result.usage ?? usage;
          if (result.text) fullText += (fullText ? "\n" : "") + result.text;
          // Raw model reasoning: stream the step's actual text instead of
          // only the canned per-tool summary, so "Agent thinking" is verbatim.
          const rawThinking = result.text.trim();
          if (rawThinking && (step?.toolCalls?.length ?? 0) > 0) {
            send("status", {
              label: lastLabel,
              thinking: rawThinking.slice(0, 800),
              agent: "main",
            });
          }

          for (const tc of step?.toolCalls ?? []) {
            toolCalls.push({ tool: tc.toolName, input: tc.input });
          }
           for (const tr of step?.toolResults ?? []) {
              const out = tr.output as unknown;
              if (out && typeof out === "object" && "saved" in (out as Record<string, unknown>)) {
                const result = out as Record<string, unknown>;
                const file = String(result.saved);
                const kind = file.endsWith(".md") ? "Test Plan Document" : file.endsWith(".cases.json") ? "Test Cases" : "Automation";
                // Dedupe by filename: re-saves (e.g. spec fix after a failed
                // run) replace the earlier entry instead of doubling it.
                const existing = artifacts.findIndex((a) => a.file === file);
                const entry = { kind, file, meta: result };
                if (existing >= 0) artifacts[existing] = entry;
                else artifacts.push(entry);
              }
            if (
              out &&
              typeof out === "object" &&
              "image" in (out as Record<string, unknown>) &&
              typeof (out as Record<string, unknown>).image === "string"
            ) {
              screenshots.push(out as { url: string; image: string });
            }
          }

          modelMessages = [...modelMessages, ...result.response.messages];

          // auto-shot hemat: hanya kalau pindah halaman (URL berubah) atau
          // navigate eksplisit — bukan tiap ketik/klik. Maks 6 per run.
          const stepTools = (step?.toolCalls ?? []).map((t) => t.toolName);
          if (
            wantsVisualEvidence &&
            autoShots < MAX_AUTO_SHOTS &&
            !stepTools.includes("browser_screenshot") &&
            stepTools.some((t) =>
              ["browser_navigate", "browser_click", "browser_type"].includes(t)
            )
          ) {
            try {
              const currentUrl = await browser.pageUrl(runId);
              const navigated = stepTools.includes("browser_navigate");
              if (navigated || (currentUrl && currentUrl !== lastShotUrl)) {
                const shot = await browser.screenshot(false, runId);
                screenshots.push(shot);
                send("shot", shot);
                lastShotUrl = shot.url;
                autoShots += 1;
              }
            } catch {}
          }

          if ((step?.toolCalls?.length ?? 0) === 0) break;
          if (i === MAX_STEPS - 1) capped = true;
        }

        send("done", {
          text:
            fullText.trim() + (capped ? `\n\n---\nStopped early: reached the ${MAX_STEPS}-step limit before finishing. Ask me to continue from where it left off.` : "") ||
            (capped
              ? "Agent reached the step limit before finishing the summary. Continue from the last exploration or split the request into smaller areas."
              : "Tools finished, but the model did not send a summary."),
          toolCalls,
           screenshots,
           artifacts,
          skills: runSkillIds,
          usage,
          model: chosenModel,
          provider,
          capped,
        });
      } catch (e) {
        if (
          isCancelled(runId) ||
          (e instanceof Error && e.message.includes(RUN_CANCELLED))
        ) {
          console.log(`run ${runId} cancelled by user`);
          try {
            send("aborted", {});
          } catch {}
        } else {
          console.error("chat stream error:", e);
          send("error", {
            error: e instanceof Error ? e.message : "Unknown error",
          });
        }
      } finally {
        clearInterval(heartbeat);
        rejectRunApprovals(runId);
        endRun(runId);
        leave("chat-stream");
        await browser.closeSession(runId).catch(() => null);
        await flushLogs().catch(() => null);
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
