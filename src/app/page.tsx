import Link from "next/link";
import {
  Bot,
  Brain,
  FlaskConical,
  Globe,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: Globe,
    title: "AI Browser Agent",
    desc: "Faray mengendalikan Chromium asli: buka URL, baca isi, klik, isi form, screenshot — dengan status live tiap langkah.",
  },
  {
    icon: FlaskConical,
    title: "Test Case Generator",
    desc: "Dari chat atau form: eksplorasi → test plan 13 kolom → spec Playwright → run + verifikasi otomatis.",
  },
  {
    icon: Brain,
    title: "Memory Jangka Panjang",
    desc: "MEMORY.md ala Hermes: preferensi dan fakta penting diingat antar sesi. Rahasia otomatis ditolak.",
  },
  {
    icon: SettingsIcon,
    title: "Multi-Provider",
    desc: "OpenAI / Anthropic / gateway OpenAI-compatible. Base URL + API key sendiri, daftar model auto-fetch dari API.",
  },
];

const STEPS = [
  { icon: Send, text: "Perintahkan: “buka saucedemo.com dan login”" },
  { icon: Zap, text: "Pantau status live: Opening… → Reading… → Thinking…" },
  { icon: Square, text: "Interrupt kapan pun dengan tombol ■ Stop" },
  { icon: Sparkles, text: "Terima ringkasan + screenshot + timeline tool" },
];

export default function Landing() {
  return (
    <div className="mesh-bg min-h-screen text-white">
      <div className="animate-blob pointer-events-none fixed -top-24 left-1/4 h-72 w-72 rounded-full bg-white/8 blur-[100px]" />
      <div className="animate-blob pointer-events-none fixed right-10 bottom-0 h-80 w-80 rounded-full bg-white/5 blur-[110px] [animation-delay:2s]" />

      {/* nav */}
      <nav className="relative z-10 mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-5 sm:px-6">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white">
          <Bot size={18} className="text-black" />
        </div>
        <p className="text-sm font-bold tracking-tight">Playwright AI</p>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <Link
            href="/chat"
            className="rounded-xl bg-white px-4 py-2 font-semibold text-black transition hover:bg-zinc-200 active:scale-95"
          >
            Mulai Chat
          </Link>
        </div>
      </nav>

      {/* hero */}
      <header className="relative z-10 mx-auto w-full max-w-5xl px-4 pt-14 pb-10 text-center sm:px-6 sm:pt-20">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white shadow-2xl shadow-white/10">
          <Bot size={30} className="text-black" />
        </div>
        <h1 className="text-gradient mx-auto mt-6 max-w-2xl text-4xl font-extrabold tracking-tight sm:text-6xl">
          Suruh AI browsing buat kamu
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
          Faray — AI Browser Agent di atas Chromium asli (Playwright). Buka situs, login,
          ringkas halaman, isi form, screenshot, sampai bikin + jalanin test case otomatis.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/chat"
            className="flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-bold text-black shadow-xl shadow-white/10 transition hover:bg-zinc-200 active:scale-95"
          >
            <Send size={16} /> Mulai Chat
          </Link>
          <Link
            href="#fitur"
            className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10 active:scale-95"
          >
            <FlaskConical size={16} /> Lihat Fitur
          </Link>
        </div>
        <p className="mt-4 font-mono text-[11px] text-zinc-600">
          “buka saucedemo.com dan login” → beres + screenshot
        </p>
      </header>

      {/* cara kerja */}
      <section className="relative z-10 mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="glass grid gap-2 rounded-3xl p-4 sm:grid-cols-4 sm:p-6">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-start gap-3 rounded-2xl p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-black">
                <s.icon size={15} />
              </span>
              <p className="text-xs leading-relaxed text-zinc-300">
                <span className="font-bold text-white">{i + 1}. </span>
                {s.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* fitur */}
      <section id="fitur" className="relative z-10 mx-auto w-full max-w-5xl scroll-mt-4 px-4 py-8 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:-translate-y-1 hover:border-white/30 hover:bg-white/8"
            >
              <span className="inline-grid h-10 w-10 place-items-center rounded-xl bg-white text-black">
                <f.icon size={18} />
              </span>
              <h2 className="mt-4 text-base font-bold">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer className="relative z-10 mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-4 py-10 text-[11px] text-zinc-600 sm:px-6">
        <span>Playwright AI • Faray Browser Agent</span>
        <span className="ml-auto">Next.js + Playwright + Vercel AI SDK</span>
      </footer>
    </div>
  );
}
