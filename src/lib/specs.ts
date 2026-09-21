import { promises as fs } from "node:fs";
import { join, basename } from "node:path";
import { execFile } from "node:child_process";

// Server-only: kelola file test Playwright di ./tests + menjalankannya.

const DIR = join(process.cwd(), "tests");
const MAX_CONTENT = 200_000;
const RUN_TIMEOUT_MS = 100_000;

export type SpecInfo = {
  file: string;
  kb: number;
  updatedAt: number;
};

export type SpecResult = {
  title: string;
  file: string;
  status: "passed" | "failed" | "skipped" | "timedOut" | string;
  durationMs: number;
  error: string;
};

export type RunSummary = {
  ok: boolean;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  results: SpecResult[];
  error?: string;
};

export function sanitizeFile(name: string): string {
  const base = basename(String(name ?? "").trim());
  if (!/^[a-zA-Z0-9-_]+(\.spec\.ts)?$/.test(base)) {
    throw new Error(
      "nama file tidak valid — pakai huruf/angka/-/_ dan akhiran .spec.ts"
    );
  }
  return base.endsWith(".spec.ts") ? base : `${base}.spec.ts`;
}

export async function listSpecs(): Promise<SpecInfo[]> {
  await fs.mkdir(DIR, { recursive: true });
  const files = (await fs.readdir(DIR)).filter((f) => f.endsWith(".spec.ts"));
  const infos = await Promise.all(
    files.map(async (file) => {
      const st = await fs.stat(join(DIR, file));
      return {
        file,
        kb: Math.max(1, Math.round(st.size / 1024)),
        updatedAt: st.mtimeMs,
      };
    })
  );
  return infos.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readSpec(file: string): Promise<string> {
  const safe = sanitizeFile(file);
  return fs.readFile(join(DIR, safe), "utf-8");
}

export async function saveSpec(
  file: string,
  content: string
): Promise<{ saved: string; lines: number }> {
  const safe = sanitizeFile(file);
  if (!content || !content.trim()) throw new Error("isi test kosong");
  if (content.length > MAX_CONTENT) throw new Error("isi test terlalu besar");
  if (!content.includes("@playwright/test")) {
    throw new Error("spec harus import dari @playwright/test");
  }
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(join(DIR, safe), content.trim() + "\n", "utf-8");
  return { saved: safe, lines: content.trim().split("\n").length };
}

export type TestCase = {
  id: string;
  area: string;
  type: string;
  title: string;
  preconditions: string;
  testData: string;
  steps: string[];
  expected: string;
  priority: "High" | "Medium" | "Low";
  severity: "High" | "Medium" | "Low";
};

export function casesFile(file: string): string {
  const safe = sanitizeFile(file);
  return safe.replace(/\.spec\.ts$/, ".cases.json");
}

export async function readCases(file: string): Promise<TestCase[]> {
  const path = join(DIR, casesFile(file));
  try {
    const raw = await fs.readFile(path, "utf-8");
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (c): c is TestCase =>
        !!c && typeof (c as TestCase).id === "string" && typeof (c as TestCase).title === "string"
    );
  } catch {
    return [];
  }
}

export async function saveCases(
  file: string,
  cases: TestCase[]
): Promise<{ saved: string; count: number }> {
  if (!Array.isArray(cases) || !cases.length) {
    throw new Error("cases kosong");
  }
  if (cases.length > 50) throw new Error("maksimal 50 case");
  const clean = cases.map((c) => ({
    id: String(c.id ?? "").slice(0, 20),
    area: String(c.area ?? "").slice(0, 60),
    type: String(c.type ?? "Positive").slice(0, 20),
    title: String(c.title ?? "").slice(0, 160),
    preconditions: String(c.preconditions ?? "").slice(0, 300),
    testData: String(c.testData ?? "").slice(0, 300),
    steps: (Array.isArray(c.steps) ? c.steps : []).map((s) => String(s).slice(0, 300)).slice(0, 20),
    expected: String(c.expected ?? "").slice(0, 300),
    priority: ["High", "Medium", "Low"].includes(c.priority) ? c.priority : "Medium",
    severity: ["High", "Medium", "Low"].includes(c.severity) ? c.severity : "Medium",
  }));
  if (clean.some((c) => !c.id || !c.title || !c.steps.length || !c.expected)) {
    throw new Error("tiap case wajib ada id, title, steps, expected");
  }
  await fs.mkdir(DIR, { recursive: true });
  const name = casesFile(file);
  await fs.writeFile(join(DIR, name), JSON.stringify(clean, null, 2) + "\n", "utf-8");
  return { saved: name, count: clean.length };
}

