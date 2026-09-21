"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical, History } from "lucide-react";
import { fmtTime } from "@/lib/store";

type RunLogEntry = {
  id: string;
  at: number;
  scope: string | null;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  ok: boolean;
  results: { file: string; title: string; status: string; durationMs: number }[];
};

type Flaky = {
  key: string;
  file: string;
  title: string;
  passed: number;
  failed: number;
  runs: number;
};

export default function RunsPage() {
  const [history, setHistory] = useState<RunLogEntry[]>([]);

  async function refresh() {
    try {
      const r = await fetch("/api/tests");
      const d = await r.json();
      if (Array.isArray(d.history)) setHistory(d.history);
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

  const ordered = [...history].sort((a, b) => b.at - a.at);
  const total = history.length;
  const passRate = total
    ? Math.round(
        (history.filter((h) => h.ok).length / total) * 100
      )
    : 0;
  const avgDur = total
    ? history.reduce((n, h) => n + h.durationMs, 0) / total
    : 0;

  // flaky: status campur aduk dalam 30 run terakhir
  const flaky = (() => {
    const map = new Map<string, { file: string; title: string; passed: number; failed: number; runs: number }>();
    for (const h of history.slice(-30)) {
      for (const t of h.results) {
        const key = `${t.file}::${t.title}`;
        const e = map.get(key) ?? { file: t.file, title: t.title, passed: 0, failed: 0, runs: 0 };
        e.runs += 1;
        if (t.status === "passed") e.passed += 1;
        else if (t.status !== "skipped") e.failed += 1;
        map.set(key, e);
      }
    }
    const out: Flaky[] = [];
    for (const [key, e] of map) {
      if (e.runs >= 2 && e.passed > 0 && e.failed > 0) out.push({ key, ...e });
    }
    return out.sort((a, b) => b.runs - a.runs);
  })();

  const stats: [string, string][] = [
    ["Total run", String(total)],
    ["Pass rate", total ? `${passRate}%` : "—"],
    ["Rata-rata durasi", total ? `${(avgDur / 1000).toFixed(1)}s` : "—"],
    ["Flaky", String(flaky.length)],
  ];

  return (
    <div className="mesh-bg min-h-screen text-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Link
          href="/tests"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={15} /> Kembali ke tests
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-lg shadow-white/10">
            <History size={22} className="text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Riwayat Run</h1>
            <p className="text-xs text-zinc-500">
              Jejak tiap eksekusi test • {total} run tersimpan
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label} className="glass rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold">{value}</p>
              <p className="mt-0.5 text-[10px] tracking-widest text-zinc-500 uppercase">{label}</p>
            </div>
          ))}
        </div>

        {flaky.length > 0 && (
          <>
            <p className="mt-6 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
              Flaky — hasil tidak stabil ({flaky.length})
            </p>
            <div className="flex flex-col gap-2">
              {flaky.map((f) => (
                <div key={f.key} className="glass rounded-xl px-3.5 py-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-zinc-400" />
                    <span className="min-w-0 flex-1 truncate text-zinc-200">{f.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-zinc-500">{f.file}</span>
                  </div>
                  <p className="mt-0.5 pl-3.5 text-[11px] text-zinc-500">
                    {f.passed} pass • {f.failed} fail dari {f.runs} run terakhir
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-6 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
          Semua run
        </p>
        {ordered.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-white/15 py-14 text-center">
            <FlaskConical size={26} className="text-zinc-700" />
            <p className="mt-3 text-sm font-medium text-zinc-400">Belum ada run tercatat</p>
            <p className="mt-1 max-w-60 text-xs text-zinc-600">
              Jalankan test dari chat, generator, atau tombol Run — otomatis tercatat di sini
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-130 border-collapse text-left text-xs">
              <thead>
                <tr className="text-zinc-500">
                  {["Waktu", "Scope", "Hasil", "P/F/S", "Durasi"].map((h) => (
                    <th key={h} className="border-b border-white/10 bg-white/5 px-3 py-2 font-semibold tracking-wider uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordered.map((h) => (
                  <tr key={h.id} className="align-top hover:bg-white/5">
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-300">{fmtTime(h.at)}</td>
                    <td className="max-w-45 truncate px-3 py-2 font-mono text-zinc-300">
                      {h.scope ?? "semua"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${h.ok ? "bg-white text-black" : "border border-white/40 text-white"}`}>
                        {h.ok ? "PASS" : "FAIL"}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-400">
                      {h.passed}✓ {h.failed > 0 && `${h.failed}✗ `}{h.skipped > 0 && `${h.skipped}⊘`}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                      {(h.durationMs / 1000).toFixed(1)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
