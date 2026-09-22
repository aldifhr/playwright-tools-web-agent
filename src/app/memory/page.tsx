"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Brain, Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

export default function MemoryPage() {
  const [facts, setFacts] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const { success, error: showError } = useToast();

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
    try {
      const r = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", fact }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Gagal menyimpan");
      setInput("");
      success("Fakta disimpan", fact.slice(0, 40));
      refresh();
    } catch (e) {
      showError("Error", e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  async function forget(fact: string) {
    const query = fact.split(" ").slice(0, 4).join(" ");
    try {
      const r = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forget", query }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Gagal menghapus");
      success("Fakta dihapus", "Ingatan diperbarui");
      refresh();
    } catch (e) {
      showError("Error", e instanceof Error ? e.message : "Gagal menghapus");
    }
  }

  return (
    <div className="mesh-bg min-h-screen text-white">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6"
      >
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={15} /> Kembali ke chat
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 flex items-center gap-3"
        >
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-lg shadow-white/10">
            <Brain size={22} className="text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Memory</h1>
            <p className="text-xs text-zinc-500">
              Ingatan jangka panjang Faray • tersimpan di MEMORY.md ({facts.length}/100)
            </p>
          </div>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
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
        </motion.form>

        <motion.div
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 flex flex-col gap-2"
        >
          <AnimatePresence>
            {facts.length === 0 && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid place-items-center rounded-2xl border border-dashed border-white/15 py-14 text-center"
              >
                <Brain size={26} className="text-zinc-700" />
                <p className="mt-3 text-sm font-medium text-zinc-400">Belum ada ingatan</p>
                <p className="mt-1 max-w-60 text-xs text-zinc-600">
                  Faray otomatis mengingat fakta penting dari chat — atau tambah manual di atas
                </p>
              </motion.div>
            )}
            {facts.map((f, i) => (
              <motion.div
                key={`${i}-${f.slice(0, 20)}`}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
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
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        <p className="mt-4 text-[11px] text-zinc-600">
          Jangan simpan password / API key / token di sini — itu milik /settings.
        </p>
      </motion.div>
    </div>
  );
}
