/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Download,
  Film,
  FlaskConical,
  History,
  Image as ImageIcon,
  Loader2,
  PanelRight,
  Play,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { fmtTime, loadSettings } from "@/lib/store";

type Attachment = {
  name: string;
  path: string;
  contentType: string;
};

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
  attachments?: Attachment[];
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

type TestChatMsg = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { tool: string; input: unknown }[];
};

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pipe(s: string): string {
  return s.replace(/\|/g, "/").replace(/\n/g, "<br>");
}

export default function TestsPage() {
  const [tests, setTests] = useState<SpecInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [detailTab, setDetailTab] = useState<"cases" | "hasil" | "kode">("cases");
  const [code, setCode] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, RunSummary>>({});
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<{
    kind: "video" | "image";
    url: string;
    title: string;
  } | null>(null);
  const [caseRows, setCaseRows] = useState<Record<string, TestCase[]>>({});

  // generator (sidebar)
  const [genOpen, setGenOpen] = useState(false);
  const [genUrl, setGenUrl] = useState("");
  const [genScenario, setGenScenario] = useState("");
  const [genCreds, setGenCreds] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [genSummary, setGenSummary] = useState("");
  const [genRunId, setGenRunId] = useState<string | null>(null);
  const genCtrl = useRef<AbortController | null>(null);

  // chat (tengah, seperti home)
  const [chatMsgs, setChatMsgs] = useState<TestChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatStatus, setChatStatus] = useState("");
  const [chatRunId, setChatRunId] = useState<string | null>(null);
  const chatCtrl = useRef<AbortController | null>(null);
  const chatBottom = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  async function refresh() {
    try {
      const r = await fetch("/api/tests");
      const d = await r.json();
      if (Array.isArray(d.tests)) {
        setTests(d.tests);
        setSelected((prev) => {
          if (prev && d.tests.some((t: SpecInfo) => t.file === prev)) return prev;
          return d.tests.length ? d.tests[0].file : null;
        });
      }
      if (d.lastRun && typeof d.lastRun === "object") {
        setResults((prev) => ({ ...(d.lastRun as Record<string, RunSummary>), ...prev }));
      }
    } catch {}
  }

  useEffect(() => {
    const t = setTimeout(() => {
      refresh();
    }, 0);
    const iv = setInterval(() => {
      refresh();
    }, 8000);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // muat cases + code spec terpilih
  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cases", file: selected }),
        });
        const d = await r.json();
        if (r.ok && Array.isArray(d.cases)) {
          setCaseRows((c) => ({ ...c, [selected]: d.cases }));
        }
      } catch {}
      try {
        const r = await fetch("/api/tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get", file: selected }),
        });
        const d = await r.json();
        if (r.ok) setCode((c) => ({ ...c, [selected]: d.content }));
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [selected]);

  useEffect(() => {
    chatBottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs, chatBusy]);

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  function resultFor(file: string, title: string): SpecResult | null {
    return results[file]?.results.find((x) => x.title === title) ?? null;
  }

  function actualText(run: SpecResult | null): string {
    if (!run) return "—";
    if (run.status === "passed") return "✓ sesuai expected";
    return run.error ? run.error.slice(0, 220) : "FAILED";
  }

  /* ---------- run / hapus ---------- */

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

  /* ---------- export laporan ---------- */

  function buildMD(file: string): string {
    const cases = caseRows[file] ?? [];
    const res = results[file];
    const lines = [
      `# Laporan Test — ${file}`,
      ``,
      res
        ? `Hasil: ${res.passed} passed • ${res.failed} failed • ${res.skipped} skipped (${(res.durationMs / 1000).toFixed(1)}s)`
        : `Belum pernah di-run.`,
      ``,
      `| ID | Area | Type | Title | Preconditions | Test Data | Steps | Expected | Actual | Status | Priority | Severity |`,
      `|---|---|---|---|---|---|---|---|---|---|---|---|`,
    ];
    for (const c of cases) {
      const run = resultFor(file, c.title);
      const st = run ? (run.status === "passed" ? "PASS" : "FAILED") : "-";
      lines.push(
        `| ${pipe(c.id)} | ${pipe(c.area)} | ${pipe(c.type)} | ${pipe(c.title)} | ${pipe(c.preconditions || "-")} | ${pipe(c.testData || "-")} | ${c.steps.map((s, k) => `${k + 1}. ${pipe(s)}`).join("<br>")} | ${pipe(c.expected)} | ${pipe(actualText(run))} | ${st} | ${pipe(c.priority)} | ${pipe(c.severity)} |`
      );
    }
    return lines.join("\n") + "\n";
  }

  function buildHTML(file: string): string {
    const cases = caseRows[file] ?? [];
    const res = results[file];
    const rows = cases
      .map((c) => {
        const run = resultFor(file, c.title);
        const st = run ? (run.status === "passed" ? "PASS" : "FAILED") : "-";
        const cls = st === "PASS" ? "pass" : st === "FAILED" ? "fail" : "";
        return `<tr><td><code>${esc(c.id)}</code></td><td>${esc(c.area)}</td><td>${esc(c.type)}</td><td>${esc(c.title)}</td><td>${esc(c.preconditions || "-")}</td><td><code>${esc(c.testData || "-")}</code></td><td><ol>${c.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></td><td>${esc(c.expected)}</td><td>${esc(actualText(run))}</td><td class="${cls}"><b>${st}</b></td><td>${esc(c.priority)}</td><td>${esc(c.severity)}</td></tr>`;
      })
      .join("\n");
    return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Laporan Test — ${esc(file)}</title><style>body{font-family:system-ui,sans-serif;background:#fff;color:#111;margin:32px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#111;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.05em}.pass{color:#15803d}.fail{color:#b91c1c}code{background:#f4f4f5;padding:1px 4px;border-radius:4px}ol{margin:0;padding-left:18px}.meta{color:#555;margin-bottom:16px}</style></head><body><h1>Laporan Test — ${esc(file)}</h1><p class="meta">${res ? `${res.passed} passed • ${res.failed} failed • ${res.skipped} skipped (${(res.durationMs / 1000).toFixed(1)}s)` : "Belum pernah di-run."}</p><table><thead><tr><th>ID</th><th>Area</th><th>Type</th><th>Title</th><th>Preconditions</th><th>Test Data</th><th>Steps</th><th>Expected</th><th>Actual</th><th>Status</th><th>Priority</th><th>Severity</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  }

  /* ---------- generator ---------- */

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
            const d = JSON.parse(dm) as { error?: string };
            throw new Error(d.error || "Generate gagal");
          }
        }
        if (aborted) {
          try {
            await reader.cancel();
          } catch {}
          break;
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

  /* ---------- chat tengah ---------- */

  async function chatStop() {
    const id = chatRunId;
    setChatRunId(null);
    try {
      chatCtrl.current?.abort();
    } catch {}
    chatCtrl.current = null;
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

  async function chatSend(text?: string) {
    const content = (text ?? chatInput).trim();
    if (!content || chatBusy) return;
    const s = loadSettings();
    const apiKey = s.keys[s.provider]?.trim();
    if (!apiKey) {
      setError("Isi API key dulu di /settings");
      return;
    }
    const history = [...chatMsgs, { role: "user" as const, content }];
    const apiMsgs = history.map((m) => ({ role: m.role, content: m.content }));
    if (chatMsgs.length === 0) {
      apiMsgs[0].content =
        "(Konteks: kamu sedang di halaman Tests. Fokus bantu seputar test case Playwright: lihat daftar via test_list, buat via test_plan+test_save, jalankan via test_run, jelaskan, perbaiki.)\n\n" +
        content;
    }
    setChatMsgs(history);
    setChatInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setChatBusy(true);
    setChatStatus("Agent is typing…");
    const ctrl = new AbortController();
    chatCtrl.current = ctrl;
    let aborted = false;
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          messages: apiMsgs,
          provider: s.provider,
          model: s.model,
          apiKey,
          baseUrl: s.baseUrls[s.provider] ?? "",
        }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "Chat gagal");
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
              setChatRunId((JSON.parse(dm) as { runId?: string }).runId ?? null);
            } catch {}
          } else if (ev === "status") {
            try {
              const d = JSON.parse(dm) as { label?: string };
              if (d.label) setChatStatus(d.label);
            } catch {}
          } else if (ev === "done") {
            const d = JSON.parse(dm) as {
              text?: string;
              toolCalls?: { tool: string; input: unknown }[];
            };
            setChatMsgs((m) => [
              ...m,
              {
                role: "assistant",
                content: d.text || "(tidak ada jawaban)",
                toolCalls: d.toolCalls,
              },
            ]);
            refresh();
          } else if (ev === "aborted") {
            aborted = true;
            break;
          } else if (ev === "error") {
            const d = JSON.parse(dm) as { error?: string };
            throw new Error(d.error || "Chat gagal");
          }
        }
        if (aborted) {
          try {
            await reader.cancel();
          } catch {}
          break;
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (aborted) return;
      setError(e instanceof Error ? e.message : "Chat gagal");
    } finally {
      if (chatCtrl.current === ctrl) chatCtrl.current = null;
      setChatRunId(null);
      setChatBusy(false);
    }
  }

  /* ---------- derived ---------- */

  const active = tests.find((t) => t.file === selected) ?? null;
  const activeRes = selected ? results[selected] : undefined;
  const activeCases = selected ? (caseRows[selected] ?? []) : [];
  const totalPassed = Object.values(results).reduce((n, r) => n + (r === results["__all__"] ? 0 : r.passed), 0);
  const totalFailed = Object.values(results).reduce((n, r) => n + (r === results["__all__"] ? 0 : r.failed), 0);

  return (
    <div className="mesh-bg flex h-screen text-white">
      <div className="animate-blob pointer-events-none fixed -top-24 left-1/4 h-72 w-72 rounded-full bg-white/8 blur-[100px]" />
      <div className="animate-blob pointer-events-none fixed right-10 bottom-0 h-80 w-80 rounded-full bg-white/5 blur-[110px] [animation-delay:2s]" />

      {/* ── SIDEBAR: daftar spec ── */}
      <aside
        className={`relative z-20 flex shrink-0 flex-col border-r border-white/10 bg-black backdrop-blur-2xl transition-all duration-300 ${
          sidebarOpen ? "w-80" : "w-0 overflow-hidden border-0"
        }`}
      >
        <div className="flex h-full w-80 flex-col overflow-y-auto p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white shadow-lg shadow-white/10">
              <FlaskConical size={20} className="text-black" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">Test Cases</p>
              <p className="text-[11px] text-zinc-400">
                {tests.length} spec • {totalPassed}✓ {totalFailed > 0 && `${totalFailed}✗`}
              </p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <Link
            href="/chat"
            className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={14} /> Kembali ke chat
          </Link>

          <button
            onClick={() => run()}
            disabled={running !== null || tests.length === 0}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-lg shadow-white/10 transition hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-30"
          >
            {running === "__all__" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Play size={15} />
            )}
            Run semua
          </button>

          <p className="mt-5 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
            Spec
          </p>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {tests.length === 0 && (
              <p className="px-1 py-4 text-center text-xs text-zinc-600">
                Belum ada spec — generate dari chat tengah
              </p>
            )}
            {tests.map((t) => {
              const r = results[t.file];
              const isActive = t.file === selected;
              return (
                <div
                  key={t.file}
                  onClick={() => {
                    setSelected(t.file);
                    setDetailTab("cases");
                  }}
                  className={`group cursor-pointer rounded-xl border px-3 py-2.5 transition active:scale-[0.98] ${
                    isActive
                      ? "border-white/40 bg-white/10"
                      : "border-transparent hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${!r ? "bg-zinc-700" : r.failed > 0 ? "bg-zinc-400" : "bg-white"}`}
                    />
                    <p className={`truncate font-mono text-[13px] font-medium ${isActive ? "text-white" : "text-zinc-400"}`}>
                      {t.file}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(t.file);
                      }}
                      title="Hapus"
                      className="ml-auto shrink-0 rounded-lg p-1 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <p className="mt-0.5 pl-3.5 text-[10px] text-zinc-600">
                    {t.kb} KB • {fmtTime(t.updatedAt)}
                    {r && ` • ${r.passed}✓${r.failed > 0 ? ` ${r.failed}✗` : ""}`}
                  </p>
                </div>
              );
            })}
          </div>

          {/* generator mini */}
          <div className="mt-auto pt-4">
            <button
              onClick={() => setGenOpen(!genOpen)}
              className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/10"
            >
              <Sparkles size={13} /> Generate baru
              <ChevronDown size={13} className={`ml-auto text-zinc-500 transition ${genOpen ? "rotate-180" : ""}`} />
            </button>
            {genOpen && (
              <div className="animate-fade-up mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
                <input
                  value={genUrl}
                  onChange={(e) => setGenUrl(e.target.value)}
                  placeholder="https://…"
                  spellCheck={false}
                  className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-white/40"
                />
                <input
                  value={genCreds}
                  onChange={(e) => setGenCreds(e.target.value)}
                  placeholder="Kredensial demo (opsional)"
                  spellCheck={false}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-white/40"
                />
                <textarea
                  value={genScenario}
                  onChange={(e) => setGenScenario(e.target.value)}
                  placeholder="Skenario…"
                  rows={2}
                  className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-white/40"
                />
                {generating ? (
                  <button
                    onClick={stopGenerate}
                    className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-2 py-2 text-xs font-semibold text-black hover:bg-zinc-200"
                  >
                    <Square size={12} fill="currentColor" /> Stop
                  </button>
                ) : (
                  <button
                    onClick={generate}
                    disabled={!genUrl.trim() || !genScenario.trim()}
                    className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-2 py-2 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-30"
                  >
                    <Sparkles size={12} /> Generate + Run
                  </button>
                )}
                {generating && <p className="mt-1.5 animate-pulse text-[11px] text-zinc-400">{genStatus}</p>}
                {!!genSummary && (
                  <p className="mt-1.5 line-clamp-3 text-[11px] text-zinc-500">{genSummary.slice(0, 200)}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── TENGAH: chat seperti home ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-10 flex items-center gap-3 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-xl">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg bg-white/8 p-2 text-white hover:bg-white/15"
            >
              <PanelRight size={16} className="rotate-180" />
            </button>
          )}
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pr-3 pl-1.5 text-xs text-white">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white">
              <Bot size={13} className="text-black" />
            </span>
            <span className="font-semibold">Faray • Tests</span>
            <span className="text-zinc-500">• tanya / buat / jalankan test</span>
          </div>
          <Link
            href="/runs"
            title="Riwayat run"
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-white/8 px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/15 hover:text-white"
          >
            <History size={14} /> Riwayat
          </Link>
          {error && (
            <span className="ml-auto hidden max-w-80 truncate text-xs text-zinc-300 md:block" title={error}>
              ⚠ {error}
            </span>
          )}
        </header>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
            <div className="mx-auto w-full max-w-2xl">
              {chatMsgs.length === 0 ? (
                <div className="animate-fade-up pt-6 text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white shadow-2xl shadow-white/10">
                    <FlaskConical size={28} className="text-black" />
                  </div>
                  <h1 className="text-gradient mt-5 text-3xl font-extrabold tracking-tight">
                    Ngobrol soal testing
                  </h1>
                  <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                    Seperti chat di home — tapi fokus test case. Daftar spec refresh otomatis tiap selesai.
                  </p>
                  <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
                    {[
                      { t: "Test apa saja yang sudah ada?", d: "Lihat daftar spec tersimpan" },
                      { t: "Buatkan test untuk example.com", d: "Generate + run otomatis" },
                      { t: "Jelaskan locator yang bagus", d: "Best practice Playwright" },
                      { t: "Jalankan semua test", d: "Run + laporkan hasil" },
                    ].map((q) => (
                      <button
                        key={q.t}
                        onClick={() => chatSend(q.t)}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10"
                      >
                        <p className="text-sm font-semibold text-white">{q.t}</p>
                        <p className="text-xs text-zinc-500">{q.d}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {chatMsgs.map((m, i) =>
                    m.role === "user" ? (
                      <div key={i} className="animate-fade-up flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white px-4 py-3 text-sm font-medium text-black">
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div key={i} className="animate-fade-up flex gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white">
                          <Bot size={16} className="text-black" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="glass rounded-2xl rounded-tl-md p-4">
                            <div className="prose-sm text-sm leading-relaxed text-zinc-100 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-black/50 [&_pre]:p-3 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-xs [&_th]:border [&_th]:border-white/10 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1">
                              <ReactMarkdown>{m.content}</ReactMarkdown>
                            </div>
                            {!!m.toolCalls?.length && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {m.toolCalls.map((t, j) => (
                                  <span
                                    key={j}
                                    className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] text-zinc-400"
                                  >
                                    {t.tool.replace("test_", "").replace("browser_", "")}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  )}
                  {chatBusy && (
                    <div className="flex gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-xl bg-white">
                        <Loader2 size={15} className="animate-spin text-black" />
                      </div>
                      <div className="glass flex items-center gap-2 rounded-2xl rounded-tl-md px-4 py-3 text-sm text-zinc-300">
                        <span className="flex gap-1">
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white" />
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white" />
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white" />
                        </span>
                        {chatStatus}
                      </div>
                    </div>
                  )}
                  <div ref={chatBottom} />
                </div>
              )}
            </div>
          </div>

          <div className="px-4 pb-5 sm:px-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                chatSend();
              }}
              className="mx-auto w-full max-w-2xl"
            >
              <div className="glass rounded-3xl p-2 shadow-2xl shadow-black focus-within:border-white/40">
                <textarea
                  ref={taRef}
                  value={chatInput}
                  onChange={(e) => {
                    setChatInput(e.target.value);
                    autosize();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      chatSend();
                    }
                  }}
                  rows={1}
                  placeholder="Buatkan test login untuk… / jalankan semua test…"
                  className="max-h-40 w-full resize-none bg-transparent px-4 pt-3 text-sm text-white outline-none placeholder:text-zinc-600"
                />
                <div className="flex items-center gap-2 px-2 pb-1">
                  <span className="ml-auto text-[10px] text-zinc-600">{chatInput.length}/2000</span>
                  {chatBusy ? (
                    <button
                      type="button"
                      onClick={chatStop}
                      title="Hentikan"
                      className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-black hover:bg-zinc-200"
                    >
                      <Square size={15} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      disabled={!chatInput.trim()}
                      className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-black hover:bg-zinc-200 disabled:opacity-30"
                    >
                      <Send size={17} />
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </main>
      </div>

      {/* ── KANAN: detail spec ── */}
      <aside className="hidden w-105 shrink-0 flex-col border-l border-white/10 bg-black backdrop-blur-2xl lg:flex xl:w-130">
        {!active ? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div>
              <FlaskConical size={26} className="mx-auto text-zinc-700" />
              <p className="mt-3 text-sm text-zinc-500">Pilih spec di sidebar</p>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-white/10 px-4 py-3">
              <p className="truncate font-mono text-sm font-semibold">{active.file}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {active.kb} KB • {fmtTime(active.updatedAt)}
                {activeRes && ` • ${activeRes.passed}✓${activeRes.failed > 0 ? ` ${activeRes.failed}✗` : ""}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  onClick={() => run(active.file)}
                  disabled={running !== null}
                  className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-black hover:bg-zinc-200 disabled:opacity-30"
                >
                  {running === active.file ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run
                </button>
                <button
                  onClick={() => download(`${active.file.replace(/\.spec\.ts$/, "")}.md`, buildMD(active.file), "text/markdown")}
                  title="Export Markdown"
                  className="flex items-center gap-1 rounded-lg bg-white/8 px-2.5 py-1.5 text-[11px] text-white hover:bg-white/15"
                >
                  <Download size={12} /> MD
                </button>
                <button
                  onClick={() => download(`${active.file.replace(/\.spec\.ts$/, "")}.html`, buildHTML(active.file), "text/html")}
                  title="Export HTML"
                  className="flex items-center gap-1 rounded-lg bg-white/8 px-2.5 py-1.5 text-[11px] text-white hover:bg-white/15"
                >
                  <Download size={12} /> HTML
                </button>
                <button
                  onClick={() => remove(active.file)}
                  title="Hapus"
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="mt-2 flex gap-1">
                {(["cases", "hasil", "kode"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDetailTab(t)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize ${detailTab === t ? "bg-white text-black" : "text-zinc-500 hover:bg-white/10 hover:text-white"}`}
                  >
                    {t === "cases" ? "Tabel" : t}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {detailTab === "cases" && (
                <div className="overflow-x-auto p-3">
                  {activeCases.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-zinc-600">
                      Belum ada test plan — minta di chat: “buatkan test plan untuk {active.file}”
                    </p>
                  ) : (
                    <table className="w-full min-w-200 border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="text-zinc-500">
                          {["ID", "Area", "Type", "Title", "Precond", "Data", "Steps", "Expected", "Actual", "Status", "Pri", "Sev"].map((h) => (
                            <th key={h} className="border-b border-white/10 px-2 py-2 font-semibold tracking-wider uppercase">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeCases.map((c) => {
                          const run = resultFor(active.file, c.title);
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
                              <td className="max-w-40 px-2 py-2 text-zinc-200">{c.title}</td>
                              <td className="max-w-36 px-2 py-2 text-zinc-400">{c.preconditions || "—"}</td>
                              <td className="max-w-36 px-2 py-2 font-mono text-zinc-400">{c.testData || "—"}</td>
                              <td className="max-w-48 px-2 py-2 text-zinc-300">
                                <ol className="list-decimal space-y-0.5 pl-4">
                                  {c.steps.map((s, k) => (
                                    <li key={k}>{s}</li>
                                  ))}
                                </ol>
                              </td>
                              <td className="max-w-40 px-2 py-2 text-zinc-300">{c.expected}</td>
                              <td className="max-w-40 px-2 py-2 text-zinc-300">
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
              {detailTab === "hasil" && (
                <div className="p-4">
                  {!activeRes || activeRes.results.length === 0 ? (
                    <p className="py-6 text-center text-xs text-zinc-600">
                      Belum ada hasil run — klik Run
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {activeRes.results.map((r, i) => (
                        <div key={i} className="glass rounded-xl p-3">
                          <div className="flex items-center gap-2 text-xs">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.status === "passed" ? "bg-white" : r.status === "skipped" ? "bg-zinc-600" : "bg-zinc-400 animate-pulse"}`} />
                            <span className="min-w-0 flex-1 truncate text-zinc-200">{r.title}</span>
                            <span className="shrink-0 text-zinc-600">{(r.durationMs / 1000).toFixed(1)}s</span>
                          </div>
                          {!!r.error && (
                            <pre className="mt-2 overflow-x-auto rounded-lg bg-black p-2 font-mono text-[11px] text-zinc-400">
                              {r.error.slice(0, 600)}
                            </pre>
                          )}
                          {!!r.attachments?.length && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {r.attachments.map((a, k) => {
                                const url = `/api/tests/artifact?path=${encodeURIComponent(a.path)}`;
                                const isVideo = /webm|mp4/.test(a.contentType) || /video/.test(a.name);
                                const isImage = /png|image|screen/.test(a.contentType) || /screenshot|image/.test(a.name);
                                return isVideo ? (
                                  <button
                                    key={k}
                                    onClick={() => setViewer({ kind: "video", url, title: r.title })}
                                    className="flex items-center gap-1 rounded-lg bg-white/8 px-2 py-1 text-[11px] text-white hover:bg-white/15"
                                  >
                                    <Film size={11} /> Video
                                  </button>
                                ) : isImage ? (
                                  <button
                                    key={k}
                                    onClick={() => setViewer({ kind: "image", url, title: r.title })}
                                    className="flex items-center gap-1 rounded-lg bg-white/8 px-2 py-1 text-[11px] text-white hover:bg-white/15"
                                  >
                                    <ImageIcon size={11} /> Shot
                                  </button>
                                ) : (
                                  <a
                                    key={k}
                                    href={`${url}&download=1`}
                                    download
                                    className="flex items-center gap-1 rounded-lg bg-white/8 px-2 py-1 text-[11px] text-white hover:bg-white/15"
                                  >
                                    <Download size={11} /> Trace
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {detailTab === "kode" && (
                <pre className="m-3 overflow-auto rounded-xl bg-black p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                  {code[active.file] ?? "Memuat…"}
                </pre>
              )}
            </div>
          </>
        )}
      </aside>

      {/* viewer artifact */}
      {viewer && (
        <div
          onClick={() => setViewer(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <p className="truncate text-sm text-zinc-300">{viewer.title}</p>
              <button onClick={() => setViewer(null)} className="ml-auto rounded-full bg-white p-2 text-black hover:bg-zinc-200">
                <X size={16} />
              </button>
            </div>
            {viewer.kind === "video" ? (
              <video src={viewer.url} controls autoPlay className="w-full rounded-2xl border border-white/15 grayscale" />
            ) : (
              <img src={viewer.url} alt={viewer.title} className="max-h-[80vh] w-full rounded-2xl border border-white/15 object-contain grayscale" />
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-white/25 bg-zinc-950 px-4 py-2.5 text-sm text-white shadow-2xl">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
