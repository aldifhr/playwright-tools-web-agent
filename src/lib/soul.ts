import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SYSTEM_PROMPT } from "./providers";
import { loadMemory } from "./memory";

const FALLBACK_SOUL =
  "Namaku Play, AI Browser Agent yang santai tapi sigap. Jawab singkat dan jujur, hanya dari hasil browsing — pantang mengarang isi web.";

let warned = false;

// SOUL.md dibaca live dari repo root setiap dipanggil — edit file-nya,
// kepribadian agent berubah tanpa perlu ubah kode (atau rebuild).
export function loadSoul(): string {
  try {
    return readFileSync(join(process.cwd(), "SOUL.md"), "utf-8").trim();
  } catch {
    if (!warned) {
      warned = true;
      console.warn("SOUL.md tidak ditemukan, memakai kepribadian bawaan.");
    }
    return FALLBACK_SOUL;
  }
}

// Kepribadian (SOUL.md) + kemampuan & aturan (SYSTEM_PROMPT) + ingatan (MEMORY.md).
export function getSystemPrompt(config?: {
  provider?: string;
  model?: string;
  baseUrl?: string;
}): string {
  const mem = loadMemory();
  const memBlock = mem
    ? `\n\n---\n\n# MEMORY.md — yang kuingat tentang user\n${mem}`
    : "";
  const metadata = {
    agentName: "Play",
    version: "0.1.0",
    provider: config?.provider || "configured by client",
    model: config?.model || "configured by client",
    baseUrl: config?.baseUrl || "configured by client",
    serverLocation: process.env.SERVER_LOCATION || "local",
    uptimeMinutes: Math.floor(process.uptime() / 60),
    timestamp: new Date().toISOString(),
  };
  const metadataBlock = `\n\n---\n\n# Agent Metadata\n${JSON.stringify(metadata, null, 2)}`;
  return `${loadSoul()}\n\n---\n\n${SYSTEM_PROMPT}${metadataBlock}${memBlock}`;
}
