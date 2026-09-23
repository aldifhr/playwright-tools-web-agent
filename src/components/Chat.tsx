/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Brain,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  FileText,
  FileCode2,
  FileSpreadsheet,
  FlaskConical,
  Loader2,
  ScrollText,
  Copy,
  Pencil,
  PanelRight,
  Printer,
  RotateCcw,
  Settings as SettingsIcon,
  Sparkles,
  Zap,
} from "lucide-react";
import { PROVIDERS } from "@/lib/providers";
import { IDLE_STATUS } from "@/lib/agent-status";
import {
  loadSessions,
  loadSettings,
  newSession,
  saveActiveId,
  saveSettings,
  saveSessions,
  titleFrom,
} from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { useAppStore } from "@/lib/app-store";
import { abortRun, trackRun, untrackRun } from "@/lib/chat-runs";
import { now, type Approval, type Attachment, type LightboxState, type Msg } from "@/components/chat/types";
import { PROGRESS_LABELS, PROVIDER_META, SUGGESTIONS, TOOL_META } from "@/components/chat/meta";
import { COMMANDS, HELP_TEXT, parseCommand } from "@/components/chat/commands";
import { downloadXlsx, messageToHtml, parseMarkdownTables, printMessage } from "@/components/chat/export";
import { suggestTraceFileName, toolCallsToSpec } from "@/lib/trace-to-spec";
import Sidebar from "@/components/chat/Sidebar";
import Composer from "@/components/chat/Composer";
import SearchModal from "@/components/chat/SearchModal";
import Lightbox from "@/components/chat/Lightbox";
import ApprovalCard from "@/components/chat/ApprovalCard";

