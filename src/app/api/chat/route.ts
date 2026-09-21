import { NextRequest, NextResponse } from "next/server";
import { generateText, stepCountIs } from "ai";
import { getModel, PROVIDERS, ProviderId } from "@/lib/providers";
import { getBrowserTools } from "@/lib/agent";
import { getSystemPrompt } from "@/lib/soul";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      provider = "openai",
      model,
      apiKey = "",
      baseUrl = "",
    } = body as {
      messages: { role: "user" | "assistant"; content: string }[];
      provider: ProviderId;
      model?: string;
      apiKey?: string;
      baseUrl?: string;
    };

    if (!messages?.length) {
      return NextResponse.json({ error: "messages kosong" }, { status: 400 });
    }

    const chosenModel = model || PROVIDERS[provider].models[0];
    const llm = getModel(provider, chosenModel, apiKey, baseUrl);
    const tools = getBrowserTools();

    const result = await generateText({
      model: llm,
      system: getSystemPrompt(),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      tools,
      stopWhen: stepCountIs(20),
    });

    // Kumpulkan screenshot dari tool results untuk ditampilkan di UI
    const screenshots: { url: string; image: string }[] = [];
    for (const step of result.steps ?? []) {
      for (const tr of step.toolResults ?? []) {
        const out = tr.output as unknown;
        if (
          out &&
          typeof out === "object" &&
          "image" in (out as Record<string, unknown>) &&
          typeof (out as Record<string, unknown>).image === "string"
        ) {
          screenshots.push(
            out as { url: string; image: string }
          );
        }
      }
    }

    const toolCalls = (result.steps ?? []).flatMap((s) =>
      (s.toolCalls ?? []).map((c) => ({
        tool: c.toolName,
        input: c.input,
      }))
    );

    return NextResponse.json({
      text: result.text,
      toolCalls,
      screenshots,
      usage: result.usage,
      model: chosenModel,
      provider,
    });
  } catch (e) {
    console.error("chat error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
