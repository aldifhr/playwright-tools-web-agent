"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  FlaskConical,
  Loader2,
  Play,
  Sparkles,
  Square,
  Table as TableIcon,
  Trash2,
} from "lucide-react";
import { fmtTime, loadSettings } from "@/lib/store";

type TestCase = {
  id: string;
  area: string;
  type: string;
  title: string;
  preconditions: string;
  testData: string;
  steps: string[];
  expected: string;
  priority: string;
  severity: string;
};

type SpecInfo = { file: string; kb: number; updatedAt: number };
type SpecResult = {
  title: string;
  file: string;
  status: string;
  durationMs: number;
  error: string;
};
type RunSummary = {
  ok: boolean;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  results: SpecResult[];
  error?: string;
};

export default function TestsPage() {
  const [tests, setTests] = useState<SpecInfo[]>([]);
  const [code, setCode] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState<string | null>(null); // file atau "__all__"
  const [results, setResults] = useState<Record<string, RunSummary>>({});
  const [error, setError] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  const [genUrl, setGenUrl] = useState("");
  const [genScenario, setGenScenario] = useState("");
  const [genCreds, setGenCreds] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [genSummary, setGenSummary] = useState("");
  const [genRunId, setGenRunId] = useState<string | null>(null);
  const genCtrl = useRef<AbortController | null>(null);
  const [caseRows, setCaseRows] = useState<Record<string, TestCase[]>>({});
  const [casesOpen, setCasesOpen] = useState<Record<string, boolean>>({});

  async function refresh() {
    try {
      const r = await fetch("/api/tests");
      const d = await r.json();
      if (Array.isArray(d.tests)) setTests(d.tests);
      // hasil run persisten (termasuk dari chat/agent) — yang fresh menang
      if (d.lastRun && typeof d.lastRun === "object") {
        setResults((prev) => ({ ...(d.lastRun as Record<string, RunSummary>), ...prev }));
      }
    } catch {}
  }

  useEffect(() => {
    const t = setTimeout(() => {
      refresh();
    }, 0);
    // auto-refresh: tangkap spec baru yang disimpan agent dari chat
    // tanpa perlu reload halaman
    const iv = setInterval(() => {
      refresh();
    }, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  async function toggleCode(file: string) {
    const willOpen = !open[file];
    setOpen((o) => ({ ...o, [file]: willOpen }));
    if (willOpen && !code[file]) {
      const r = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", file }),
      });
      const d = await r.json();
      if (r.ok) setCode((c) => ({ ...c, [file]: d.content }));
    }
  }

  async function run(file?: string) {
    const key = file ?? "__all__";
    setRunning(key);
    setError("");
    try {
      const r = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", file }),
      });
      const d = (await r.json()) as RunSummary;
      if (!r.ok) throw new Error((d as unknown as { error?: string }).error || "Run gagal");
      if (file) {
        setResults((m) => ({ ...m, [file]: d }));
      } else {
        const byFile: Record<string, RunSummary> = {};
        for (const t of d.results) {
          const f = t.file || "__all__";
          if (!byFile[f]) {
            byFile[f] = { ok: true, passed: 0, failed: 0, skipped: 0, durationMs: 0, results: [] };
          }
          byFile[f].results.push(t);
          if (t.status === "passed") byFile[f].passed += 1;
          else if (t.status === "skipped") byFile[f].skipped += 1;
          else byFile[f].failed += 1;
        }
        byFile["__all__"] = d;
        setResults((m) => ({ ...m, ...byFile }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run gagal");
    } finally {
      setRunning(null);
    }
  }

  async function stopGenerate() {
    const id = genRunId;
    setGenRunId(null);
    try {
      genCtrl.current?.abort();
    } catch {}
    genCtrl.current = null;
    if (id) {
      try {
        await fetch("/api/chat/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: id }),
        });
      } catch {}
    }
  }

  async function generate() {
    const url = genUrl.trim();
    const scenario = genScenario.trim();
    if (!url || !scenario || generating) return;
    const s = loadSettings();
    const apiKey = s.keys[s.provider]?.trim();
    if (!apiKey) {
      setError("Isi API key dulu di /settings");
      return;
    }
    setGenerating(true);
    setGenSummary("");
    setGenStatus("Agent is typing…");
    setError("");
    const ctrl = new AbortController();
    genCtrl.current = ctrl;
    let aborted = false;
    try {
      const prompt =
        `Buatkan test case Playwright untuk ${url}. ` +
        `Skenario: ${scenario}.` +
        (genCreds.trim() ? ` Kredensial: ${genCreds.trim()}.` : "") +
        ` Bekerja hemat langkah (maks 20): snapshot sekali per halaman, jangan klik acak,` +
        ` prioritaskan test_plan → test_save → test_run sampai selesai, lalu laporkan tabel.`;
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          provider: s.provider,
          model: s.model,
          apiKey,
          baseUrl: s.baseUrls[s.provider] ?? "",
        }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "Generate gagal");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = /event: (\w+)/.exec(frame)?.[1];
          const dm = /data: ([\s\S]*)/.exec(frame)?.[1];
          if (!ev || dm === undefined) continue;
          if (ev === "init") {
            try {
              setGenRunId((JSON.parse(dm) as { runId?: string }).runId ?? null);
            } catch {}
          } else if (ev === "status") {
            try {
              const d = JSON.parse(dm) as { label?: string };
              if (d.label) setGenStatus(d.label);
            } catch {}
          } else if (ev === "done") {
            const d = JSON.parse(dm) as { text?: string; capped?: boolean };
            setGenSummary(d.text || "Selesai");
            if (d.capped) {
              setError(
                "Mencapai batas 20 langkah — hasil mungkin parsial. Pecah skenario jadi lebih kecil, atau lanjutkan di chat."
              );
            }
            refresh();
          } else if (ev === "aborted") {
            aborted = true;
            setGenStatus("Dihentikan");
            break;
          } else if (ev === "error") {
          } else if (ev === "error" || ev === "aborted") {
            const d = JSON.parse(dm) as { error?: string };
            throw new Error(d.error || "Generate dibatalkan");
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (aborted) return;
      setError(e instanceof Error ? e.message : "Generate gagal");
    } finally {
      if (genCtrl.current === ctrl) genCtrl.current = null;
      setGenRunId(null);
      setGenerating(false);
    }
  }

  async function toggleCases(file: string) {
    const willOpen = !casesOpen[file];
    setCasesOpen((o) => ({ ...o, [file]: willOpen }));
    if (willOpen && !caseRows[file]) {
      const r = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cases", file }),
      });
      const d = await r.json();
      if (r.ok && Array.isArray(d.cases)) {
        setCaseRows((c) => ({ ...c, [file]: d.cases }));
      }
    }
  }

  function resultFor(file: string, title: string): SpecResult | null {
    return results[file]?.results.find((x) => x.title === title) ?? null;
  }

  async function remove(file: string) {
    if (!window.confirm(`Hapus ${file}?`)) return;
    await fetch("/api/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", file }),
    });
    setResults((m) => {
      const n = { ...m };
      delete n[file];
      return n;
    });
    refresh();
  }

  const all = results["__all__"];

  return (
    <div className="mesh-bg min-h-screen text-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={15} /> Kembali ke chat
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-lg shadow-white/10">
            <FlaskConical size={22} className="text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Test Cases</h1>
            <p className="text-xs text-zinc-500">
              Spec Playwright — minta di chat mis. “buatkan test login saucedemo”
            </p>
          </div>
          <button
            onClick={() => run()}
            disabled={running !== null || tests.length === 0}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-30"
          >
            {running === "__all__" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Play size={15} />
            )}
            Run semua
          </button>
        </div>

        {/* generator */}
        <div className="glass mt-4 overflow-hidden rounded-2xl">
          <button
            onClick={() => setGenOpen(!genOpen)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left"
          >
            <Sparkles size={15} className="text-white" />
            <span className="text-sm font-semibold">Generate test case baru</span>
            <span className="text-[11px] text-zinc-500">URL + skenario → spec + run otomatis</span>
            <ChevronDown
              size={15}
              className={`ml-auto text-zinc-500 transition ${genOpen ? "rotate-180" : ""}`}
            />
          </button>
          {genOpen && (
            <div className="border-t border-white/10 p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={genUrl}
                  onChange={(e) => setGenUrl(e.target.value)}
                  placeholder="https://www.saucedemo.com"
                  spellCheck={false}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/40"
                />
                <input
                  value={genCreds}
                  onChange={(e) => setGenCreds(e.target.value)}
                  placeholder="Kredensial demo (opsional)"
                  spellCheck={false}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/40"
                />
              </div>
              <textarea
                value={genScenario}
                onChange={(e) => setGenScenario(e.target.value)}
                placeholder="Skenario: login standard_user lalu tambah 1 produk ke cart dan cek badge cart = 1"
                rows={2}
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/40"
              />
              <div className="mt-2 flex items-center gap-2">
                {generating ? (
                  <button
                    onClick={stopGenerate}
                    title="Hentikan generator"
                    className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200"
                  >
                    <Square size={14} fill="currentColor" /> Stop
                  </button>
                ) : (
                  <button
                    onClick={generate}
                    disabled={!genUrl.trim() || !genScenario.trim()}
                    className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-30"
                  >
                    <Sparkles size={15} /> Generate + Run
                  </button>
                )}
                {generating && (
                  <span className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className="flex gap-1">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                    {genStatus}
                  </span>
                )}
              </div>
              {!!genSummary && (
                <div className="prose-sm mt-3 rounded-xl bg-black/40 p-3 text-sm whitespace-pre-wrap text-zinc-200">
                  {genSummary}
                </div>
              )}
            </div>
          )}
        </div>

        {all && (
          <div className="glass mt-4 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${all.ok ? "bg-white text-black" : "border border-white/30 text-white"}`}
            >
              {all.ok ? "PASS" : "FAIL"}
            </span>
            <span className="text-zinc-300">
              {all.passed} passed • {all.failed} failed • {all.skipped} skipped
            </span>
            <span className="ml-auto text-xs text-zinc-500">
              {(all.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-white/25 bg-white/8 px-4 py-3 text-sm text-white">
            ⚠ {error}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {tests.length === 0 && (
            <div className="grid place-items-center rounded-2xl border border-dashed border-white/15 py-16 text-center">
              <Bot size={28} className="text-zinc-700" />
              <p className="mt-3 text-sm font-medium text-zinc-400">Belum ada test case</p>
              <p className="mt-1 max-w-70 text-xs text-zinc-600">
                Chat dengan Faray: “buatkan test case login saucedemo dan jalankan” — spec tersimpan otomatis di sini
              </p>
            </div>
          )}
          {tests.map((t) => {
            const res = results[t.file];
            const isRunning = running === t.file;
            return (
              <div key={t.file} className="glass overflow-hidden rounded-2xl">
                <div className="flex items-center gap-2 px-4 py-3">
                  <FlaskConical size={15} className="shrink-0 text-white" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-semibold">{t.file}</p>
                    <p className="text-[11px] text-zinc-500">
                      {t.kb} KB • {fmtTime(t.updatedAt)}
                      {res && (
                        <>
                          {" • "}
                          <span className={res.failed ? "text-white" : "text-zinc-400"}>
                            {res.passed}✓ {res.failed > 0 && `${res.failed}✗`}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => run(t.file)}
                    disabled={running !== null}
                    title="Jalankan"
                    className="rounded-lg bg-white p-2 text-black hover:bg-zinc-200 disabled:opacity-30"
                  >
                    {isRunning ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Play size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => toggleCases(t.file)}
                    title="Tabel test case"
                    className={`rounded-lg p-2 hover:bg-white/15 ${casesOpen[t.file] ? "bg-white text-black" : "bg-white/8 text-white"}`}
                  >
                    <TableIcon size={14} />
                  </button>
                  <button
                    onClick={() => toggleCode(t.file)}
                    title="Lihat kode"
                    className="rounded-lg bg-white/8 p-2 text-white hover:bg-white/15"
                  >
                    <ChevronDown
                      size={14}
                      className={`transition ${open[t.file] ? "rotate-180" : ""}`}
                    />
                  </button>
                  <button
                    onClick={() => remove(t.file)}
                    title="Hapus"
                    className="rounded-lg p-2 text-zinc-500 hover:bg-white/10 hover:text-white"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {res && res.results.length > 0 && (
                  <div className="border-t border-white/10 px-4 py-2">
                    {res.results.map((r, i) => (
                      <div key={i} className="py-1.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.status === "passed" ? "bg-white" : r.status === "skipped" ? "bg-zinc-600" : "bg-zinc-400 animate-pulse"}`}
                          />
                          <span className="truncate text-zinc-200">{r.title}</span>
                          <span className="ml-auto shrink-0 text-zinc-600">
                            {(r.durationMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                        {!!r.error && (
                          <pre className="mt-1 overflow-x-auto rounded-lg bg-black p-2 font-mono text-[11px] text-zinc-400">
                            {r.error.slice(0, 600)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {casesOpen[t.file] && (
                  <div className="overflow-x-auto border-t border-white/10">
                    {(caseRows[t.file] ?? []).length === 0 ? (
                      <p className="px-4 py-3 text-xs text-zinc-500">
                        Belum ada test plan (.cases.json) — minta agent “buatkan test plan untuk {t.file}”.
                      </p>
                    ) : (
                      <table className="w-full min-w-220 border-collapse text-left text-[11px]">
                        <thead>
                          <tr className="text-zinc-500">
                            {["ID", "Area", "Type", "Title", "Preconditions", "Test Data", "Steps", "Expected", "Actual", "Status", "Priority", "Severity"].map((h) => (
                              <th key={h} className="border-b border-white/10 px-2 py-2 font-semibold tracking-wider uppercase">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(caseRows[t.file] ?? []).map((c) => {
                            const run = resultFor(t.file, c.title);
                            const st = run ? (run.status === "passed" ? "PASS" : "FAILED") : null;
                            return (
                              <tr key={c.id} className="align-top hover:bg-white/5">
                                <td className="px-2 py-2 font-mono whitespace-nowrap text-white">{c.id}</td>
                                <td className="px-2 py-2 whitespace-nowrap text-zinc-300">{c.area}</td>
                                <td className="px-2 py-2 whitespace-nowrap">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.type.toLowerCase().includes("neg") ? "border border-white/30 text-white" : "bg-white/10 text-zinc-200"}`}>
                                    {c.type}
                                  </span>
                                </td>
                                <td className="max-w-45 px-2 py-2 text-zinc-200">{c.title}</td>
                                <td className="max-w-40 px-2 py-2 text-zinc-400">{c.preconditions || "—"}</td>
                                <td className="max-w-40 px-2 py-2 font-mono text-zinc-400">{c.testData || "—"}</td>
                                <td className="max-w-55 px-2 py-2 text-zinc-300">
                                  <ol className="list-decimal space-y-0.5 pl-4">
                                    {c.steps.map((s, k) => (
                                      <li key={k}>{s}</li>
                                    ))}
                                  </ol>
                                </td>
                                <td className="max-w-45 px-2 py-2 text-zinc-300">{c.expected}</td>
                                <td className="max-w-45 px-2 py-2 text-zinc-300">
                                  {!run ? (
                                    <span className="text-zinc-600">—</span>
                                  ) : run.status === "passed" ? (
                                    <span className="text-zinc-200">✓ sesuai expected</span>
                                  ) : (
                                    <span className="break-words text-white" title={run.error}>
                                      {run.error ? run.error.slice(0, 220) : "FAILED"}
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-2 whitespace-nowrap">
                                  {st ? (
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st === "PASS" ? "bg-white text-black" : "border border-white/40 text-white"}`}>
                                      {st}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-600">—</span>
                                  )}
                                </td>
                                <td className="px-2 py-2 whitespace-nowrap text-zinc-300">{c.priority}</td>
                                <td className="px-2 py-2 whitespace-nowrap text-zinc-300">{c.severity}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {open[t.file] && (
                  <pre className="max-h-96 overflow-auto border-t border-white/10 bg-black p-4 font-mono text-xs leading-relaxed text-zinc-300">
                    {code[t.file] ?? "Memuat…"}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