export default function Chat({ sessionId: lockedSessionId }: { sessionId?: string }) {
  const router = useRouter();
  const settings = useAppStore((state) => state.settings);
  const sessions = useAppStore((state) => state.sessions);
  const activeId = useAppStore((state) => state.activeId);
  const setSettings = useAppStore((state) => state.setSettings);
  const setSessions = useAppStore((state) => state.setSessions);
  const setActiveId = useAppStore((state) => state.setActiveId);
  const setRunning = useAppStore((state) => state.setRunning);
  const setPendingApproval = useAppStore((state) => state.setPendingApproval);
  const runningIds = useAppStore((state) => state.runningIds);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lightbox, setLightbox] = useState<LightboxState>(null);
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [remembering, setRemembering] = useState<number[]>([]);
  const [approving, setApproving] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef(0);
  const streamRef = useRef<AbortController | null>(null);
  const thinkingHistoryRef = useRef<string[]>([]);
  const runIdRef = useRef<string | null>(null);
  const { error: showError, success: showSuccess } = useToast();

  async function stopRun(sessionId?: string) {
    const sid = sessionId ?? activeId ?? undefined;
    if (!sid) return;
    const mine = sid === activeId;
    if (mine) {
      setStopping(true);
      runIdRef.current = null;
      try {
        streamRef.current?.abort();
      } catch {}
      streamRef.current = null;
    }
    // Runs live beyond remounts: abort the tracked controller, then tell
    // the server explicitly (abort fetch also triggers cancel via req.signal).
    abortRun(sid);
    const runId = useAppStore.getState().runningIds[sid];
    setRunning(sid, null);
    setPendingApproval(sid, null);
    if (runId) {
      try {
        await fetch("/api/chat/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId }),
        });
      } catch {}
    }
  }

  // Leaving a session never kills its run — but a pending approval would hang
  // it forever, so deny explicitly and let the agent continue another way.
  function denyLeavingApproval(leavingId: string | null) {
    if (!leavingId) return;
    const pending = useAppStore.getState().pendingApprovals[leavingId];
    if (!pending) return;
    setPendingApproval(leavingId, null);
    fetch("/api/chat/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: pending.runId, id: pending.id, approved: false }),
    }).catch(() => {});
  }
  async function respondApproval(approved: boolean, always = false) {
    const pending = approval;
    if (!pending || approving) return;
    setApproving(true);
    try {
      await fetch("/api/chat/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: pending.runId, id: pending.id, approved, always }),
      });
    } catch {}
    setApproval(null);
    setApproving(false);
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
      const list = loadSessions();
      // bersihkan screenshot yatim (image kosong) sisa strip kuota lama
      const cleaned = list.map((sess) => ({
        ...sess,
        messages: sess.messages.map((m) =>
          m.screenshots?.some((x) => !x.image)
            ? { ...m, screenshots: (m.screenshots ?? []).filter((x) => !!x.image) }
            : m
        ),
      }));
      const visible = cleaned.slice().sort((a, b) => b.updatedAt - a.updatedAt);
      // /chat (bare) always lands on the welcome screen — no auto-pick.
      // /chat/[chatId] opens that chat when it exists, else welcome.
      let aid: string | null = null;
      if (lockedSessionId && visible.some((x) => x.id === lockedSessionId)) {
        aid = lockedSessionId;
      }
      setSettings(s);
      setSessions(cleaned);
      setActiveId(aid);
      if (aid) saveActiveId(aid);
      saveSessions(cleaned);
      setHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, [lockedSessionId, setActiveId, setSessions, setSettings]);

  // reload settings saat kembali dari /settings
  useEffect(() => {
    if (!hydrated) return;
    const onFocus = () => setSettings(loadSettings());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [hydrated, setSettings]);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const messages: Msg[] = active?.messages ?? [];
  const visibleSessions = sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  const provider = settings.provider;
  const model = settings.model;
  const apiKey = settings.keys[provider] ?? "";
  const baseUrl = settings.baseUrls[provider] ?? "";

  useEffect(() => {
    if (!hydrated || !activeId) return;
    const timer = window.setTimeout(() => {
      // prefill from other pages (e.g. "Generate via chat" on /tests)
      let prefill = "";
      try {
        prefill = localStorage.getItem("chat-prefill") ?? "";
        if (prefill) localStorage.removeItem("chat-prefill");
      } catch {}
      setInput(prefill || (localStorage.getItem(`chat-draft:${activeId}`) ?? ""));
      setAttachments([]);
      if (prefill) requestAnimationFrame(autosize);
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
      /text|json|javascript|typescript|xml|yaml|csv|spreadsheet|excel|pdf|msword|officedocument/.test(file.type) || /\.(txt|md|json|js|ts|tsx|jsx|xml|yaml|yml|csv|log|xls|xlsx|pdf|docx)$/i.test(file.name)
    );
    readable.slice(0, 4).forEach((file) => {
      if (/\.(xls|xlsx)$/i.test(file.name)) {
        void handleExcel(file);
        return;
      }
      if (/\.pdf$/i.test(file.name)) {
        void handlePdf(file);
        return;
      }
      if (/\.docx$/i.test(file.name)) {
        void handleDocx(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setAttachments((current) => [...current.filter((x) => x.name !== file.name), { name: file.name, text: String(reader.result ?? "") }]);
      reader.readAsText(file);
    });
  }

  // PDF is binary: extract text per page (lazy-load unpdf only when needed).
  async function handlePdf(file: File) {
    try {
      const { extractText } = await import("unpdf");
      const buffer = await file.arrayBuffer();
      const { text, totalPages } = await extractText(buffer);
      const joined = (Array.isArray(text) ? text.join("\n") : String(text ?? "")).slice(0, 30_000);
      const label = `(PDF, ${totalPages ?? "?"} pages — first 30k chars)`;
      setAttachments((current) => [...current.filter((x) => x.name !== file.name), { name: file.name, text: joined ? `${label}\n${joined}` : "(no readable text in PDF)" }]);
    } catch {
      setAttachments((current) => [...current.filter((x) => x.name !== file.name), { name: file.name, text: "(failed to parse PDF file)" }]);
    }
  }

  // DOCX is binary: extract raw text (lazy-load mammoth only when needed).
  async function handleDocx(file: File) {
    try {
      const mammoth = (await import("mammoth")).default;
      const buffer = await file.arrayBuffer();
      const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
      const text = String(value ?? "").slice(0, 30_000);
      setAttachments((current) => [...current.filter((x) => x.name !== file.name), { name: file.name, text: text || "(no readable text in document)" }]);
    } catch {
      setAttachments((current) => [...current.filter((x) => x.name !== file.name), { name: file.name, text: "(failed to parse Word document)" }]);
    }
  }
  async function handleExcel(file: File) {
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", sheetRows: 200 });
      const parts: string[] = [];
      for (const sheetName of workbook.SheetNames.slice(0, 5)) {
        const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName] ?? {}, { header: 1, raw: false, defval: "" }) as string[][];
        // Drop fully-empty rows (trailing blank lines bloat the prompt).
        const nonEmpty = rows.filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""));
        if (!nonEmpty.length) continue;
        const csv = nonEmpty
          .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
          .join("\n");
        parts.push(`--- Sheet: ${sheetName} (${nonEmpty.length} rows) ---\n${csv}`);
      }
      const text = parts.length ? parts.join("\n") : "(no readable data in workbook)";
      setAttachments((current) => [...current.filter((x) => x.name !== file.name), { name: file.name, text }]);
    } catch {
      setAttachments((current) => [...current.filter((x) => x.name !== file.name), { name: file.name, text: "(failed to parse Excel file)" }]);
    }
  }

  function copyMessage(content: string) {
    navigator.clipboard?.writeText(content).catch(() => {});
  }

  async function saveTraceAsSpec(toolCalls: { tool: string; input: unknown }[], sessionTitle: string) {
    try {
      const content = toolCallsToSpec(toolCalls, sessionTitle);
      const file = suggestTraceFileName(sessionTitle);
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", file, content }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save spec.");
      showSuccess("Spec saved", `${d.saved} — open /tests to run it.`);
    } catch (e) {
      showError("Save failed", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function rememberRun(userContent: string, assistantContent: string, key: number) {
    const apiKey = settings.keys[settings.provider] ?? "";
    if (!apiKey.trim()) {
      showError("API key missing", "Add an API key in /settings first.");
      return;
    }
    setRemembering((prev) => [...prev, key]);
    try {
      const strip = (c: string) => c.split("\n\nAttached files:\n")[0].slice(0, 2000);
      const res = await fetch("/api/memory/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings.provider,
          model: settings.model,
          apiKey,
          baseUrl: settings.baseUrls[settings.provider] ?? "",
          messages: [
            { role: "user", content: strip(userContent) },
            { role: "assistant", content: strip(assistantContent) },
          ],
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to remember run.");
      const saved = (d.saved ?? []).length;
      if (saved) showSuccess("Run remembered", `${saved} fact(s) saved to memory.`);
      else showError("Nothing new", "No new durable facts in this run.");
    } catch (e) {
      showError("Remember failed", e instanceof Error ? e.message : "Failed.");
    } finally {
      setRemembering((prev) => prev.filter((x) => x !== key));
    }
  }

// Attached file dumps ride along to the model but stay hidden in the UI:
// split the visible prompt from the attached file sections.
function splitFiles(content: string): { text: string; files: { name: string; body: string }[] } {
  const marker = "\n\nAttached files:\n";
  const idx = content.indexOf(marker);
  if (idx < 0) return { text: content, files: [] };  const text = content.slice(0, idx);
  const rest = content.slice(idx + marker.length);
  const files: { name: string; body: string }[] = [];
  const header = /^--- (.+) ---$/gm;
  let match: RegExpExecArray | null;
  const headers: { name: string; index: number; end: number }[] = [];
  while ((match = header.exec(rest)) !== null) {
    headers.push({ name: match[1], index: match.index, end: match.index + match[0].length });
  }
  headers.forEach((h, i) => {
    const body = rest.slice(h.end, headers[i + 1]?.index ?? rest.length).trim();
    files.push({ name: h.name, body });
  });
  return { text, files };
}

  async function send(text?: string) {
    const raw = (text ?? input).trim();
    let draft = raw;
    // Slash commands expand into full QA prompts before sending.
    if (draft.startsWith("/")) {
      const parsed = parseCommand(draft);
      const def = parsed ? COMMANDS.find((c) => c.name === parsed.name) : undefined;
      if (!parsed || (!def && parsed.name !== "help")) {
        setError(`Unknown command. Available: ${COMMANDS.map((c) => `/${c.name}`).join(", ")}`);
        return;
      }
      if (parsed.name === "help" || !def) {
        // Answered locally — no LLM call.
        const targetId = activeId;
        if (!targetId) return;
        commitMessages(targetId, [
          ...messages,
          { role: "user", content: draft, time: now() },
          { role: "assistant", content: HELP_TEXT, model, time: now() },
        ], draft);
        setInput("");
        if (taRef.current) taRef.current.style.height = "auto";
        return;
      }
      draft = def.build(parsed.args);
    }
    const MAX_ATTACH_CHARS = settings.attachmentCap || 20_000;
    const fileContext = attachments.length
      ? "\n\nAttached files:\n" + attachments.map((file) => {
          const truncated = file.text.length > MAX_ATTACH_CHARS;
          const body = truncated ? file.text.slice(0, MAX_ATTACH_CHARS) : file.text;
          return `--- ${file.name} ---\n${body}${truncated ? `\n[truncated: showing first ${MAX_ATTACH_CHARS} of ${file.text.length} characters]` : ""}`;
        }).join("\n")
      : "";
    const content = (draft + fileContext).trim();
    if (!content || loading) return;
    const sess = sessionRef.current;
    // No active chat yet (welcome screen): create one lazily on first send.
    let targetId = activeId;
    let base: Msg[];
    if (!targetId) {
      const n = newSession();
      const list = [n, ...sessions];
      setSessions(list);
      saveSessions(list);
      setActiveId(n.id);
      saveActiveId(n.id);
      targetId = n.id;
      base = [];
    } else {
      base = messages;
    }
    setApproval(null);
    setError("");
    setLastFailedPrompt(null);
    const next: Msg[] = [...base, { role: "user", content: raw.startsWith("/") ? raw : content, time: now() }];
    // Title from the typed prompt only — never from the attached file dump.
    const titleSource = raw.trim() ? raw : attachments.length ? `Attached: ${attachments[0].name}` : content;
    commitMessages(targetId, next, titleSource);
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
    // Tracked module-wide so the run survives remounts (session/tab switches).
    trackRun(targetId, ctrl);
    setRunning(targetId, "");
    try {
      // The bubble shows the raw command; the model receives the expansion.
      const apiMessages = next.map((m, i) =>
        i === next.length - 1 && m.role === "user" ? { role: m.role, content } : { role: m.role, content: m.content }
      );
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          messages: apiMessages,
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
        skills?: string[];
        usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
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
              const rid = (JSON.parse(dm) as { runId?: string }).runId ?? null;
              runIdRef.current = rid;
              if (rid) setRunning(targetId, rid);
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
                const stage = /test|saving|save|run|assert/.test(label)
                  ? 3
                  : /opening|scanning|reading|clicking|typing|screenshot|scrolling|logging|console|select|waiting|storage|cookies|back|browser/.test(label)
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
              skills?: string[];
              usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
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
          } else if (ev === "approval") {
            if (sessionRef.current !== sess) continue;
            try {
              const d = JSON.parse(dm) as { id?: string; runId?: string; tool?: string; input?: unknown };
              if (d.id && d.runId) {
                setApproval({ id: d.id, runId: d.runId, tool: d.tool ?? "tool", input: d.input });
                setPendingApproval(targetId, { runId: d.runId, id: d.id });
                requestAnimationFrame(() => {
                  if (autoScrollRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                });
              }
            } catch {}
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
      // No sess guard here: a run that outlives a session switch still
      // commits to its own target session (background completion).
      if (!finalData) throw new Error("Stream was interrupted");
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
           skills: finalData.skills,
           usage: finalData.usage,
          model,
          time: now(),
        },
      ]);
      setLastFailedPrompt(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const raw = e instanceof Error ? e.message : "Failed";
      // Chunked-encoding/network breaks mid-stream (server reload, proxy cut):
      // surface as an interrupted stream with retry, not a raw TypeError.
      const msg = /incomplete|chunked|network|fetch|terminated|aborted/i.test(raw)
        ? "Stream interrupted — the server connection broke mid-run. Retry to continue."
        : raw;
      if (sessionRef.current === sess) {
        setError(msg);
        setLastFailedPrompt(content);
      }
      // Background failures still surface globally via toast.
      showError("Chat Error", msg);
    } finally {
      // Module-wide cleanup always runs (even after remounts); local UI
      // state only touches the session this send() belongs to.
      untrackRun(targetId);
      setRunning(targetId, null);
      setPendingApproval(targetId, null);
      if (streamRef.current === ctrl) streamRef.current = null;
      runIdRef.current = null;
      if (sessionRef.current === sess) setLoading(false);
      if (sessionRef.current === sess) setStopping(false);
      if (sessionRef.current === sess) setApproval(null);
      requestAnimationFrame(() => {
        if (autoScrollRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }

  function openChat(id: string) {
    if (id === activeId) return;
    sessionRef.current += 1;
    // The previous session's run keeps going in the background;
    // only a hanging approval is denied so it never blocks forever.
    denyLeavingApproval(activeId);
    router.push(`/chat/${encodeURIComponent(id)}`);
  }

  function newChat() {
    sessionRef.current += 1; // batalkan hasil request yang masih jalan
    denyLeavingApproval(activeId);
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
    // The deleted session's run (if any) keeps going until it tries to
    // commit — commitMessages then no-ops since the id is gone from the list.
    denyLeavingApproval(id);
    const list = sessions.filter((s) => s.id !== id);
    setSessions(list);
    saveSessions(list);
    if (id === activeId) {
      const top = list.length
        ? [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0]
        : null;
      setActiveId(top?.id ?? null);
      if (top) saveActiveId(top.id);
    }
    setError("");
    setLoading(false);
    setStopping(false);
  }

  const PIcon = PROVIDER_META[provider].icon;

  return (
    <div className="mesh-bg flex h-screen text-white">
      {/* ambient orbs — monochrome */}
      <div className="animate-blob pointer-events-none fixed -top-24 left-1/4 h-72 w-72 rounded-full bg-white/8 blur-[100px]" />
      <div className="animate-blob pointer-events-none fixed right-10 bottom-0 h-80 w-80 rounded-full bg-white/5 blur-[110px] [animation-delay:2s]" />

      {/* ── SIDEBAR ── */}
      <Sidebar
        sidebarOpen={sidebarOpen}
        sessions={visibleSessions}
        activeId={activeId}
        runningIds={runningIds}
        onClose={() => setSidebarOpen(false)}
        onNewChat={newChat}
        onSwitchSession={openChat}
        onDeleteSession={deleteSession}
        onStopSession={(id) => void stopRun(id)}
      />

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
            <Link
              href="/settings"
              title={apiKey && baseUrl ? "Provider is ready — open Settings" : "Complete the API key and base URL in Settings"}
              className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] text-zinc-400 transition hover:border-white/30 hover:text-white sm:flex"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${apiKey && baseUrl ? "bg-emerald-400" : "bg-amber-400"}`} />
              {apiKey && baseUrl ? "Ready" : "Setup required"}
            </Link>
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
              href="/tests"
              title="Tests"
              className="rounded-lg bg-white/8 p-2 text-zinc-400 hover:bg-white/15 hover:text-white"
            >
              <FlaskConical size={16} />
            </Link>
            <Link
              href="/prompt"
              title="System prompt inspector"
              className="rounded-lg bg-white/8 p-2 text-zinc-400 hover:bg-white/15 hover:text-white"
            >
              <ScrollText size={16} />
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
                    {(() => {
                      const hasKey = Object.values(settings.keys).some(Boolean);
                      const hasChat = sessions.some((s) => s.messages.length > 0);
                      if (hasKey && hasChat) return null;
                      const steps = [
                        { done: hasKey, label: "Add your API key", href: "/settings" },
                        { done: hasChat, label: "Send your first message", href: null as string | null },
                      ];
                      return (
                        <div className="mx-auto mt-5 max-w-md rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Get started in 30 seconds</p>
                          <div className="mt-2 flex flex-col gap-1.5">
                            {steps.map((step, i) => (
                              <div key={step.label} className="flex items-center gap-2.5 text-xs">
                                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${step.done ? "bg-emerald-300 text-black" : "bg-white/10 text-zinc-400"}`}>
                                  {step.done ? "✓" : i + 1}
                                </span>
                                {step.href && !step.done ? (
                                  <Link href={step.href} className="text-zinc-200 underline decoration-white/30 hover:text-white">{step.label} →</Link>
                                ) : (
                                  <span className={step.done ? "text-zinc-500 line-through" : "text-zinc-300"}>{step.label}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
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
                               {(() => {
                                 const { text, files } = splitFiles(m.content);
                                 return (
                                   <>
                                     {text && <p className="whitespace-pre-wrap">{text}</p>}
                                     {!!files.length && (
                                       <div className="mt-2 flex flex-wrap gap-1.5">
                                         {files.map((f) => (
                                           <span key={f.name} className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2.5 py-1 text-[11px] font-semibold text-black">
                                             <FileText size={11} /> {f.name}
                                           </span>
                                         ))}
                                       </div>
                                     )}
                                     {!!files.length && (
                                       <details className="mt-2">
                                         <summary className="cursor-pointer text-[11px] font-semibold text-zinc-600 hover:text-black">
                                           Show attached content
                                         </summary>
                                         <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-black/5 p-2 text-[10px] font-normal whitespace-pre-wrap text-zinc-700">
                                           {files.map((f) => `--- ${f.name} ---\n${f.body}`).join("\n")}
                                         </pre>
                                       </details>
                                     )}
                                   </>
                                 );
                               })()}
                             </div>
                             <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-zinc-600">
                               <button type="button" onClick={() => { setInput(splitFiles(m.content).text); requestAnimationFrame(autosize); }} className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 hover:text-white"><Pencil size={10} /> Edit</button>
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
                              <div className="prose-sm text-sm leading-relaxed text-zinc-100 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-black [&_pre]:p-3 [&_pre]:border [&_pre]:border-white/10 [&_table]:w-full [&_th]:whitespace-nowrap [&_td]:align-top">
                                 <ReactMarkdown
                                   remarkPlugins={[remarkGfm]}
                                   components={{
                                     table: ({ children }) => (
                                       <div className="overflow-x-auto rounded-xl border border-white/10">
                                         <table className="w-max min-w-full border-collapse text-xs">{children}</table>
                                       </div>
                                     ),
                                   }}
                                 >{m.content}</ReactMarkdown>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                <button type="button" onClick={() => copyMessage(m.content)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/10 hover:text-white"><Copy size={11} /> Copy</button>
                                {messages[i - 1]?.role === "user" && <button type="button" onClick={() => send(messages[i - 1].content)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/10 hover:text-white"><RotateCcw size={11} /> Regenerate</button>}
                                {messages[i - 1]?.role === "user" && (
                                  <button
                                    type="button"
                                    onClick={() => void rememberRun(messages[i - 1].content, m.content, i)}
                                    disabled={remembering.includes(i)}
                                    title="Extract durable facts from this run into memory"
                                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/10 hover:text-white disabled:opacity-50"
                                  >
                                    <Brain size={11} /> {remembering.includes(i) ? "Remembering…" : "Remember run"}
                                  </button>
                                )}
                                {parseMarkdownTables(m.content).length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => void downloadXlsx(`farayagent-${new Date().toISOString().slice(0, 10)}`, parseMarkdownTables(m.content))}
                                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/10 hover:text-white"
                                  >
                                    <FileSpreadsheet size={11} /> XLSX
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => printMessage(m.content.split("\n")[0].slice(0, 60) || "FarayAgent report", messageToHtml(m.content))}
                                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/10 hover:text-white"
                                >
                                  <Printer size={11} /> PDF
                                </button>
                                {!!m.toolCalls?.length && (
                                  <button
                                    type="button"
                                    onClick={() => void saveTraceAsSpec(m.toolCalls ?? [], active?.title ?? "recorded session")}
                                    title="Convert this run's browser actions into a Playwright spec"
                                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/10 hover:text-white"
                                  >
                                    <FileCode2 size={11} /> Save as spec
                                  </button>
                                )}
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
                                  {m.artifacts.map((artifact, ai) => {
                                    const quality = artifact.meta.qualityGate as { complete?: boolean; tbdCount?: number; missingFields?: string[] } | undefined;
                                    const areas = artifact.meta.areas as Record<string, number> | undefined;
                                    return <div key={`${artifact.file}-${ai}`} className="rounded-lg border border-white/8 bg-white/5 px-3 py-2">
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
                              {!!m.usage?.totalTokens && (
                                <span title={`in: ${m.usage.inputTokens ?? "?"} / out: ${m.usage.outputTokens ?? "?"}`}> • {(m.usage.totalTokens / 1000).toFixed(1)}k tokens</span>
                              )}
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
                                    <img src={s.image} alt={s.url} className="w-full transition duration-300 group-hover:scale-[1.01]" />
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
                            {PROGRESS_LABELS.map((label, index) => (
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
                           {!!approval && (
                             <ApprovalCard approval={approval} approving={approving} onRespond={(ok) => void respondApproval(ok)} onAlwaysAllow={() => void respondApproval(true, true)} />
                           )}
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
            <Composer
              input={input}
              setInput={setInput}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              settings={settings}
              provider={provider}
              model={model}
              loading={loading}
              stopping={stopping}
              modelMenuOpen={modelMenuOpen}
              setModelMenuOpen={setModelMenuOpen}
              taRef={taRef}
              PIcon={PIcon}
              autosize={autosize}
              handleFiles={handleFiles}
              send={send}
              setSettings={setSettings}
              saveSettings={saveSettings}
              stopRun={stopRun}
            />
          </main>

          {searchOpen && (
            <SearchModal
              sessions={visibleSessions}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onClose={() => setSearchOpen(false)}
              onPick={(id) => {
                setSearchOpen(false);
                openChat(id);
              }}
            />
          )}

        </div>
      </div>

      {/* lightbox + navigasi step */}
      {lightbox && (
        <Lightbox
          lightbox={lightbox}
          onClose={() => setLightbox(null)}
          onStep={(i) => setLightbox({ ...lightbox, i })}
        />
      )}
    </div>
  );
}
