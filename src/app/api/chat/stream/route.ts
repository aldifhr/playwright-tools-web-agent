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
import { parseExplorationScope, readExplorationCheckpoint, saveExplorationCheckpoint } from "@/lib/exploration";
export const maxDuration = 300;
// No action cap by default. Set MAX_AGENT_STEPS or mention a limit in the
// request when a bounded chunk is desired; cancellation and step timeouts
// remain the backstops for an intentionally open-ended exploration.
const MAX_STEPS = Number(process.env.MAX_AGENT_STEPS) || Number.POSITIVE_INFINITY;

function phaseFor(toolName?: string): string {
  if (!toolName) return "Explore";
  if (toolName.startsWith("test_")) return toolName === "test_run" ? "Testing" : "Artifacts";
  if (toolName.startsWith("memory_")) return "Memory";
  return "Explore";
}

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

function isBrowserAction(toolName: string) {
  return toolName.startsWith("browser_") || toolName === "test_assert";
}

function isArtifactAction(toolName: string) {
  return ["test_plan", "test_plan_document", "test_save", "test_run", "test_record"].includes(toolName);
}

function areaForUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const path = new URL(value).pathname.toLowerCase();
    if (path.includes("checkout")) return "checkout";
    if (path.includes("cart")) return "cart";
    if (path.includes("inventory")) return "products";
    if (path === "/" || path.endsWith("/index.html")) return "login";
  } catch {}
  return null;
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
  // Validate BEFORE acquiring a concurrency slot — every return below must
  // not leak the slot. The slot is taken only when a stream will start.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }
  const pre = StreamBodySchema.safeParse(rawBody);
  if (!pre.success) {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }
  if (pre.data.baseUrl.trim()) {
    if (pre.data.baseUrl.trim().length > 500) {
      return Response.json({ error: "base URL is too long" }, { status: 400 });
    }
    try {
      await assertPublicTarget(pre.data.baseUrl.trim(), { allowLocal: true });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "invalid base URL" },
        { status: 400 }
      );
    }
  }
  if (!tryEnter("chat-stream", 3)) {
    return Response.json(
      { error: "too many concurrent runs — try again shortly" },
      { status: 429 }
    );
  }
  // NOTE: the slot is released in the stream's finally block below, not here —
  // handleStream returns the Response immediately while the run continues.
  // The body was already validated above, so this path cannot exit early.
  return handleStream(req, pre.data);
}

