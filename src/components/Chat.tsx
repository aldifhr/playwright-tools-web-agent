/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Brain,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  FileText,
  Globe,
  Loader2,
  Copy,
  Pencil,
  MessageSquare,
  MousePointerClick,
  Newspaper,
  PanelRight,
  Plus,
  RotateCcw,
  Send,
  Settings as SettingsIcon,
  Square,
  Sparkles,
  Trash2,
  TrendingUp,
  Bitcoin,
  X,
  Zap,
} from "lucide-react";
import { PROVIDERS, ProviderId } from "@/lib/providers";
import { IDLE_STATUS } from "@/lib/agent-status";
import {
  fmtTime,
  loadActiveId,
  loadSessions,
  loadSettings,
  newSession,
  saveSettings,
  saveActiveId,
  saveSessions,
  titleFrom,
} from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { useAppStore } from "@/lib/app-store";

type Msg = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { tool: string; input: unknown }[];
  screenshots?: { url: string; image: string }[];
  artifacts?: { kind: string; file: string; meta: Record<string, unknown> }[];
  thinking?: string[];
  model?: string;
  time?: string;
};

const SUGGESTIONS = [
  {
    icon: TrendingUp,
    title: "Exploratory testing",
    desc: "Explore saucedemo and list testable areas",
    prompt:
      "Open https://www.saucedemo.com, log in with standard_user / secret_sauce, then explore and list all testable areas and features",
  },
  {
    icon: Camera,
    title: "Bug repro + evidence",
    desc: "Repeat the flow and capture screenshots at each stage",
    prompt:
      "Open https://www.saucedemo.com and capture the login page as initial evidence",
  },
  {
    icon: Bitcoin,
    title: "Quick smoke test",
    desc: "Log in, add a product, and verify the cart badge",
    prompt:
      "Run a saucedemo smoke test: log in with standard_user / secret_sauce, add one product to the cart, and verify the cart badge is 1",
  },
  {
    icon: Newspaper,
    title: "Find locators",
    desc: "Robust selectors for automation",
    prompt:
      "Open https://www.saucedemo.com and provide robust locators (data-test / getByRole) for the login form",
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
  const settings = useAppStore((state) => state.settings);
  const sessions = useAppStore((state) => state.sessions);
  const activeId = useAppStore((state) => state.activeId);
  const setSettings = useAppStore((state) => state.setSettings);
  const setSessions = useAppStore((state) => state.setSessions);
  const setActiveId = useAppStore((state) => state.setActiveId);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lightbox, setLightbox] = useState<{
    list: { image: string; url: string }[];
    i: number;
  } | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusText, setStatusText] = useState(IDLE_STATUS);
  const [thinkingText, setThinkingText] = useState("");
  const [thinkingHistory, setThinkingHistory] = useState<string[]>([]);
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const [progressStage, setProgressStage] = useState(0);
  const [agentMode, setAgentMode] = useState<"main" | "sub">("main");
  const [stopping, setStopping] = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; text: string }[]>([]);
  const [showJump, setShowJump] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef(0);
  const streamRef = useRef<AbortController | null>(null);
  const thinkingHistoryRef = useRef<string[]>([]);
  const runIdRef = useRef<string | null>(null);
  const { error: showError } = useToast();

  function abortStream() {
    try {
      streamRef.current?.abort();
    } catch {}
    streamRef.current = null;
  }

  async function stopRun() {
    setStopping(true);
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

  const cancelActiveRun = useCallback(() => {
    const id = runIdRef.current;
    runIdRef.current = null;
    try {
      streamRef.current?.abort();
    } catch {}
    streamRef.current = null;
    if (id) {
      fetch("/api/chat/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: id }),
      }).catch(() => {});
    }
  }, []);

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
  }, [setActiveId, setSessions, setSettings]);

  // reload settings saat kembali dari /settings
  useEffect(() => {
    if (!hydrated) return;
    const onFocus = () => setSettings(loadSettings());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [hydrated, setSettings]);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const messages: Msg[] = active?.messages ?? [];
  const provider = settings.provider;
  const model = settings.model;
  const apiKey = settings.keys[provider] ?? "";
  const baseUrl = settings.baseUrls[provider] ?? "";

  useEffect(() => {
    if (!hydrated || !activeId) return;
    const timer = window.setTimeout(() => {
      setInput(localStorage.getItem(`chat-draft:${activeId}`) ?? "");
      setAttachments([]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeId, hydrated]);

  useEffect(() => {
    if (hydrated && activeId) {
      if (input) localStorage.setItem(`chat-draft:${activeId}`, input);
      else localStorage.removeItem(`chat-draft:${activeId}`);
    }
  }, [activeId, hydrated, input]);

  const commitMessages = useCallback((id: string, next: Msg[], userText?: string) => {
    setSessions((prev) => {
      const list = prev.map((s) =>
        s.id === id
          ? {
              ...s,
              messages: next,
              title:
                s.title === "New chat" && userText
                  ? titleFrom(userText)
                  : s.title,
              updatedAt: Date.now(),
            }
          : s
      );
      saveSessions(list);
      return list;
    });
  }, [setSessions]);

  useEffect(() => {
    const cancel = cancelActiveRun;
    const handleShortcut = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "l" && activeId) {
        e.preventDefault();
        commitMessages(activeId, []);
        setInput("");
        return;
      }
      if (e.key === "Escape") {
        if (loading) cancel();
        setSearchOpen(false);
        setLightbox(null);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activeId, loading, cancelActiveRun, commitMessages]);

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  function scrollToLatest(behavior: ScrollBehavior = "smooth") {
    autoScrollRef.current = true;
    setShowJump(false);
    bottomRef.current?.scrollIntoView({ behavior });
  }

  function handleFiles(files: FileList | File[]) {
    const readable = Array.from(files).filter((file) =>
      /text|json|javascript|typescript|xml|yaml|csv/.test(file.type) || /\.(txt|md|json|js|ts|tsx|jsx|xml|yaml|yml|csv|log)$/i.test(file.name)
    );
    readable.slice(0, 4).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setAttachments((current) => [...current.filter((x) => x.name !== file.name), { name: file.name, text: String(reader.result ?? "") }]);
      reader.readAsText(file);
    });
  }

  function copyMessage(content: string) {
    navigator.clipboard?.writeText(content).catch(() => {});
  }

  async function send(text?: string) {
    const draft = (text ?? input).trim();
    const fileContext = attachments.length
      ? "\n\nAttached files:\n" + attachments.map((file) => `--- ${file.name} ---\n${file.text}`).join("\n")
      : "";
    const content = (draft + fileContext).trim();
    if (!content || loading) return;
    const sess = sessionRef.current;
    const targetId = activeId;
    if (!targetId) return;
    setError("");
    setLastFailedPrompt(null);
    const next: Msg[] = [...messages, { role: "user", content, time: now() }];
    commitMessages(targetId, next, content);
    setInput("");
    setAttachments([]);
    if (taRef.current) taRef.current.style.height = "auto";
    setLoading(true);
    setStopping(false);
    setAgentMode("main");
    setStatusText(IDLE_STATUS);
    setThinkingText("");
    setThinkingHistory([]);
    thinkingHistoryRef.current = [];
    setThinkingOpen(true);
    setProgressStage(1);
    requestAnimationFrame(() => {
      if (autoScrollRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
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
        throw new Error(d?.error || "Request failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let aborted = false;
      let finalData: {
        text: string;
        toolCalls?: { tool: string; input: unknown }[];
        screenshots?: { url: string; image: string }[];
        artifacts?: { kind: string; file: string; meta: Record<string, unknown> }[];
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
              const d = JSON.parse(dm) as { label?: string; thinking?: string; agent?: "main" | "sub" };
              if (d.label) {
                setStatusText(d.label);
                setAgentMode(d.agent ?? (/sub-agent|delegate|delegat/i.test(d.label) ? "sub" : "main"));
                if (d.thinking) {
                  setThinkingText(d.thinking);
                  setThinkingHistory((current) => {
                    const next = current.at(-1) === d.thinking ? current : [...current, d.thinking!].slice(-8);
                    thinkingHistoryRef.current = next;
                    return next;
                  });
                }
                const label = d.label.toLowerCase();
                const stage = /test|saving|save|run/.test(label)
                  ? 3
                  : /opening|scanning|reading|clicking|typing|screenshot|back|browser/.test(label)
                    ? 2
                    : /report|finish|complete/.test(label)
                      ? 4
                      : 0;
                if (stage) setProgressStage((current) => Math.max(current, stage));
                requestAnimationFrame(() => {
                  if (autoScrollRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                });
              }
            } catch {}
          } else if (ev === "done") {
            const completed = JSON.parse(dm) as {
              text: string;
              toolCalls?: { tool: string; input: unknown }[];
              screenshots?: { url: string; image: string }[];
              artifacts?: { kind: string; file: string; meta: Record<string, unknown> }[];
            };
            finalData = completed;
            if (completed.toolCalls?.length || completed.artifacts?.length) {
              setStatusText("Reporting");
              const reportStep = "Browser actions are complete; compiling the report and checking saved artifacts.";
              setThinkingText(reportStep);
              thinkingHistoryRef.current = [...thinkingHistoryRef.current, reportStep].slice(-8);
              setThinkingHistory(thinkingHistoryRef.current);
            }
          } else if (ev === "aborted") {
            aborted = true;
            break;
          } else if (ev === "error") {
            const d = JSON.parse(dm) as { error?: string };
            throw new Error(d.error || "Request failed");
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
      setProgressStage(4);
      commitMessages(targetId, [
        ...next,
        {
          role: "assistant",
          content: finalData.text || "(no response)",
          toolCalls: finalData.toolCalls,
           screenshots: finalData.screenshots,
           artifacts: finalData.artifacts,
           thinking: thinkingHistoryRef.current,
          model,
          time: now(),
        },
      ]);
      setLastFailedPrompt(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (sessionRef.current !== sess) return;
      const msg = e instanceof Error ? e.message : "Failed";
      setError(msg);
      setLastFailedPrompt(content);
      showError("Chat Error", msg);
    } finally {
      if (streamRef.current === ctrl) streamRef.current = null;
      runIdRef.current = null;
      if (sessionRef.current === sess) setLoading(false);
      if (sessionRef.current === sess) setStopping(false);
      requestAnimationFrame(() => {
        if (autoScrollRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
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
    setLoading(false);
    setStopping(false);
    requestAnimationFrame(() => scrollToLatest("auto"));
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
    setStopping(false);
  }

  const PIcon = PROVIDER_META[provider].icon;
  const progressLabels = ["Planning", "Browsing", "Testing", "Reporting"];

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
              <p className="text-sm font-bold tracking-tight text-white">FarayAgent</p>
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
             <Plus size={16} /> New chat
          </button>

          {/* daftar sesi */}
          <p className="mt-6 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
             Chat sessions
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
                        {s.messages.length} messages • {fmtTime(s.updatedAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(s.id);
                      }}
                      title="Delete session"
                      className="shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            {sessions.length === 0 && (
              <p className="px-1 py-4 text-center text-xs text-zinc-600">
                 No sessions yet
              </p>
            )}
          </div>

          {/* footer sidebar */}
        

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
            title="Change model in Settings"
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
            <span className="hidden items-center gap-1.5 text-[10px] text-zinc-500 sm:flex" title={apiKey && baseUrl ? "Provider is ready" : "Complete the API key and base URL in Settings"}>
              <span className={`h-1.5 w-1.5 rounded-full ${apiKey && baseUrl ? "bg-emerald-400" : "bg-amber-400"}`} />
              {apiKey && baseUrl ? "Ready" : "Setup required"}
            </span>
            <Link
              href="/memory"
              title="Memory"
              className="rounded-lg bg-white/8 p-2 text-zinc-400 hover:bg-white/15 hover:text-white"
            >
              <Brain size={16} />
            </Link>
            <Link
              href="/skills"
              title="Agent Skills"
              className="rounded-lg bg-white/8 p-2 text-zinc-400 hover:bg-white/15 hover:text-white"
            >
              <Sparkles size={16} />
            </Link>
            <Link
              href="/logs"
              title="Tool logs"
              className="rounded-lg bg-white/8 p-2 text-zinc-400 hover:bg-white/15 hover:text-white"
            >
              <ClipboardList size={16} />
            </Link>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* chat column */}
          <main className="flex min-w-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              onScroll={(event) => {
                const el = event.currentTarget;
                const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
                autoScrollRef.current = nearBottom;
                setShowJump(!nearBottom && loading);
              }}
              className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-8"
            >
              <div className="mx-auto w-full max-w-2xl">
                {messages.length === 0 ? (
                  <div className="animate-fade-up pt-6 text-center">
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white shadow-2xl shadow-white/10">
                      <Sparkles size={28} className="text-black" />
                    </div>
                    <h1 className="text-gradient mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">
                      Your QA Copilot
                    </h1>
                    <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                       Exploratory testing, smoke tests, bug reproduction with screenshot evidence,
                       and locator discovery — all automated with Playwright.
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
                      {["Navigate", "Snapshot", "Click & Type", "Screenshot", "Back", "Test plan + Run", "Remember"].map((c) => (
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
                         <div key={i} className="group animate-fade-up flex justify-end">
                          <div className="max-w-[85%]">
                             <div className="rounded-2xl rounded-br-md bg-white px-4 py-3 text-sm font-medium text-black shadow-lg shadow-white/10">
                               {m.content}
                             </div>
                             <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-zinc-600">
                               <button type="button" onClick={() => { setInput(m.content); requestAnimationFrame(autosize); }} className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 hover:text-white"><Pencil size={10} /> Edit</button>
                               <span>{m.time}</span>
                             </div>
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
                                 <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                <button type="button" onClick={() => copyMessage(m.content)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/10 hover:text-white"><Copy size={11} /> Copy</button>
                                {messages[i - 1]?.role === "user" && <button type="button" onClick={() => send(messages[i - 1].content)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/10 hover:text-white"><RotateCcw size={11} /> Regenerate</button>}
                              </div>
                              {!!m.artifacts?.length && <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Workflow</p>
                                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                  {(["Exploration", "Test Plan Document", "Test Cases", "Automation"] as const).map((stage) => {
                                    const done = stage === "Exploration" || m.artifacts?.some((artifact) => artifact.kind === stage);
                                    return <span key={stage} className={`rounded-lg border px-2 py-1.5 text-[10px] ${done ? "border-white/25 bg-white/10 text-white" : "border-white/8 text-zinc-600"}`}>{done ? "✓ " : "○ "}{stage}</span>;
                                  })}
                                </div>
                                <div className="mt-3 flex flex-col gap-2">
                                  {m.artifacts.map((artifact) => {
                                    const quality = artifact.meta.qualityGate as { complete?: boolean; tbdCount?: number; missingFields?: string[] } | undefined;
                                    const areas = artifact.meta.areas as Record<string, number> | undefined;
                                    return <div key={artifact.file} className="rounded-lg border border-white/8 bg-white/5 px-3 py-2">
                                      <div className="flex items-center gap-2"><FileText size={12} className="text-white" /><span className="text-xs font-semibold text-white">{artifact.file}</span><span className="ml-auto text-[10px] text-zinc-500">{artifact.kind}</span></div>
                                      <p className="mt-1 text-[10px] text-zinc-400">{artifact.kind === "Test Plan Document" ? `${String(artifact.meta.sections ?? 10)} sections • ${String(artifact.meta.projectName ?? "QA project")}` : artifact.kind === "Test Cases" ? `${String(artifact.meta.count ?? 0)} cases • ${areas ? Object.entries(areas).map(([area, count]) => `${area} (${count})`).join(" · ") : "area summary unavailable"}` : "Automation artifact saved"}</p>
                                      {quality && <p className={`mt-1 text-[10px] ${quality.complete ? "text-emerald-300" : "text-amber-300"}`}>{quality.complete ? "Quality gate passed: file written, no TBD" : `Quality gate warning: ${quality.tbdCount ?? 0} TBD, ${quality.missingFields?.length ?? 0} field(s) missing`}</p>}
                                    </div>;
                                  })}
                                </div>
                              </div>}
                              {!!m.thinking?.length && <details className="mt-3 border-t border-white/10 pt-2" open={false}>
                                <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-white">Agent activity ({m.thinking.length})</summary>
                                <div className="mt-2 flex flex-col gap-1.5 border-l border-white/15 pl-3">
                                  {m.thinking.map((item, index) => <p key={`${item}-${index}`} className="text-xs leading-relaxed text-zinc-400">{item}</p>)}
                                </div>
                              </details>}
                              {!!m.toolCalls?.length && (
                                <div className="mt-3">
                                  <div className="mb-2 flex flex-wrap gap-1.5">
                                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-300">{m.toolCalls.length} browser steps</span>
                                    {!!m.screenshots?.filter((shot) => !!shot.image).length && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-300">{m.screenshots.filter((shot) => !!shot.image).length} screenshots</span>}
                                    {m.toolCalls.some((tool) => /test|run/i.test(tool.tool)) && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-300">Test run</span>}
                                  </div>
                                  <button
                                    onClick={() =>
                                      setExpanded((e) => ({ ...e, [i]: !e[i] }))
                                    }
                                    className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 hover:text-white"
                                  >
                                    <Zap size={12} className="text-white" />
                                    {m.toolCalls.length} browser steps
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
                                             <span className="w-7 text-[10px] text-zinc-600">{String(j + 1).padStart(2, "0")}</span>
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
                            {(() => {
                              const shots = (m.screenshots ?? []).filter((s) => !!s.image);
                              if (!shots.length) return null;
                              return (
                              <div className="mt-2 grid gap-2">
                                {shots.map((s, j) => (
                                  <button
                                    key={j}
                                    onClick={() => setLightbox({ list: shots, i: j })}
                                    className="group overflow-hidden rounded-2xl border border-white/10 text-left shadow-xl"
                                  >
                                    <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-2">
                                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
                                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
                                      <span className="ml-2 truncate text-[11px] text-zinc-400">{s.url}</span>
                                       <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-white">open ⤢</span>
                                    </div>
                                    <img src={s.image} alt={s.url} className="w-full grayscale transition duration-300 group-hover:scale-[1.01]" />
                                  </button>
                                ))}
                              </div>
                              );
                            })()}
                          </div>
                        </div>
                      )
                    )}
                    {loading && (
                      <div className="flex gap-3">
                        <div className="grid h-8 w-8 place-items-center rounded-xl bg-white">
                          <Loader2 size={15} className="animate-spin text-black" />
                        </div>
                        <div className="glass min-w-0 flex-1 rounded-2xl rounded-tl-md px-4 py-3 text-sm text-zinc-300">
                          <div className="flex items-center gap-2">
                            <span className="flex gap-1">
                              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white" />
                              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white" />
                              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white" />
                            </span>
                           <span className="truncate">{stopping ? "Stopping agent…" : `${agentMode === "sub" ? "QA sub-agent" : "Main agent"} • ${statusText}`}</span>
                          </div>
                           <div className="mt-3 grid grid-cols-4 gap-1.5">
                            {progressLabels.map((label, index) => (
                              <div key={label} className="min-w-0">
                                <div className={`h-1 rounded-full ${index < progressStage ? "bg-white" : "bg-white/15"}`} />
                                <p className={`mt-1 truncate text-[9px] ${index < progressStage ? "text-zinc-200" : "text-zinc-600"}`}>{label}</p>
                              </div>
                             ))}
                           </div>
                           {!!thinkingText && <div className="mt-3 border-t border-white/10 pt-2">
                             <button type="button" onClick={() => setThinkingOpen((open) => !open)} className="flex w-full items-center gap-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-white">
                               <Brain size={12} /> Agent thinking <ChevronDown size={12} className={`ml-auto transition ${thinkingOpen ? "rotate-180" : ""}`} />
                             </button>
                              {thinkingOpen && <div className="mt-1.5 flex flex-col gap-1.5">{thinkingHistory.length ? thinkingHistory.map((item, index) => <p key={`${item}-${index}`} className="text-xs leading-relaxed text-zinc-400">{item}</p>) : <p className="text-xs text-zinc-500">Waiting for agent activity…</p>}</div>}
                           </div>}
                         </div>
                      </div>
                    )}
                     {error && (
                      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/25 bg-white/8 px-4 py-3 text-sm text-white">
                        <CircleAlert size={16} className="shrink-0" />
                        <span className="min-w-0 flex-1">{error}</span>
                        {lastFailedPrompt && !loading && (
                          <button type="button" onClick={() => send(lastFailedPrompt)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-black hover:bg-zinc-200">
                            Retry
                          </button>
                     )}
                     {showJump && <button type="button" onClick={() => scrollToLatest()} className="sticky bottom-3 left-1/2 z-10 mx-auto flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-zinc-900 px-3 py-1.5 text-[11px] text-white shadow-xl">Jump to latest <ChevronDown size={12} /></button>}
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
                <div
                  className="glass rounded-3xl p-2 shadow-2xl shadow-black focus-within:border-white/40"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); handleFiles(event.dataTransfer.files); }}
                >
                  {!!attachments.length && <div className="flex flex-wrap gap-1.5 px-3 pt-2">
                    {attachments.map((file) => <span key={file.name} className="flex items-center gap-1 rounded-full border border-white/10 bg-white/8 px-2 py-1 text-[10px] text-zinc-300"><FileText size={11} /> {file.name}<button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.name !== file.name))} className="ml-1 text-zinc-500 hover:text-white"><X size={11} /></button></span>)}
                  </div>}
                  <textarea
                    ref={taRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      autosize();
                    }}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        send();
                        return;
                      }
                      if (e.key === "ArrowUp" && !input && messages.length) {
                        const previous = [...messages].reverse().find((m) => m.role === "user");
                        if (previous) {
                          e.preventDefault();
                          setInput(previous.content);
                          requestAnimationFrame(autosize);
                        }
                        return;
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    placeholder={`Ask Anything about QA`}
                    className="max-h-40 w-full resize-none bg-transparent px-4 pt-3 text-sm text-white outline-none placeholder:text-zinc-600"
                  />
                  <div className="flex items-center gap-2 px-2 pb-1">
                     <label className="grid h-8 w-8 cursor-pointer place-items-center rounded-xl text-zinc-500 hover:bg-white/10 hover:text-white" title="Attach text file">
                       <FileText size={14} />
                       <input type="file" multiple accept=".txt,.md,.json,.js,.ts,.tsx,.jsx,.xml,.yaml,.yml,.csv,.log" className="hidden" onChange={(event) => { if (event.target.files) handleFiles(event.target.files); event.currentTarget.value = ""; }} />
                     </label>
                     <div className="relative hidden sm:block">
                      <button
                        type="button"
                        onClick={() => setModelMenuOpen((open) => !open)}
                        className="flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/15 hover:text-white"
                        aria-expanded={modelMenuOpen}
                         title="Change model"
                      >
                        <PIcon size={12} className="text-white" /> {model}
                      </button>
                      {modelMenuOpen && (
                        <div className="absolute bottom-9 left-0 z-30 min-w-48 rounded-xl border border-white/15 bg-zinc-950 p-1.5 shadow-2xl">
                           <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-zinc-600">Choose a model</p>
                          {[...new Set([...PROVIDERS[provider].models, model])].map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                const next = { ...settings, model: option };
                                setSettings(next);
                                saveSettings(next);
                                setModelMenuOpen(false);
                              }}
                              className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/10 ${option === model ? "text-white" : "text-zinc-400"}`}
                            >
                              {option}
                               {option === model && <span className="float-right text-zinc-500">active</span>}
                            </button>
                          ))}
                           <Link href="/settings" className="mt-1 block border-t border-white/10 px-2 pt-2 text-[11px] text-zinc-500 hover:text-white">Manage provider & custom model →</Link>
                        </div>
                      )}
                    </div>
                    <span className="ml-auto text-[10px] text-zinc-600">{input.length}/2000</span>
                    {loading ? (
                      <button
                        type="button"
                         onClick={stopRun}
                         disabled={stopping}
                         title="Stop agent"
                        className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-black shadow-lg shadow-white/10 transition hover:bg-zinc-200 active:scale-95"
                      >
                         {stopping ? <Loader2 size={15} className="animate-spin" /> : <Square size={15} fill="currentColor" />}
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

          {searchOpen && (
            <div className="fixed inset-0 z-50 grid place-items-start bg-black/70 p-4 pt-[12vh] backdrop-blur-sm">
              <div className="glass w-full max-w-xl rounded-2xl p-4 shadow-2xl">
                <div className="flex items-center gap-3">
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                     placeholder="Search chat history..."
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                  />
                  <button onClick={() => setSearchOpen(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
                </div>
                <div className="mt-3 max-h-72 overflow-y-auto">
                  {sessions.flatMap((s) => s.messages.map((m) => ({ session: s, message: m })))
                    .filter(({ message }) => !searchQuery.trim() || message.content.toLowerCase().includes(searchQuery.toLowerCase()))
                    .slice(-30).reverse().map(({ session, message }, i) => (
                      <button key={`${session.id}-${i}`} onClick={() => { switchSession(session.id); setSearchOpen(false); }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/10">
                        <span className="text-[10px] text-zinc-500">{session.title}</span>
                        <span className="mt-0.5 block truncate text-sm text-zinc-200">{message.content}</span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* lightbox + navigasi step */}
      {lightbox && lightbox.list.length > 0 && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-black">
                {lightbox.i + 1} / {lightbox.list.length}
              </span>
              <p className="truncate text-xs text-zinc-400">{lightbox.list[lightbox.i]?.url}</p>
              <div className="ml-auto flex gap-1.5">
                <button
                  disabled={lightbox.i === 0}
                  onClick={() => setLightbox({ ...lightbox, i: lightbox.i - 1 })}
                  className="rounded-full bg-white/10 p-2 hover:bg-white/20 disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={lightbox.i >= lightbox.list.length - 1}
                  onClick={() => setLightbox({ ...lightbox, i: lightbox.i + 1 })}
                  className="rounded-full bg-white/10 p-2 hover:bg-white/20 disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
                <button onClick={() => setLightbox(null)} className="rounded-full bg-white p-2 text-black hover:bg-zinc-200">
                  <X size={16} />
                </button>
              </div>
            </div>
            <img
              src={lightbox.list[lightbox.i]?.image}
              alt="full"
              className="animate-fade-up max-h-[80vh] w-full rounded-2xl border border-white/15 object-contain shadow-2xl grayscale"
            />
          </div>
        </div>
      )}
    </div>
  );
}
