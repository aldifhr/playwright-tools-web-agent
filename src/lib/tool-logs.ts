import { promises as fs } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "logs");
const FILE = join(DIR, "tool-logs.json");
const MAX_ENTRIES = 500;

export type ToolLog = {
  id: string;
  at: number;
  tool: string;
  status: "success" | "error";
  durationMs: number;
  input: unknown;
  output?: unknown;
  error?: string;
};

const SENSITIVE = /password|token|secret|api[-_]?key|authorization|cookie/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return value.length > 4_000 ? `${value.slice(0, 4_000)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).slice(0, 50).map(([key, item]) => [
        key,
        SENSITIVE.test(key) ? "[redacted]" : redact(item, depth + 1),
      ])
    );
  }
  return value;
}

export async function recordToolLog(entry: Omit<ToolLog, "id" | "at">) {
  try {
    await fs.mkdir(DIR, { recursive: true });
    const current = await loadToolLogs();
    current.push({
      ...entry,
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      input: redact(entry.input),
      output: redact(entry.output),
      error: entry.error?.slice(0, 2_000),
    });
    await fs.writeFile(FILE, JSON.stringify(current.slice(-MAX_ENTRIES)), "utf8");
  } catch (error) {
    console.error("tool log error:", error);
  }
}

export async function loadToolLogs(): Promise<ToolLog[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? (value as ToolLog[]).slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

export async function clearToolLogs() {
  try {
    await fs.unlink(FILE);
  } catch {}
}
