"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Brain, Loader2, Plus, Trash2 } from "lucide-react";

export default function MemoryPage() {
  const [facts, setFacts] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const r = await fetch("/api/memory");
      const d = await r.json();
      if (Array.isArray(d.facts)) setFacts(d.facts);
    } catch {}
  }

  useEffect(() => {
    const t = setTimeout(() => {
      refresh();
    }, 0);
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

  async function save() {
    const fact = input.trim();
    if (!fact || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", fact }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Gagal menyimpan");
      setInput("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  async function forget(fact: string) {
    // hapus via kata kunci unik dari fakta itu
    const query = fact.split(" ").slice(0, 4).join(" ");
    setError("");
    try {
      const r = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forget", query }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Gagal menghapus");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    }
  }

  return (
    <div className="mesh-bg min-h-screen text-white">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={15} /> Kembali ke chat
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-lg shadow-white/10">
            <Brain size={22} className="text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Memory</h1>
            <p className="text-xs text-zinc-500">
              Ingatan jangka panjang Faray • tersimpan di MEMORY.md ({facts.length}/100)
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="mt-6 flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tambah fakta… mis. User lebih suka jawaban tabel"
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/40"
          />
          <button
            disabled={busy || !input.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-black hover:bg-zinc-200 disabled:opacity-30"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          </button>
        </form>

        {error && (
          <div className="mt-3 rounded-xl border border-white/25 bg-white/8 px-3 py-2 text-sm text-white">
            ⚠ {error}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {facts.length === 0 && (
            <div className="grid place-items-center rounded-2xl border border-dashed border-white/15 py-14 text-center">
              <Brain size={26} className="text-zinc-700" />
              <p className="mt-3 text-sm font-medium text-zinc-400">Belum ada ingatan</p>
              <p className="mt-1 max-w-60 text-xs text-zinc-600">
                Faray otomatis mengingat fakta penting dari chat — atau tambah manual di atas
              </p>
            </div>
          )}
          {facts.map((f, i) => (
            <div
              key={`${i}-${f.slice(0, 20)}`}
              className="glass group flex items-center gap-2 rounded-xl px-3 py-2.5"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/10 text-[11px] font-bold text-zinc-300">
                {i + 1}
              </span>
              <p className="min-w-0 flex-1 text-sm text-zinc-200">{f}</p>
              <button
                onClick={() => forget(f)}
                title="Lupakan"
                className="shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-zinc-600">
          Jangan simpan password / API key / token di sini — itu milik /settings.
        </p>
      </div>
    </div>
  );
}
