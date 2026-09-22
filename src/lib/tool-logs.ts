import { promises as fs } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "logs");
const FILE = join(DIR, "tool-logs.json");
const MAX_ENTRIES = 500;
const MAX_FILE_BYTES = 2_000_000;

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
let cache: ToolLog[] | null = null;
let loadPromise: Promise<ToolLog[]> | null = null;
let writeQueue = Promise.resolve();
// Batched flush: tool calls only mutate memory; disk writes happen at most
// once per second (or immediately when the buffer grows large).
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_NOW_AT = 100;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushToolLogs();
  }, FLUSH_INTERVAL_MS);
  const timer = flushTimer;
  // Don't keep the server alive just for pending logs.
  if (typeof timer === "object" && "unref" in timer && typeof timer.unref === "function") {
    timer.unref();
  }
}

async function flushToolLogs() {
  if (!cache) return;
  const snapshot = JSON.stringify(cache);
  // Serialize writes so simultaneous tool calls cannot overwrite each other.
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(FILE, snapshot, "utf8");
  });
  await writeQueue;
}

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
    const current = await getCache();
    current.push({
      ...entry,
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      input: redact(entry.input),
      output: redact(entry.output),
      error: entry.error?.slice(0, 2_000),
    });
    cache = current.slice(-MAX_ENTRIES);
    while (cache.length > 1 && JSON.stringify(cache).length > MAX_FILE_BYTES) {
      cache.shift();
    }
    if (cache.length >= FLUSH_NOW_AT) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flushToolLogs();
    } else {
      scheduleFlush();
    }
  } catch (error) {
    console.error("tool log error:", error);
  }
}

// Flush buffered entries (runs, shutdown paths, tests).
export async function flushLogs() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushToolLogs();
}

export async function loadToolLogs(): Promise<ToolLog[]> {
  return getCache();
}

async function getCache(): Promise<ToolLog[]> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await fs.readFile(FILE, "utf8");
        const value = JSON.parse(raw) as unknown;
        cache = Array.isArray(value) ? (value as ToolLog[]).slice(-MAX_ENTRIES) : [];
      } catch {
        cache = [];
      }
      return cache;
    })();
  }
  try {
    return await loadPromise;
  } catch {
    cache = [];
    return cache;
  }
}

export async function clearToolLogs() {
  try {
    cache = [];
    await fs.unlink(FILE);
  } catch {}
}
