/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  Bot,
  Brain,
  Camera,
  ChevronDown,
  CircleAlert,
  FileText,
  Globe,
  Loader2,
  MessageSquare,
  MousePointerClick,
  FlaskConical,
  Newspaper,
  PanelRight,
  Plus,
  RotateCcw,
  Send,
  Settings as SettingsIcon,
  Square,
  Sparkles,
  SquareArrowOutUpRight,
  Trash2,
  TrendingUp,
  Bitcoin,
  X,
  Zap,
} from "lucide-react";
import { PROVIDERS, ProviderId } from "@/lib/providers";
import { IDLE_STATUS } from "@/lib/agent-status";
import {
  Session,
  Settings,
  defaultSettings,
  fmtTime,
  loadActiveId,
  loadSessions,
  loadSettings,
  newSession,
  saveActiveId,
  saveSessions,
  titleFrom,
} from "@/lib/store";

type Msg = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { tool: string; input: unknown }[];
  screenshots?: { url: string; image: string }[];
  model?: string;
  time?: string;
};

const SUGGESTIONS = [
  {
    icon: TrendingUp,
    title: "Ringkasan trending",
    desc: "Buka Hacker News & ringkas 5 teratas",
    prompt: "Buka https://news.ycombinator.com dan ringkas 5 berita teratas",
  },
  {
    icon: Camera,
    title: "Visual check",
    desc: "Buka example.com + screenshot",
    prompt: "Buka https://example.com lalu ambil screenshot",
  },
  {
    icon: Bitcoin,
    title: "Cek harga crypto",
    desc: "Harga BTC live dari CoinGecko",
    prompt: "Buka https://www.coingecko.com/en/coins/bitcoin dan beritahu harga bitcoin saat ini",
  },
  {
    icon: Newspaper,
    title: "Headline hari ini",
    desc: "Ringkasan berita Detik",
    prompt: "Buka https://www.detik.com dan ringkas 5 headline utama",
  },
];

const TOOL_META: Record<string, { icon: typeof Globe; label: string }> = {
  browser_navigate: { icon: Globe, label: "Navigate" },
  browser_snapshot: { icon: FileText, label: "Snapshot" },
  browser_get_text: { icon: FileText, label: "Read" },
  browser_click: { icon: MousePointerClick, label: "Click" },
  browser_type: { icon: Zap, label: "Type" },
  browser_screenshot: { icon: Camera, label: "Shot" },
  browser_go_back: { icon: RotateCcw, label: "Back" },
  browser_close: { icon: X, label: "Close" },
};

const PROVIDER_META: Record<ProviderId, { icon: typeof Sparkles; hint: string }> = {
  openai: { icon: Sparkles, hint: "GPT-4o • cloud" },
  anthropic: { icon: Brain, hint: "Claude • cloud" },
};

