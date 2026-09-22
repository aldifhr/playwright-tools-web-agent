import { NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_BASE_URLS } from "@/lib/providers";
import { assertPublicTarget } from "@/lib/ssrf";
import { guardApi } from "@/lib/api-guard";

export const maxDuration = 30;

async function listOpenAI(baseUrl: string, apiKey: string): Promise<string[]> {
  const base = (baseUrl || DEFAULT_BASE_URLS.openai).replace(/\/+$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const msg = await r.text().catch(() => "");
      throw new Error(`OpenAI /models: ${r.status} ${msg.slice(0, 160)}`);
    }
    const j = (await r.json()) as { data?: { id: string }[] };
    const ids = (j.data ?? []).map((d) => d.id).filter(Boolean);
    // dahulukan model chat populer
    const prio = ["gpt-4o", "gpt-4o-mini", "o4-mini", "o3-mini", "gpt-4.1"];
    return [...new Set([...prio.filter((p) => ids.includes(p)), ...ids.sort()])].slice(0, 60);
  } finally {
    clearTimeout(t);
  }
}

async function listAnthropic(baseUrl: string, apiKey: string): Promise<string[]> {
  const base = (baseUrl || DEFAULT_BASE_URLS.anthropic).replace(/\/+$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${base}/models?limit=50`, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const msg = await r.text().catch(() => "");
      throw new Error(`Anthropic /models: ${r.status} ${msg.slice(0, 160)}`);
    }
    const j = (await r.json()) as { data?: { id: string }[] };
    return (j.data ?? []).map((d) => d.id).filter(Boolean).slice(0, 60);
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: Request) {
  const blocked = guardApi(req, { scope: "models", limit: 30 });
  if (blocked) return blocked;
  const parsed = z.object({
    provider: z.enum(["openai", "anthropic"]),
    apiKey: z.string().min(1).max(500),
    baseUrl: z.string().max(500).optional().default(""),
  }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "provider and API key are required" }, { status: 400 });
  }
  try {
    const { provider, apiKey, baseUrl = "" } = parsed.data;
    // The server forwards the user's key to this URL, so validate the target:
    // must be http(s), resolvable, and never a cloud metadata endpoint.
    // Private/loopback hosts stay allowed (local Ollama-style gateways).
    if (baseUrl.trim()) {
      if (baseUrl.trim().length > 500) {
        return NextResponse.json({ error: "base URL is too long" }, { status: 400 });
      }
      try {
        await assertPublicTarget(baseUrl.trim(), { allowLocal: true });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "invalid base URL" },
          { status: 400 }
        );
      }
    }
    const models =
      provider === "openai"
        ? await listOpenAI(baseUrl, apiKey.trim())
        : await listAnthropic(baseUrl, apiKey.trim());
    if (!models.length) {
      return NextResponse.json({ error: "no models found" }, { status: 502 });
    }
    return NextResponse.json({ models, source: "live" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to load models" },
      { status: 502 }
    );
  }
}
