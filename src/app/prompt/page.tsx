"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, FileText, ScrollText } from "lucide-react";

type Section = { name: string; content: string; chars: number };

export default function PromptPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/prompt", { cache: "no-store" });
        const data = await res.json();
        if (Array.isArray(data.sections)) {
          setSections(data.sections);
          setTotal(data.total ?? 0);
          setOpen({ [data.sections[0]?.name ?? ""]: false });
        }
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function copyAll() {
    const full = sections.map((s) => `# ${s.name}\n\n${s.content}`).join("\n\n---\n");
    navigator.clipboard?.writeText(full).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  }

  return (
    <main className="mesh-bg min-h-screen text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/chat" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/10 hover:text-white">
            <ArrowLeft size={15} /> Chat
          </Link>
          <button onClick={copyAll} className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/10">
            <Copy size={14} /> {copied ? "Copied" : "Copy full prompt"}
          </button>
        </div>

        <header className="mt-8 flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black"><ScrollText size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">System Prompt</h1>
            <p className="mt-1 text-sm text-zinc-500">Exactly what the model receives before every run, split per section.</p>
          </div>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="glass rounded-2xl p-4"><p className="text-2xl font-bold">{sections.length}</p><p className="text-[10px] uppercase tracking-widest text-zinc-500">Sections</p></div>
          <div className="glass rounded-2xl p-4"><p className="text-2xl font-bold">{(total / 1024).toFixed(1)}k</p><p className="text-[10px] uppercase tracking-widest text-zinc-500">Chars</p></div>
          <div className="glass col-span-2 rounded-2xl p-4 sm:col-span-1"><p className="text-2xl font-bold">~{Math.round(total / 4)}</p><p className="text-[10px] uppercase tracking-widest text-zinc-500">Est. tokens</p></div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {sections.map((s) => (
            <details
              key={s.name}
              className="overflow-hidden rounded-2xl border border-white/10"
              open={!!open[s.name]}
              onToggle={(e) => setOpen((prev) => ({ ...prev, [s.name]: (e.target as HTMLDetailsElement).open }))}
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-white/5">
                <FileText size={15} className="shrink-0 text-zinc-400" />
                <span className="truncate text-xs font-semibold text-zinc-200">{s.name}</span>
                <span className="ml-auto shrink-0 text-[11px] text-zinc-500">{(s.chars / 1024).toFixed(1)}k chars</span>
              </summary>
              <pre className="max-h-96 overflow-auto border-t border-white/10 bg-black/40 p-4 text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-300">{s.content}</pre>
            </details>
          ))}
        </div>
      </div>
    </main>
  );
}
