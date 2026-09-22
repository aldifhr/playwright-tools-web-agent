/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
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
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const META: Record<ProviderId, { icon: typeof Sparkles; hint: string }> = {
  openai: { icon: Sparkles, hint: "GPT • butuh API key" },
  anthropic: { icon: Brain, hint: "Claude • butuh API key" },
};

const section = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
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
  const { success, error: showError } = useToast();

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
    success("Provider Diubah", PROVIDERS[p].label);
  }

  async function loadModels(manual: boolean) {
    const key = settings.keys[settings.provider]?.trim();
    if (!key) {
      if (manual) {
        setModelsError("Isi API key dulu");
        showError("Error", "Isi API key dulu");
      }
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
      if (manual) success("Model Dimuat", `${d.models.length} model tersedia`);
      // kalau model tersimpan tidak ada di daftar live, pakai yang pertama
      if (!d.models.includes(settings.model)) {
        patch({ model: d.models[0] });
      }
    } catch (e) {
      setLiveModels(null);
      const msg = e instanceof Error ? e.message : "Gagal";
      if (manual) {
        setModelsError(msg);
        showError("Error Memuat Model", msg);
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      success("Browser Test Sukses", "Chromium berhasil navigate dan screenshot");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Tes gagal";
      setTestError(msg);
      showError("Browser Test Gagal", msg);
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
        <motion.div variants={section} initial="hidden" animate="show">
          <Button variant="outline" size="sm" asChild>
            <Link href="/chat">
              <ArrowLeft size={15} /> Kembali ke chat
            </Link>
          </Button>
        </motion.div>

        <motion.div
          variants={section}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.05 }}
          className="mt-6 flex items-center gap-3"
        >
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-lg shadow-white/10">
            <Bot size={22} className="text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Pengaturan</h1>
            <AnimatePresence mode="wait">
              {saved ? (
                <motion.p
                  key="saved"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 text-xs text-zinc-400"
                >
                  <Check size={12} className="text-white" /> Tersimpan otomatis
                </motion.p>
              ) : (
                <motion.p
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-zinc-500"
                >
                  Model AI & koneksi • tersimpan lokal
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* provider */}
        <motion.div
          variants={section}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.1 }}
        >
          <Label className="mt-8 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
            Provider AI
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => {
              const Icon = META[p].icon;
              const active = provider === p;
              return (
                <motion.button
                  key={p}
                  onClick={() => changeProvider(p)}
                  whileTap={{ scale: 0.96 }}
                  whileHover={{ scale: 1.01 }}
                  className={`rounded-2xl border p-4 text-center transition ${
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
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* api key */}
        <motion.div
          variants={section}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.15 }}
        >
          <Label className="mt-6 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
            API Key — {PROVIDERS[provider].label}
          </Label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              placeholder="sk-... / sk-ant-..."
              value={apiKey}
              onChange={(e) =>
                patch({ keys: { ...settings.keys, [provider]: e.target.value } })
              }
              className="dark:bg-white/5 border-white/10 pr-10 text-white placeholder:text-zinc-600"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-500 hover:text-white"
              aria-label={showKey ? "Sembunyikan key" : "Tampilkan key"}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </motion.div>

        {/* base url */}
        <motion.div
          variants={section}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.2 }}
        >
          <Label className="mt-6 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
            Base URL
          </Label>
          <Input
            value={baseUrl}
            placeholder={DEFAULT_BASE_URLS[provider]}
            onChange={(e) =>
              patch({ baseUrls: { ...settings.baseUrls, [provider]: e.target.value } })
            }
            className="dark:bg-white/5 border-white/10 text-white placeholder:text-zinc-600"
          />
          <p className="mt-1.5 text-[11px] text-zinc-600">
            Kosongkan untuk memakai default. Daftar model di bawah terisi otomatis dari Base URL + API key ini.
          </p>
        </motion.div>

        {/* model — shadcn Select */}
        <motion.div
          variants={section}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.25 }}
        >
          <div className="mt-6 mb-2 flex items-center gap-2">
            <Label className="text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
              Model
            </Label>
            {modelsLoading && <Loader2 size={12} className="animate-spin text-zinc-400" />}
            {liveModels?.length ? (
              <Badge>{liveModels.length} live dari API</Badge>
            ) : (
              <Badge variant="outline" className="text-zinc-500">
                bawaan
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadModels(true)}
              disabled={modelsLoading || !apiKey.trim()}
              className="ml-auto h-7 text-[11px]"
            >
              <RefreshCw size={12} /> Muat ulang
            </Button>
          </div>
          <Select value={model} onValueChange={(v) => patch({ model: v })}>
            <SelectTrigger className="dark:bg-white/5 border-white/10 w-full py-5 text-white">
              <SelectValue placeholder="Pilih model" />
            </SelectTrigger>
            <SelectContent>
              {options.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {modelsError ? (
            <p className="mt-1.5 text-[11px] text-zinc-400">⚠ {modelsError} — memakai daftar bawaan.</p>
          ) : !apiKey.trim() ? (
            <p className="mt-1.5 text-[11px] text-zinc-600">
              Isi API key untuk memuat daftar model asli dari API.
            </p>
          ) : null}
          <p className="mt-1.5 text-[11px] text-zinc-600">
            Key hanya tersimpan di localStorage browser ini.
          </p>
        </motion.div>

        {/* playwright test */}
        <motion.div
          variants={section}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.3 }}
        >
          <Label className="mt-8 mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
            Integrasi Playwright
          </Label>
          <Card className="glass border-white/10 py-4">
            <CardContent className="px-4">
              <div className="flex items-center gap-2 text-sm">
                <Globe size={15} className="text-white" />
                <span className="font-medium">Chromium headless (server-side)</span>
                <Button
                  onClick={testBrowser}
                  disabled={testing}
                  size="sm"
                  className="ml-auto bg-white text-xs font-semibold text-black hover:bg-zinc-200"
                >
                  {testing ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                  {testing ? "Membuka…" : "Tes buka example.com"}
                </Button>
              </div>
              {testError && <p className="mt-2 text-xs text-zinc-300">⚠ {testError}</p>}
              <AnimatePresence>
                {test && (
                  <motion.div
                    key={test.url}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-3 overflow-hidden rounded-xl border border-white/10"
                  >
                    <p className="truncate border-b border-white/10 bg-black px-3 py-2 text-[11px] text-zinc-400">
                      {test.title} • {test.url}
                    </p>
                    <img src={test.image} alt={test.url} className="w-full grayscale" />
                  </motion.div>
                )}
              </AnimatePresence>
              {!test && !testError && (
                <p className="mt-2 text-xs text-zinc-600">
                  Tes ini membuka example.com via Playwright lalu screenshot — tanpa perlu API key.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