function now() {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Chat() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [navUrl, setNavUrl] = useState("");
  const [navLoading, setNavLoading] = useState(false);
  const [manualShot, setManualShot] = useState<string | null>(null);
  const [statusText, setStatusText] = useState(IDLE_STATUS);
  const [specCount, setSpecCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef(0);
  const streamRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);

  function abortStream() {
    try {
      streamRef.current?.abort();
    } catch {}
    streamRef.current = null;
  }

  async function stopRun() {
    const id = runIdRef.current;
    runIdRef.current = null;
    abortStream();
    // backup: sinyal eksplisit ke server (abort fetch juga memicu cancel via req.signal)
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

  function cancelActiveRun() {
    const id = runIdRef.current;
    runIdRef.current = null;
    abortStream();
    if (id) {
      fetch("/api/chat/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: id }),
      }).catch(() => {});
    }
  }

  // settings + sessions dari localStorage — dibaca deferred setelah mount
  // agar render pertama identik dengan SSR (tanpa hydration mismatch)
  useEffect(() => {
    const t = setTimeout(() => {
      const s = loadSettings();
      let list = loadSessions();
      // bersihkan screenshot yatim (image kosong) sisa strip kuota lama
      list = list.map((sess) => ({
        ...sess,
        messages: sess.messages.map((m) =>
          m.screenshots?.some((x) => !x.image)
            ? { ...m, screenshots: (m.screenshots ?? []).filter((x) => !!x.image) }
            : m
        ),
      }));
      if (!list.length) list = [newSession()];
      let aid = loadActiveId();
      if (!aid || !list.some((x) => x.id === aid)) {
        aid = [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
      }
      setSettings(s);
      setSessions(list);
      setActiveId(aid);
      saveSessions(list);
      saveActiveId(aid);
      setHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // badge jumlah spec — refresh saat mount, fokus, & tiap chat selesai
  // (agent bisa saja menyimpan spec baru)
  async function refreshSpecCount() {
    try {
      const r = await fetch("/api/tests");
      const d = await r.json();
      if (Array.isArray(d.tests)) setSpecCount(d.tests.length);
    } catch {}
  }

  useEffect(() => {
    const t = setTimeout(() => {
      refreshSpecCount();
    }, 0);
    window.addEventListener("focus", refreshSpecCount);
    return () => {
      clearTimeout(t);
      window.removeEventListener("focus", refreshSpecCount);
    };
  }, []);

  // reload settings saat kembali dari /settings
  useEffect(() => {
    if (!hydrated) return;
    const onFocus = () => setSettings(loadSettings());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [hydrated]);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const messages: Msg[] = active?.messages ?? [];
  const provider = settings.provider;
  const model = settings.model;
  const apiKey = settings.keys[provider] ?? "";
  const baseUrl = settings.baseUrls[provider] ?? "";

  const allShots = (active?.messages ?? []).flatMap((m) => m.screenshots ?? []).filter((s) => !!s.image);
  const latestShot = allShots[allShots.length - 1];

  function commitMessages(id: string, next: Msg[], userText?: string) {
    setSessions((prev) => {
      const list = prev.map((s) =>
        s.id === id
          ? {
              ...s,
              messages: next,
              title:
                s.title === "Chat baru" && userText
                  ? titleFrom(userText)
                  : s.title,
              updatedAt: Date.now(),
            }
          : s
      );
      saveSessions(list);
      return list;
    });
  }

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  async function refreshBrowser() {
    try {
      const r = await fetch("/api/browser");
      const d = await r.json();
      setBrowserUrl(d.url ?? null);
    } catch {}
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const sess = sessionRef.current;
    const targetId = activeId;
    if (!targetId) return;
    setError("");
    const next: Msg[] = [...messages, { role: "user", content, time: now() }];
    commitMessages(targetId, next, content);
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setLoading(true);
    setStatusText(IDLE_STATUS);
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    );
    const ctrl = new AbortController();
    streamRef.current = ctrl;
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          provider,
          model,
          apiKey,
          baseUrl,
        }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "Request gagal");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let aborted = false;
      let finalData: {
        text: string;
        toolCalls?: { tool: string; input: unknown }[];
        screenshots?: { url: string; image: string }[];
      } | null = null;
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
              runIdRef.current = (JSON.parse(dm) as { runId?: string }).runId ?? null;
            } catch {}
          } else if (ev === "status") {
            if (sessionRef.current !== sess) return;
            try {
              const d = JSON.parse(dm) as { label?: string };
              if (d.label) {
                setStatusText(d.label);
                requestAnimationFrame(() =>
                  bottomRef.current?.scrollIntoView({ behavior: "smooth" })
                );
              }
            } catch {}
          } else if (ev === "done") {
            finalData = JSON.parse(dm);
          } else if (ev === "aborted") {
            aborted = true;
            break;
          } else if (ev === "shot") {
            // live preview: tampilkan screenshot tiap ada aksi visual
            try {
              const d = JSON.parse(dm) as { image?: string; url?: string };
              if (sessionRef.current === sess && d.image) {
                setManualShot(d.image);
                if (d.url) setBrowserUrl(d.url);
              }
            } catch {}
          } else if (ev === "error") {
            const d = JSON.parse(dm) as { error?: string };
            throw new Error(d.error || "Request gagal");
          }
        }
        if (aborted) {
          try {
            await reader.cancel();
          } catch {}
          break;
        }
      }
      if (aborted) return; // di-interrupt user → berhenti diam-diam
      if (sessionRef.current !== sess) return; // user sudah ganti sesi → abaikan
      if (!finalData) throw new Error("Stream terputus");
      commitMessages(targetId, [
        ...next,
        {
          role: "assistant",
          content: finalData.text || "(tidak ada jawaban)",
          toolCalls: finalData.toolCalls,
          screenshots: finalData.screenshots,
          model,
          time: now(),
        },
      ]);
      if (finalData.screenshots?.length) {
        setBrowserUrl(
          finalData.screenshots[finalData.screenshots.length - 1].url ?? null
        );
      } else {
        refreshBrowser();
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (sessionRef.current !== sess) return;
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      if (streamRef.current === ctrl) streamRef.current = null;
      runIdRef.current = null;
      if (sessionRef.current === sess) setLoading(false);
      refreshSpecCount();
      requestAnimationFrame(() =>
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
      );
    }
  }

  function switchSession(id: string) {
    if (id === activeId) return;
    sessionRef.current += 1; // batalkan hasil request sesi lama
    cancelActiveRun();
    setActiveId(id);
    saveActiveId(id);
    setError("");
    setExpanded({});
    setManualShot(null);
    setLoading(false);
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: "auto" })
    );
  }

  function newChat() {
    sessionRef.current += 1; // batalkan hasil request yang masih jalan
    cancelActiveRun();
    const n = newSession();
    const list = [n, ...sessions];
    setSessions(list);
    saveSessions(list);
    setActiveId(n.id);
    saveActiveId(n.id);
    setError("");
    setInput("");
    setExpanded({});
    setManualShot(null);
    setLoading(false);
    if (taRef.current) taRef.current.style.height = "auto";
  }

  function deleteSession(id: string) {
    sessionRef.current += 1;
    cancelActiveRun();
    const list = sessions.filter((s) => s.id !== id);
    if (!list.length) {
      const n = newSession();
      setSessions([n]);
      saveSessions([n]);
      setActiveId(n.id);
      saveActiveId(n.id);
    } else {
      setSessions(list);
      saveSessions(list);
      if (id === activeId) {
        const top = [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        setActiveId(top.id);
        saveActiveId(top.id);
      }
    }
    setError("");
    setLoading(false);
  }

  async function manualNavigate(url?: string) {
    const target = (url ?? navUrl).trim();
    if (!target || navLoading) return;
    setNavLoading(true);
    try {
      const r = await fetch("/api/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "navigate", url: target }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Navigasi gagal");
      setBrowserUrl(d.url ?? target);
      // otomatis ambil screenshot sesudah navigasi agar preview hidup
      const s = await fetch("/api/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "screenshot" }),
      });
      const sd = await s.json();
      if (s.ok && sd.image) {
        setManualShot(sd.image);
        setBrowserUrl(sd.url ?? d.url ?? target);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Navigasi gagal");
    } finally {
      setNavLoading(false);
    }
  }

  async function manualScreenshot() {
    if (navLoading) return;
    setNavLoading(true);
    try {
      const r = await fetch("/api/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "screenshot" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Screenshot gagal");
      setManualShot(d.image);
      setBrowserUrl(d.url ?? browserUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screenshot gagal");
    } finally {
      setNavLoading(false);
    }
  }

  const PIcon = PROVIDER_META[provider].icon;

  return (
    <div className="mesh-bg flex h-screen text-white">
      {/* ambient orbs — monochrome */}
      <div className="animate-blob pointer-events-none fixed -top-24 left-1/4 h-72 w-72 rounded-full bg-white/8 blur-[100px]" />
      <div className="animate-blob pointer-events-none fixed right-10 bottom-0 h-80 w-80 rounded-full bg-white/5 blur-[110px] [animation-delay:2s]" />

      {/* ── SIDEBAR ── */}
      <aside
        className={`relative z-20 flex shrink-0 flex-col border-r border-white/10 bg-black backdrop-blur-2xl transition-all duration-300 ${
          sidebarOpen ? "w-80" : "w-0 overflow-hidden border-0"
        }`}
      >
        <div className="w-80 p-5 flex flex-col h-full overflow-y-auto">
          {/* logo */}
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white shadow-lg shadow-white/10">
              <Bot size={20} className="text-black" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">Playwright AI</p>
              <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                Browser Agent • v1.0
              </p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          {/* new chat */}
          <button
            onClick={newChat}
            className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-lg shadow-white/10 transition hover:bg-zinc-200 active:scale-[0.98]"
          >
            <Plus size={16} /> Chat baru
          </button>

          {/* daftar sesi */}
          <p className="mt-6 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
            Sesi chat
          </p>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {sessions
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((s) => {
                const isActive = s.id === activeId;
                return (
                  <div
                    key={s.id}
                    onClick={() => switchSession(s.id)}
                    className={`group flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.98] ${
                      isActive
                        ? "border-white/40 bg-white/10"
                        : "border-transparent hover:bg-white/5"
                    }`}
                  >
                    <MessageSquare
                      size={15}
                      className={`shrink-0 ${isActive ? "text-white" : "text-zinc-600"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-[13px] font-medium ${isActive ? "text-white" : "text-zinc-400"}`}
                      >
                        {s.title}
                      </p>
                      <p className="text-[10px] text-zinc-600">
                        {s.messages.length} pesan • {fmtTime(s.updatedAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(s.id);
                      }}
                      title="Hapus sesi"
                      className="shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            {sessions.length === 0 && (
              <p className="px-1 py-4 text-center text-xs text-zinc-600">
                Belum ada sesi
              </p>
            )}
          </div>

          {/* footer sidebar */}
          <div className="mt-auto space-y-2 pt-4">
            <div className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] text-zinc-400">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${browserUrl ? "bg-white animate-pulse" : "bg-zinc-700"}`}
              />
              <span className="truncate">
                {browserUrl ? browserUrl : "Browser idle"}
              </span>
            </div>
            <p className="text-center text-[11px] text-zinc-600">
              ⏎ kirim • ⇧⏎ baris baru
            </p>
          </div>

        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <header className="z-10 flex items-center gap-3 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-xl">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg bg-white/8 p-2 text-white hover:bg-white/15"
            >
              <PanelRight size={16} className="rotate-180" />
            </button>
          )}
          <Link
            href="/settings"
            title="Ubah model di Pengaturan"
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pr-3 pl-1.5 text-xs text-white transition hover:border-white/30 hover:bg-white/10"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white">
              <PIcon size={13} className="text-black" />
            </span>
            <span className="font-semibold">{model}</span>
            <span className="text-zinc-500">• {PROVIDERS[provider].label}</span>
            <SettingsIcon size={13} className="text-zinc-500" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {browserUrl && (
              <a
                href={browserUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10 sm:flex"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                <span className="max-w-56 truncate">{browserUrl}</span>
                <SquareArrowOutUpRight size={12} />
              </a>
            )}
            <Link
              href="/memory"
              title="Memory"
              className="rounded-lg bg-white/8 p-2 text-zinc-400 hover:bg-white/15 hover:text-white"
            >
              <Brain size={16} />
            </Link>
            <Link
              href="/tests"
              title="Test cases"
              className="relative rounded-lg bg-white/8 p-2 text-zinc-400 hover:bg-white/15 hover:text-white"
            >
              <FlaskConical size={16} />
              {specCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-black">
                  {specCount > 99 ? "99+" : specCount}
                </span>
              )}
            </Link>
            <button
              onClick={() => setPreviewOpen(!previewOpen)}
              className={`rounded-lg p-2 ${previewOpen ? "bg-white text-black" : "bg-white/8 text-zinc-400 hover:bg-white/15"}`}
              title="Toggle preview"
            >
              <PanelRight size={16} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* chat column */}
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
              <div className="mx-auto w-full max-w-2xl">
                {messages.length === 0 ? (
                  <div className="animate-fade-up pt-6 text-center">
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white shadow-2xl shadow-white/10">
                      <Sparkles size={28} className="text-black" />
                    </div>
                    <h1 className="text-gradient mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">
                      Suruh AI browsing buat kamu
                    </h1>
                    <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                      Buka situs, ringkas isi, klik tombol, isi form, screenshot —
                      semua otomatis via Playwright.
                    </p>
                    <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s.title}
                          onClick={() => send(s.prompt)}
                          className="group rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10"
                        >
                          <span className="inline-grid h-9 w-9 place-items-center rounded-xl bg-white text-black">
                            <s.icon size={17} />
                          </span>
                          <p className="mt-2.5 text-sm font-semibold text-white">{s.title}</p>
                          <p className="text-xs text-zinc-500">{s.desc}</p>
                        </button>
                      ))}
                    </div>
                    <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px] text-zinc-500">
                      {["Navigate", "Click & Type", "Screenshot", "Extract text"].map((c) => (
                        <span key={c} className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    {messages.map((m, i) =>
                      m.role === "user" ? (
                        <div key={i} className="animate-fade-up flex justify-end">
                          <div className="max-w-[85%]">
                            <div className="rounded-2xl rounded-br-md bg-white px-4 py-3 text-sm font-medium text-black shadow-lg shadow-white/10">
                              {m.content}
                            </div>
                            <p className="mt-1 text-right text-[10px] text-zinc-600">{m.time}</p>
                          </div>
                        </div>
                      ) : (
                        <div key={i} className="animate-fade-up flex gap-3">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white shadow-lg shadow-white/10">
                            <Bot size={16} className="text-black" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="glass rounded-2xl rounded-tl-md p-4">
                              <div className="prose-sm text-sm leading-relaxed text-zinc-100 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-black [&_pre]:p-3 [&_pre]:border [&_pre]:border-white/10">
                                <ReactMarkdown>{m.content}</ReactMarkdown>
                              </div>
                              {!!m.toolCalls?.length && (
                                <div className="mt-3">
                                  <button
                                    onClick={() =>
                                      setExpanded((e) => ({ ...e, [i]: !e[i] }))
                                    }
                                    className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 hover:text-white"
                                  >
                                    <Zap size={12} className="text-white" />
                                    {m.toolCalls.length} langkah browser
                                    <ChevronDown
                                      size={13}
                                      className={`transition ${expanded[i] ? "rotate-180" : ""}`}
                                    />
                                  </button>
                                  {expanded[i] && (
                                    <div className="mt-2 flex flex-col gap-1.5">
                                      {m.toolCalls.map((t, j) => {
                                        const meta = TOOL_META[t.tool] ?? {
                                          icon: Zap,
                                          label: t.tool,
                                        };
                                        return (
                                          <div
                                            key={j}
                                            className="flex items-center gap-2 rounded-lg bg-black px-2.5 py-1.5 text-[11px] border border-white/10"
                                          >
                                            <meta.icon size={13} className="shrink-0 text-white" />
                                            <span className="font-semibold text-white">{meta.label}</span>
                                            <span className="truncate text-zinc-500">
                                              {JSON.stringify(t.input)}
                                            </span>
                                            <span className="ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black">
                                              done
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {!expanded[i] && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {m.toolCalls.map((t, j) => {
                                        const meta = TOOL_META[t.tool] ?? {
                                          icon: Zap,
                                          label: t.tool,
                                        };
                                        return (
                                          <span
                                            key={j}
                                            className="flex items-center gap-1 rounded-full border border-white/10 bg-black px-2 py-1 text-[10px] text-zinc-300"
                                          >
                                            <meta.icon size={11} className="text-white" />
                                            {meta.label}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <p className="mt-1 text-[10px] text-zinc-600">
                              {m.model} • {m.time}
                            </p>
                            {!!m.screenshots?.some((s) => !!s.image) && (
                              <div className="mt-2 grid gap-2">
                                {m.screenshots
                                  .filter((s) => !!s.image)
                                  .map((s, j) => (
                                  <button
                                    key={j}
                                    onClick={() => setLightbox(s.image)}
                                    className="group overflow-hidden rounded-2xl border border-white/10 text-left shadow-xl"
                                  >
                                    <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-2">
                                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
                                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
                                      <span className="ml-2 truncate text-[11px] text-zinc-400">{s.url}</span>
                                      <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-white">perbesar ⤢</span>
                                    </div>
                                    <img src={s.image} alt={s.url} className="w-full grayscale transition duration-300 group-hover:scale-[1.01]" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    )}
                    {loading && (
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
                          {statusText}
                        </div>
                      </div>
                    )}
                    {error && (
                      <div className="flex items-center gap-2 rounded-2xl border border-white/25 bg-white/8 px-4 py-3 text-sm text-white">
                        <CircleAlert size={16} className="shrink-0" /> {error}
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>
                )}
              </div>
            </div>

            {/* composer */}
            <div className="px-4 pb-5 sm:px-8">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="mx-auto w-full max-w-2xl"
              >
                <div className="glass rounded-3xl p-2 shadow-2xl shadow-black focus-within:border-white/40">
                  <textarea
                    ref={taRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      autosize();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    placeholder={`Tanya ${PROVIDERS[provider].label} + suruh browsing…  (mis. buka tokopedia cari iphone)`}
                    className="max-h-40 w-full resize-none bg-transparent px-4 pt-3 text-sm text-white outline-none placeholder:text-zinc-600"
                  />
                  <div className="flex items-center gap-2 px-2 pb-1">
                    <span className="hidden items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-zinc-300 sm:flex">
                      <PIcon size={12} className="text-white" /> {model}
                    </span>
                    {browserUrl && (
                      <span className="hidden items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white md:flex">
                        <Globe size={11} /> live
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-zinc-600">{input.length}/2000</span>
                    {loading ? (
                      <button
                        type="button"
                        onClick={stopRun}
                        title="Hentikan agent"
                        className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-black shadow-lg shadow-white/10 transition hover:bg-zinc-200 active:scale-95"
                      >
                        <Square size={15} fill="currentColor" />
                      </button>
                    ) : (
                      <button
                        disabled={!input.trim()}
                        className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-black shadow-lg shadow-white/10 transition hover:bg-zinc-200 active:scale-95 disabled:opacity-30"
                      >
                        <Send size={17} />
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </main>

          {/* ── PREVIEW PANEL ── */}
          {previewOpen && (
            <aside className="hidden w-105 shrink-0 flex-col border-l border-white/10 bg-black lg:flex xl:w-120">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <Camera size={14} className="text-white" />
                <p className="text-xs font-semibold tracking-wide text-white">LIVE BROWSER</p>
                <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${browserUrl ? "bg-white text-black" : "bg-white/10 text-zinc-500"}`}>
                  {browserUrl ? "● LIVE" : "IDLE"}
                </span>
                <button onClick={() => setPreviewOpen(false)} className="ml-auto rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white">
                  <X size={15} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {/* kontrol manual Playwright — bisa dipakai tanpa AI key */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    manualNavigate();
                  }}
                  className="mb-3 flex gap-2"
                >
                  <input
                    value={navUrl}
                    onChange={(e) => setNavUrl(e.target.value)}
                    placeholder="example.com — Enter untuk buka"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-white/40"
                  />
                  <button
                    type="submit"
                    disabled={navLoading || !navUrl.trim()}
                    className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-30"
                  >
                    {navLoading ? <Loader2 size={14} className="animate-spin" /> : "Buka"}
                  </button>
                  <button
                    type="button"
                    onClick={manualScreenshot}
                    disabled={navLoading}
                    title="Screenshot halaman aktif"
                    className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white hover:bg-white/10 disabled:opacity-30"
                  >
                    <Camera size={14} />
                  </button>
                </form>
                {(latestShot || manualShot) ? (
                  <div className="animate-fade-up overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
                    <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-2.5 border-b border-white/10">
                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
                      <span className="ml-2 truncate text-[11px] text-zinc-400">{(latestShot?.url ?? browserUrl) || "browser"}</span>
                    </div>
                    <button onClick={() => setLightbox(latestShot?.image ?? manualShot ?? "")} className="block w-full">
                      <img src={latestShot?.image ?? manualShot ?? ""} alt="live" className="w-full grayscale" />
                    </button>
                  </div>
                ) : (
                  <div className="grid place-items-center rounded-2xl border border-dashed border-white/15 py-16 text-center">
                    <Globe size={28} className="text-zinc-700" />
                    <p className="mt-3 text-sm font-medium text-zinc-400">Belum ada aktivitas browser</p>
                    <p className="mt-1 max-w-55 text-xs text-zinc-600">
                      Kirim perintah seperti “buka …” dan screenshot akan muncul di sini
                    </p>
                  </div>
                )}
                {allShots.length > 1 && (
                  <>
                    <p className="mt-4 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
                      Riwayat ({allShots.length})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {allShots.slice(-6).map((s, k) => (
                        <button
                          key={k}
                          onClick={() => setLightbox(s.image)}
                          className="overflow-hidden rounded-xl border border-white/10 opacity-80 transition hover:opacity-100"
                        >
                          <img src={s.image} alt={s.url} className="aspect-video w-full object-cover grayscale" />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <img
            src={lightbox}
            alt="full"
            className="animate-fade-up max-h-[90vh] max-w-6xl rounded-2xl border border-white/15 shadow-2xl grayscale"
          />
          <button className="absolute top-4 right-4 rounded-full bg-white p-2.5 text-black hover:bg-zinc-200">
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