async function handleStream(
  req: NextRequest,
  body: {
    messages: { role: "user" | "assistant"; content: string }[];
    provider: "openai" | "anthropic";
    model?: string;
    apiKey: string;
    baseUrl: string;
  }
) {
  const {
    messages,
    provider = "openai",
    model,
    apiKey = "",
    baseUrl = "",
  } = body;

  const chosenModel = model || PROVIDERS[provider].models[0];
  // The prompt is stable for the lifetime of a run. Rebuilding it per tool
  // step rereads MEMORY.md and every approved skill unnecessarily.
  const systemPrompt = getSystemPrompt({ provider, model: chosenModel, baseUrl });
  const latestUserPrompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const scope = parseExplorationScope(latestUserPrompt);
  const previousCheckpoint = scope.continue ? await readExplorationCheckpoint(scope.site) : null;
  let completedAreas = previousCheckpoint?.completedAreas ?? [];
  const currentArea = scope.areas.find((area) => !completedAreas.includes(area)) ?? scope.areas[0];
  const nextArea = scope.areas.find((area) => area !== currentArea && !completedAreas.includes(area)) ?? "";
  const executionPrompt = `${systemPrompt}\n\n---\n# Current exploration scope\n${JSON.stringify({ ...scope, completedAreas, currentArea, nextArea }, null, 2)}\nExplore every requested area, including currentArea, before declaring the exploration complete. An area is covered only after a browser tool result visibly reaches that area's URL/state; writing cases or inferring known locators does not count as exploration. Do not claim a flow was completed if its page was not reached and verified. Save incremental artifacts as each area is finished. ${Number.isFinite(scope.maxActions) ? `Use at most ${scope.maxActions} browser actions.` : "There is no browser-action budget; continue through all requested areas until coverage is complete or a real blocker occurs."} Execute at most one tool call per model round. Do not save the same artifact repeatedly unless adding genuinely new cases; after an artifact is saved, continue the browser flow.`;
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
             (toolName, input) => send("status", { label: `Sub-agent: ${statusLabel(toolName, input)}`, thinking: thinkingFor(toolName, input), phase: phaseFor(toolName), agent: "sub" }),
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

        const actionLimit = Math.max(1, Math.min(MAX_STEPS, scope.maxActions));
        let browserActionsExecuted = 0;
        const toolCalls: { tool: string; input: unknown }[] = [];

        const tools = getBrowserTools(
          (toolName, input) => {
             if (isBrowserAction(toolName)) {
               browserActionsExecuted += 1;
             }
             toolCalls.push({ tool: toolName, input });
             lastLabel = statusLabel(toolName, input);
             lastPhase = phaseFor(toolName);
             send("status", { label: lastLabel, thinking: thinkingFor(toolName, input), phase: lastPhase, agent: "main" });
          },
          () => isCancelled(runId),
          delegateTask,
          awaitApproval,
          runId,
          (toolName) => !isBrowserAction(toolName) || browserActionsExecuted < actionLimit
        );

        let modelMessages: ModelMessage[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const screenshots: { url: string; image: string }[] = [];
        const artifacts: { kind: string; file: string; meta: Record<string, unknown> }[] = [];
        const observedAreas = new Set<string>();
        const verifiedAreas = new Set<string>();
        let fullText = "";
        let usage: unknown = null;
        let modelRounds = 0;
        let lastShotUrl: string | null = null;
        let lastLabel = "Working…";
        let lastPhase = "Explore";
        let autoShots = 0;
        let consecutiveTimeouts = 0;
        const MAX_CONSECUTIVE_TIMEOUTS = 3;
        // A single model step must never hang forever: cap it, then let the
        // loop retry (or finish with a partial summary after repeated timeouts).
        const STEP_TIMEOUT_MS = 120_000;
        let capped = false;
        let stopReason: "completed" | "action_limit" | "model_timeout" | "model_round_limit" = "completed";
        const MAX_AUTO_SHOTS = 6;
        await saveExplorationCheckpoint({
          runId,
          ...scope,
          completedAreas,
          currentArea,
          nextArea,
          lastAction: previousCheckpoint?.lastAction ?? "",
        });

        // Artifact saves and the final text need rounds of their own; they do
        // not consume the browser-action budget.
        const maxModelRounds = Number.isFinite(actionLimit) ? actionLimit + 8 : Number.POSITIVE_INFINITY;
        const reportingTools = Object.fromEntries(
          Object.entries(tools).filter(([name]) => !isBrowserAction(name))
        );
        let browserBudgetReached = false;
        let budgetWarningSent = false;
        for (let i = 0; i < maxModelRounds; i++) {
          if (isCancelled(runId)) {
            send("aborted", {});
            return;
          }
          const browserActionCount = toolCalls.filter((call) => isBrowserAction(call.tool)).length;
          // Warn based on real browser actions, not model rounds consumed by
          // incremental artifact saves.
          if (!budgetWarningSent && browserActionCount >= Math.floor(actionLimit * 0.75)) {
            budgetWarningSent = true;
            send("status", {
              label: lastLabel,
              thinking: "Browser action budget is nearly full — finish the current area, save its artifact, and report the next area. Do not start a new browser flow.",
              phase: lastPhase,
              agent: "main",
            });
          }
           // Client aborts (Stop button, tab close) must cancel the model call
           // immediately — not after the 120s step timeout.
           const stepSignal = AbortSignal.any([req.signal, AbortSignal.timeout(STEP_TIMEOUT_MS)]);
           const outcome = await generateText({
             model: llm,
             system: executionPrompt,
             messages: modelMessages,
             tools: browserBudgetReached ? reportingTools : tools,
             stopWhen: stepCountIs(1),
             providerOptions: provider === "openai"
               ? { openai: { parallelToolCalls: false } }
               : undefined,
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
             if (consecutiveTimeouts > MAX_CONSECUTIVE_TIMEOUTS) {
               stopReason = "model_timeout";
               capped = true;
               send("status", {
                 label: "Model timeout",
                 thinking: "The model timed out three times. The run stopped before reliable browser exploration completed; retry or split the scope into a smaller request.",
                 phase: "Reporting",
                 agent: "main",
               });
               break;
             }
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
          modelRounds += 1;
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
              phase: lastPhase,
              agent: "main",
            });
          }

          const lastTool = step?.toolCalls?.at(-1)?.toolName;
          if (lastTool) {
            await saveExplorationCheckpoint({
              runId,
              ...scope,
              completedAreas,
              currentArea,
              nextArea,
              lastAction: lastTool,
            });
          }
           for (const tr of step?.toolResults ?? []) {
              const out = tr.output as unknown;
              if (out && typeof out === "object") {
                const output = out as Record<string, unknown>;
                const observed = areaForUrl(output.url);
                if (observed) {
                  observedAreas.add(observed);
                  const toolName = tr.toolName;
                  if (["browser_snapshot", "browser_get_text", "test_assert"].includes(toolName)) {
                    verifiedAreas.add(observed);
                  }
                }
              }
              if (out && typeof out === "object" && "saved" in (out as Record<string, unknown>)) {
                const result = out as Record<string, unknown>;
                const file = String(result.saved);
                const kind = file.endsWith(".md") ? "Test Plan Document" : file.endsWith(".cases.json") ? "Test Cases" : "Automation";
                const savedAreas = result.areas && typeof result.areas === "object"
                  ? Object.keys(result.areas as Record<string, unknown>).map((area) => area.toLowerCase())
                  : [];
                const unverifiedAreas = savedAreas.filter((area) => !verifiedAreas.has(area));
                const artifactMeta = {
                  ...result,
                  ...(savedAreas.length ? {
                    coverage: {
                      artifactAreas: savedAreas,
                      verifiedAreas: savedAreas.filter((area) => observedAreas.has(area)),
                      unverifiedAreas,
                    },
                  } : {}),
                  qualityGate: result.qualityGate && typeof result.qualityGate === "object"
                    ? {
                        ...(result.qualityGate as Record<string, unknown>),
                        complete: Boolean((result.qualityGate as Record<string, unknown>).complete) && unverifiedAreas.length === 0,
                        unverifiedAreas,
                      }
                    : result.qualityGate,
                };
                if (savedAreas.includes(currentArea.toLowerCase()) && verifiedAreas.has(currentArea.toLowerCase())) {
                  completedAreas = [...new Set([...completedAreas, currentArea])];
                  await saveExplorationCheckpoint({
                    runId,
                    ...scope,
                    completedAreas,
                    currentArea,
                    nextArea: scope.areas.find((area) => !completedAreas.includes(area)) ?? "",
                    lastAction: "artifact_saved",
                  });
                }
                // Dedupe by filename: re-saves (e.g. spec fix after a failed
                // run) replace the earlier entry instead of doubling it.
                const existing = artifacts.findIndex((a) => a.file === file);
                const entry = { kind, file, meta: artifactMeta };
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

          if (browserActionsExecuted >= actionLimit) {
            browserBudgetReached = true;
            stopReason = "action_limit";
          }
          if ((step?.toolCalls?.length ?? 0) === 0) break;
          if (i === maxModelRounds - 1) {
            capped = true;
            stopReason = "model_round_limit";
          }
        }

        if (!capped) {
          await saveExplorationCheckpoint({
            runId,
            ...scope,
            completedAreas: [...new Set([...completedAreas, currentArea])],
            currentArea,
            nextArea,
            lastAction: "completed",
          });
        }

        const finalBrowserActions = browserActionsExecuted;
        const coveredAreas = scope.areas.filter((area) => verifiedAreas.has(area.toLowerCase()));
        const visitedAreas = scope.areas.filter((area) => observedAreas.has(area.toLowerCase()));
        const capMessage = stopReason === "model_timeout"
          ? "\n\n---\nRun stopped: the model timed out three times before reliable exploration completed. Retry this request or split it into a smaller area."
          : stopReason === "action_limit"
            ? `\n\n---\nStopped early: reached the ${actionLimit}-browser-action limit before finishing. Ask me to continue from where it left off.`
            : stopReason === "model_round_limit"
              ? `\n\n---\nStopped after ${maxModelRounds} model rounds with ${finalBrowserActions} browser actions. Ask me to continue from where it left off.`
              : "";
        const runFacts = `\n\n---\nRun facts (server-verified): ${finalBrowserActions} browser actions executed. Verified areas: ${coveredAreas.length ? coveredAreas.join(", ") : "none"}.${visitedAreas.filter((area) => !coveredAreas.includes(area)).length ? ` Visited only: ${visitedAreas.filter((area) => !coveredAreas.includes(area)).join(", ")}.` : ""}${scope.areas.filter((area) => !coveredAreas.includes(area)).length ? ` Next requested area: ${scope.areas.find((area) => !coveredAreas.includes(area))}.` : " All requested areas verified."}`;
        send("done", {
          text:
            fullText.trim() + capMessage + runFacts ||
            (capped
              ? "Agent reached the step limit before finishing the summary. Continue from the last exploration or split the request into smaller areas."
              : "Tools finished, but the model did not send a summary."),
          toolCalls,
           screenshots,
           artifacts,
          browserActions: toolCalls.filter((call) => isBrowserAction(call.tool)).length,
          artifactActions: toolCalls.filter((call) => isArtifactAction(call.tool)).length,
          modelRounds,
          requestedAreas: scope.areas,
          completedAreas,
          coverage: {
            requestedAreas: scope.areas,
            visitedAreas,
            coveredAreas,
            missingAreas: scope.areas.filter((area) => !coveredAreas.includes(area.toLowerCase())),
          },
          stopReason,
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
