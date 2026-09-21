/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Brain,
  Camera,
  Check,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { DEFAULT_BASE_URLS, PROVIDERS, ProviderId } from "@/lib/providers";
import { Settings, defaultSettings, loadSettings, saveSettings } from "@/lib/store";

const META: Record<ProviderId, { icon: typeof Sparkles; hint: string }> = {
  openai: { icon: Sparkles, hint: "GPT • butuh API key" },
  anthropic: { icon: Brain, hint: "Claude • butuh API key" },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ title: string; url: string; image: string } | null>(null);
  const [testError, setTestError] = useState("");
  const [liveModels, setLiveModels] = useState<string[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hidrasi deferred agar render pertama identik SSR
  useEffect(() => {
    const t = setTimeout(() => setSettings(loadSettings()), 0);
    return () => clearTimeout(t);
  }, []);

  function patch(p: Partial<Settings>) {
    setSettings((prev) => {
      const next = { ...prev, ...p };
      saveSettings(next);
      return next;
    });
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1200);
  }

  function changeProvider(p: ProviderId) {
    setLiveModels(null);
    setModelsError("");
    patch({ provider: p, model: PROVIDERS[p].models[0] });
  }

  async function loadModels(manual: boolean) {
    const key = settings.keys[settings.provider]?.trim();
    if (!key) {
      if (manual) setModelsError("Isi API key dulu");
      return;
    }
    setModelsLoading(true);
    if (manual) setModelsError("");
    try {
      const r = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings.provider,
          apiKey: key,
          baseUrl: settings.baseUrls[settings.provider] ?? "",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Gagal memuat model");
      setLiveModels(d.models);
      setModelsError("");
      // kalau model tersimpan tidak ada di daftar live, pakai yang pertama
      if (!d.models.includes(settings.model)) {
        patch({ model: d.models[0] });
      }
    } catch (e) {
      setLiveModels(null);
      if (manual) setModelsError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setModelsLoading(false);
    }
  }

  // auto-fetch daftar model saat provider / key / base URL berubah (debounce)
  const provider = settings.provider;
  const apiKey = settings.keys[provider] ?? "";
  const baseUrl = settings.baseUrls[provider] ?? "";
  useEffect(() => {
    const key = apiKey.trim();
    const t = setTimeout(async () => {
      if (!key) {
        setLiveModels(null);
        return;
      }
      setModelsLoading(true);
      try {
        const r = await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey: key, baseUrl }),
        });
        const d = await r.json();
        if (r.ok && d.models?.length) {
          setLiveModels(d.models);
          setModelsError("");
        } else {
          setLiveModels(null);
        }
      } catch {
        setLiveModels(null);
      } finally {
        setModelsLoading(false);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [provider, apiKey, baseUrl]);

  async function testBrowser() {
    setTesting(true);
    setTestError("");
    setTest(null);
    try {
      const n = await fetch("/api/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "navigate", url: "https://example.com" }),
      });
      const nd = await n.json();
      if (!n.ok) throw new Error(nd.error || "Navigasi gagal");
      const s = await fetch("/api/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "screenshot" }),
      });
      const sd = await s.json();
      if (!s.ok) throw new Error(sd.error || "Screenshot gagal");
      setTest({ title: nd.title || "Example Domain", url: nd.url, image: sd.image });
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Tes gagal");
    } finally {
      setTesting(false);
    }
  }

  const { model } = settings;
  const fallback = PROVIDERS[provider].models;
  const options = liveModels?.length
    ? (liveModels.includes(model) ? liveModels : [model, ...liveModels])
    : fallback.includes(model)
      ? fallback
      : [model, ...fallback];

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
            <Bot size={22} className="text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Pengaturan</h1>
            <p className="flex items-center gap-1.5 text-xs text-zinc-500">
              {saved ? (
                <>
                  <Check size={12} className="text-white" /> Tersimpan otomatis
                </>
              ) : (
                "Model AI & koneksi • tersimpan lokal"
              )}
            </p>
          </div>
        </div>

        {/* provider */}
        <p className="mt-8 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
          Provider AI
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => {
            const Icon = META[p].icon;
            const active = provider === p;
            return (
              <button
                key={p}
                onClick={() => changeProvider(p)}
                className={`rounded-2xl border p-4 text-center transition active:scale-95 ${
                  active
                    ? "border-white/50 bg-white/10 shadow-lg shadow-white/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <Icon size={20} className={`mx-auto ${active ? "text-white" : "text-zinc-500"}`} />
                <p className={`mt-2 text-sm font-semibold ${active ? "text-white" : "text-zinc-400"}`}>
                  {PROVIDERS[p].label}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-600">{META[p].hint}</p>
              </button>
            );
          })}
        </div>

        {/* api key */}
        <p className="mt-6 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
          API Key — {PROVIDERS[provider].label}
        </p>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            placeholder="sk-... / sk-ant-..."
            value={apiKey}
            onChange={(e) =>
              patch({ keys: { ...settings.keys, [provider]: e.target.value } })
            }
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 pr-10 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/40"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute top-3 right-3 text-zinc-500 hover:text-white"
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {/* base url */}
        <p className="mt-6 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
          Base URL
        </p>
        <input
          value={baseUrl}
          placeholder={DEFAULT_BASE_URLS[provider]}
          onChange={(e) =>
            patch({ baseUrls: { ...settings.baseUrls, [provider]: e.target.value } })
          }
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/40"
        />
        <p className="mt-1.5 text-[11px] text-zinc-600">
          Kosongkan untuk memakai default. Daftar model di bawah terisi otomatis dari Base URL + API key ini.
        </p>

        {/* model — auto dari API */}
        <div className="mt-6 mb-2 flex items-center gap-2">
          <p className="text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
            Model
          </p>
          {modelsLoading && <Loader2 size={12} className="animate-spin text-zinc-400" />}
          {liveModels?.length ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black">
              {liveModels.length} live dari API
            </span>
          ) : (
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500">
              bawaan
            </span>
          )}
          <button
            onClick={() => loadModels(true)}
            disabled={modelsLoading || !apiKey.trim()}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white hover:bg-white/10 disabled:opacity-30"
          >
            <RefreshCw size={12} /> Muat ulang
          </button>
        </div>
        <input
          value={model}
          onChange={(e) => patch({ model: e.target.value })}
          list="model-options"
          placeholder="faray"
          spellCheck={false}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/40"
        />
        <datalist id="model-options">
          {options.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {modelsError ? (
          <p className="mt-1.5 text-[11px] text-zinc-400">⚠ {modelsError} — ketik nama model manual.</p>
        ) : !apiKey.trim() ? (
          <p className="mt-1.5 text-[11px] text-zinc-600">
            Isi API key untuk memuat daftar model asli, atau ketik langsung (mis. faray).
          </p>
        ) : null}
        <p className="mt-1.5 text-[11px] text-zinc-600">
          Key hanya tersimpan di localStorage browser ini.
        </p>

        {/* playwright test */}
        <p className="mt-8 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
          Integrasi Playwright
        </p>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 text-sm">
            <Globe size={15} className="text-white" />
            <span className="font-medium">Chromium headless (server-side)</span>
            <button
              onClick={testBrowser}
              disabled={testing}
              className="ml-auto flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-40"
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
              {testing ? "Membuka…" : "Tes buka example.com"}
            </button>
          </div>
          {testError && <p className="mt-2 text-xs text-zinc-300">⚠ {testError}</p>}
          {test && (
            <div className="animate-fade-up mt-3 overflow-hidden rounded-xl border border-white/10">
              <p className="truncate border-b border-white/10 bg-black px-3 py-2 text-[11px] text-zinc-400">
                {test.title} • {test.url}
              </p>
              <img src={test.image} alt={test.url} className="w-full grayscale" />
            </div>
          )}
          {!test && !testError && (
            <p className="mt-2 text-xs text-zinc-600">
              Tes ini membuka example.com via Playwright lalu screenshot — tanpa perlu API key.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
