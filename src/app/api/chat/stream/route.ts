import { NextRequest } from "next/server";
import { generateText, stepCountIs, type ModelMessage } from "ai";
import { getModel, PROVIDERS, ProviderId } from "@/lib/providers";
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

export const maxDuration = 300;
const MAX_STEPS = 30;

function thinkingFor(toolName?: string, input?: unknown) {
  const values = typeof input === "object" && input ? input as Record<string, unknown> : {};
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
    default: return "Choosing the next QA action from the latest observation.";
  }
}

// POST /api/chat/stream — SSE. Event:
//   status { label }   → tahap kerja agent (real-time, dari tool yang dieksekusi)
//   done   { text, toolCalls, screenshots, usage, model, provider }
//   error  { error }
export async function POST(req: NextRequest) {
  let body: {
    messages?: { role: "user" | "assistant"; content: string }[];
    provider?: ProviderId;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  const {
    messages,
    provider = "openai",
    model,
    apiKey = "",
    baseUrl = "",
  } = body;

  if (!messages?.length) {
    return Response.json({ error: "messages cannot be empty" }, { status: 400 });
  }
  if (!PROVIDERS[provider]) {
    return Response.json({ error: "unknown provider" }, { status: 400 });
  }

  const chosenModel = model || PROVIDERS[provider].models[0];
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
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      send("init", { runId });

      try {
        const delegateTask = async (task: string) => {
          if (isCancelled(runId)) throw new Error(RUN_CANCELLED);
           send("status", { label: "Delegating QA subtask…", thinking: "Memecah pekerjaan browser menjadi subtask QA yang lebih kecil." });
          const subTools = getBrowserTools(
             (toolName, input) => send("status", { label: `Sub-agent: ${statusLabel(toolName, input)}`, thinking: thinkingFor(toolName, input), agent: "sub" }),
            () => isCancelled(runId)
          );
          const subResult = await generateText({
            model: llm,
            system:
               "You are a QA sub-agent. Work only on the assigned subtask. " +
               "Explore briefly, use at most 8 tool steps, then return a concise factual result to the main agent. " +
               "Do not delegate again.",
            messages: [{ role: "user", content: task }],
            tools: subTools,
            stopWhen: stepCountIs(8),
          });
          return {
            role: "qa_subagent",
            task,
            text: subResult.text || "Sub-agent selesai tanpa ringkasan.",
          };
        };

        const tools = getBrowserTools(
          (toolName, input) => {
             send("status", { label: statusLabel(toolName, input), thinking: thinkingFor(toolName, input), agent: "main" });
          },
          () => isCancelled(runId),
          delegateTask
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
        let autoShots = 0;
        let capped = false;
        const MAX_AUTO_SHOTS = 6;

        for (let i = 0; i < MAX_STEPS; i++) {
          if (isCancelled(runId)) {
            send("aborted", {});
            return;
          }
           const result = await generateText({
            model: llm,
            system: getSystemPrompt({ provider, model: chosenModel, baseUrl }),
            messages: modelMessages,
            tools,
            stopWhen: stepCountIs(1),
          });
          const step = result.steps[0];
          usage = result.usage ?? usage;
          if (result.text) fullText += (fullText ? "\n" : "") + result.text;

          for (const tc of step?.toolCalls ?? []) {
            toolCalls.push({ tool: tc.toolName, input: tc.input });
          }
           for (const tr of step?.toolResults ?? []) {
             const out = tr.output as unknown;
             if (out && typeof out === "object" && "saved" in (out as Record<string, unknown>)) {
               const result = out as Record<string, unknown>;
               const file = String(result.saved);
               const kind = file.endsWith(".md") ? "Test Plan Document" : file.endsWith(".cases.json") ? "Test Cases" : "Automation";
               artifacts.push({ kind, file, meta: result });
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
              const st = await browser.getStatus();
              const navigated = stepTools.includes("browser_navigate");
              if (navigated || (st.url && st.url !== lastShotUrl)) {
                const shot = await browser.screenshot(false);
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
            fullText.trim() ||
            (capped
              ? "Agent mencapai batas langkah sebelum menyelesaikan ringkasan. Lanjutkan dari eksplorasi terakhir atau pecah permintaan menjadi area yang lebih kecil."
              : "Tool selesai, tetapi model tidak mengirim ringkasan."),
          toolCalls,
           screenshots,
           artifacts,
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
          console.log(`run ${runId} dibatalkan user`);
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
        endRun(runId);
        controller.close();
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
