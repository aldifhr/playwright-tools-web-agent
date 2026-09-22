"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardList, RotateCw, Trash2, XCircle } from "lucide-react";

type ToolLog = {
  id: string;
  at: number;
  tool: string;
  status: "success" | "error";
  durationMs: number;
  input: unknown;
  output?: unknown;
  error?: string;
};

function display(value: unknown) {
  if (value === undefined) return "-";
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ToolLog[]>([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/logs", { cache: "no-store" });
      const data = await response.json();
      if (Array.isArray(data.logs)) setLogs(data.logs);
    } catch {}
  }

  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    const interval = setInterval(refresh, 5_000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  async function clear() {
    if (!window.confirm("Delete all tool logs?")) return;
    setBusy(true);
    try {
      await fetch("/api/logs", { method: "DELETE" });
      setLogs([]);
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(
    () => logs.slice().reverse().filter((log) => filter === "all" || log.tool === filter),
    [logs, filter]
  );
  const tools = [...new Set(logs.map((log) => log.tool))].sort();
  const failures = logs.filter((log) => log.status === "error").length;

  return (
    <main className="mesh-bg min-h-screen text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/chat" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/10 hover:text-white">
            <ArrowLeft size={15} /> Chat
          </Link>
          <div className="ml-auto flex gap-2">
            <button onClick={refresh} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/10">
              <RotateCw size={14} /> Refresh
            </button>
            <button onClick={clear} disabled={busy || !logs.length} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-30">
              <Trash2 size={14} /> Clear
            </button>
          </div>
        </div>

        <header className="mt-8 flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black"><ClipboardList size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tool Logs</h1>
             <p className="mt-1 text-sm text-zinc-500">Audit browser actions, shell commands, and file reads.</p>
          </div>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="glass rounded-2xl p-4"><p className="text-2xl font-bold">{logs.length}</p><p className="text-[10px] uppercase tracking-widest text-zinc-500">Total calls</p></div>
          <div className="glass rounded-2xl p-4"><p className="text-2xl font-bold">{tools.length}</p><p className="text-[10px] uppercase tracking-widest text-zinc-500">Tools</p></div>
          <div className="glass col-span-2 rounded-2xl p-4 sm:col-span-1"><p className="text-2xl font-bold">{failures}</p><p className="text-[10px] uppercase tracking-widest text-zinc-500">Errors</p></div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
           <button onClick={() => setFilter("all")} className={`rounded-full px-3 py-1.5 text-xs ${filter === "all" ? "bg-white text-black" : "bg-white/8 text-zinc-400"}`}>All</button>
          {tools.map((tool) => <button key={tool} onClick={() => setFilter(tool)} className={`rounded-full px-3 py-1.5 text-xs ${filter === tool ? "bg-white text-black" : "bg-white/8 text-zinc-400"}`}>{tool}</button>)}
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
           {visible.length === 0 ? <div className="p-12 text-center text-sm text-zinc-500">No tool logs yet.</div> : visible.map((log) => (
            <details key={log.id} className="border-b border-white/8 last:border-b-0">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 hover:bg-white/5">
                {log.status === "success" ? <CheckCircle2 size={16} className="text-zinc-300" /> : <XCircle size={16} className="text-white" />}
                <code className="text-xs text-zinc-200">{log.tool}</code>
                 <span className="text-[11px] text-zinc-500">{new Date(log.at).toLocaleString("en-US")}</span>
                <span className="ml-auto text-[11px] text-zinc-500">{log.durationMs}ms</span>
              </summary>
              <div className="grid gap-3 bg-black/30 px-4 pb-4 pt-1 md:grid-cols-2">
                <div><p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-600">Input</p><pre className="max-h-56 overflow-auto rounded-xl bg-black/50 p-3 text-[11px] whitespace-pre-wrap text-zinc-400">{display(log.input)}</pre></div>
                <div><p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-600">Output / Error</p><pre className="max-h-56 overflow-auto rounded-xl bg-black/50 p-3 text-[11px] whitespace-pre-wrap text-zinc-400">{display(log.error || log.output)}</pre></div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </main>
  );
}