export async function deleteSpec(file: string): Promise<{ deleted: string }> {
  const safe = sanitizeFile(file);
  await fs.unlink(join(DIR, safe));
  return { deleted: safe };
}

export async function deleteCases(file: string) {
  try {
    await fs.unlink(join(DIR, casesFile(file)));
  } catch {}
}

type JsonSuite = {
  title: string;
  file: string;
  specs?: JsonSpec[];
  suites?: JsonSuite[];
};
type JsonSpec = {
  title: string;
  file: string;
  tests?: {
    results?: {
      status: string;
      duration?: number;
      errors?: { message?: string }[];
      error?: { message?: string };
    }[];
  }[];
};

function collect(suites: JsonSuite[] | undefined, out: SpecResult[]) {
  for (const s of suites ?? []) {
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const r = t.results?.[0];
        out.push({
          title: spec.title,
          file: spec.file ? basename(spec.file) : "",
          status: r?.status ?? "unknown",
          durationMs: Math.round(r?.duration ?? 0),
          error: (
            r?.errors?.[0]?.message ??
            r?.error?.message ??
            ""
          ).slice(0, 800),
        });
      }
    }
    collect(s.suites, out);
  }
}

const LAST_RUN = join(DIR, ".last-run.json");

export async function loadLastRun(): Promise<Record<string, RunSummary>> {
  try {
    const raw = await fs.readFile(LAST_RUN, "utf-8");
    const map = JSON.parse(raw) as Record<string, RunSummary>;
    return map && typeof map === "object" ? map : {};
  } catch {
    return {};
  }
}

function emptySummary(): RunSummary {
  return { ok: true, passed: 0, failed: 0, skipped: 0, durationMs: 0, results: [] };
}

// Simpan hasil run agar kolom Status di tabel tetap terisi walau run-nya
// dari chat/agent (bukan dari tombol halaman /tests).
export async function recordRun(file: string | null, summary: RunSummary) {
  try {
    await fs.mkdir(DIR, { recursive: true });
    const map = await loadLastRun();
    if (file) {
      map[file] = summary;
    } else {
      // reset entri file yang ikut run ini agar hitungan tidak dobel
      const seen = new Set(summary.results.map((t) => t.file || "__all__"));
      for (const f of seen) map[f] = emptySummary();
      for (const t of summary.results) {
        const f = t.file || "__all__";
        const s = map[f];
        s.results.push(t);
        s.durationMs += t.durationMs;
        if (t.status === "passed") s.passed += 1;
        else if (t.status === "skipped") s.skipped += 1;
        else s.failed += 1;
        s.ok = s.failed === 0;
      }
      map["__all__"] = summary;
    }
    await fs.writeFile(LAST_RUN, JSON.stringify(map), "utf-8");
  } catch {}
}

export function runSpec(file?: string): Promise<RunSummary> {
  return new Promise((resolve) => {
    let safe: string | null = null;
    try {
      if (file) safe = sanitizeFile(file);
    } catch (e) {
      resolve({
        ok: false,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        results: [],
        error: e instanceof Error ? e.message : "nama file tidak valid",
      });
      return;
    }
    const bin = join(process.cwd(), "node_modules", ".bin", "playwright");
    const args = ["test", ...(safe ? [safe] : []), "--reporter=json"];
    const started = Date.now();
    execFile(
      bin,
      args,
      { cwd: process.cwd(), timeout: RUN_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const durationMs = Date.now() - started;
        try {
          const j = JSON.parse(stdout) as {
            stats?: {
              expected?: number;
              unexpected?: number;
              skipped?: number;
            };
            suites?: JsonSuite[];
          };
          const results: SpecResult[] = [];
          collect(j.suites, results);
          const passed = j.stats?.expected ?? results.filter((r) => r.status === "passed").length;
          const failed = j.stats?.unexpected ?? results.filter((r) => !["passed", "skipped"].includes(r.status)).length;
          resolve({
            ok: !err && failed === 0,
            passed,
            failed,
            skipped: j.stats?.skipped ?? 0,
            durationMs,
            results,
            error: err
              ? `exit ${String((err as unknown as { code?: unknown }).code ?? "?")}: ${stderr.slice(-500)}`
              : undefined,
          });
        } catch {
          resolve({
            ok: false,
            passed: 0,
            failed: 0,
            skipped: 0,
            durationMs,
            results: [],
            error: `gagal parse hasil: ${stdout.slice(-800)} ${stderr.slice(-300)}`,
          });
        }
      }
    );
  });
}
