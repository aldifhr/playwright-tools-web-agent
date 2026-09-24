"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
    desc: "FarayAgent controls real Chromium: open URLs, read pages, click, fill forms, and take screenshots with live status for every step.",
  },
  {
    icon: FlaskConical,
    title: "Test Case Generator",
    desc: "From chat: exploration → QA test plan document → JSON test cases → quality gate and artifact preview.",
  },
  {
    icon: Brain,
    title: "Long-Term Memory",
    desc: "MEMORY.md: preferences and important facts persist across sessions. Passwords, API keys, and tokens are rejected automatically.",
  },
  {
    icon: SettingsIcon,
    title: "Multi-Provider",
    desc: "OpenAI, Anthropic, or an OpenAI-compatible gateway with configurable model, base URL, and API key.",
  },
];

const STEPS = [
  { icon: Send, text: "Ask in chat what to explore or test" },
  { icon: Zap, text: "Track progress: Planning → Browsing → Testing → Reporting" },
  { icon: Square, text: "Interrupt anytime with the ■ Stop button" },
  { icon: Sparkles, text: "Receive a summary + artifact preview + quality gate" },
];

export default function Landing() {
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  // Stabilize for SSR: server renders null, so default to false to avoid
  // hydration mismatch when prefers-reduced-motion differs.
  const shouldReduce = reducedMotion ?? false;
  const reveal = shouldReduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 22 }, show: { opacity: 1, y: 0 } };
  // Gate entrance animations behind mount so SSR HTML has no inline
  // motion styles. Both initial AND animate must be gated — framer-motion
  // serializes opacity/transform differently on server vs client
  // (opacity:1 vs opacity:"1" + transform:"none"), so any animate="show"
  // on first render still mismatches.
  const initialProp = mounted ? ("hidden" as const) : (false as const);
  const animateProp = mounted ? ("show" as const) : undefined;
  const whileInViewProp = mounted ? ("show" as const) : undefined;

  return (
    <div className="mesh-bg min-h-screen text-white">
      <div className="animate-blob pointer-events-none fixed -top-24 left-1/4 h-72 w-72 rounded-full bg-white/8 blur-[100px]" />
      <div className="animate-blob pointer-events-none fixed right-10 bottom-0 h-80 w-80 rounded-full bg-white/5 blur-[110px] [animation-delay:2s]" />

      {/* nav */}
      <motion.nav
        initial={initialProp}
        animate={animateProp}
        variants={reveal}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="relative z-10 mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-5 sm:px-6"
      >
        <motion.div
          whileHover={shouldReduce ? undefined : { rotate: 8, scale: 1.06 }}
          transition={{ type: "spring", stiffness: 320, damping: 18 }}
          className="grid h-9 w-9 place-items-center rounded-xl bg-white"
        >
          <Bot size={18} className="text-black" />
        </motion.div>
        <p className="text-sm font-bold tracking-tight">FarayAgent</p>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <motion.div whileHover={shouldReduce ? undefined : { y: -2 }} whileTap={{ scale: 0.96 }}>
            <Link
            href="/chat"
            className="rounded-xl bg-white px-4 py-2 font-semibold text-black transition hover:bg-zinc-200 active:scale-95"
            >Open Chat</Link>
          </motion.div>
        </div>
      </motion.nav>

      {/* hero */}
      <motion.header
        initial={initialProp}
        animate={animateProp}
        variants={{ show: { transition: { staggerChildren: shouldReduce ? 0 : 0.1 } }, hidden: {} }}
        className="relative z-10 mx-auto w-full max-w-5xl px-4 pt-14 pb-10 text-center sm:px-6 sm:pt-20"
      >
        <motion.div
          variants={reveal}
          animate={mounted && !shouldReduce ? { y: [0, -7, 0], rotate: [0, 1, 0] } : undefined}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white shadow-2xl shadow-white/10"
        >
          <Bot size={30} className="text-black" />
        </motion.div>
        <motion.h1 variants={reveal} className="text-gradient mx-auto mt-6 max-w-2xl text-4xl font-extrabold tracking-tight sm:text-6xl">
          QA Copilot
        </motion.h1>
        <motion.p variants={reveal} className="mx-auto mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
           FarayAgent — an AI Browser Agent powered by real Chromium (Playwright). Browse sites,
           log in, summarize pages, fill forms, take screenshots, and create QA artifacts from chat.
        </motion.p>
        <motion.div variants={reveal} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <motion.div whileHover={shouldReduce ? undefined : { y: -3, scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Link
            href="/chat"
            className="flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-bold text-black shadow-xl shadow-white/10 transition hover:bg-zinc-200 active:scale-95"
            ><Send size={16} /> Open Chat</Link>
          </motion.div>
          <motion.div whileHover={shouldReduce ? undefined : { y: -3 }} whileTap={{ scale: 0.97 }}>
            <Link
            href="#features"
            className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10 active:scale-95"
            ><FlaskConical size={16} /> Explore Features</Link>
          </motion.div>
        </motion.div>
        <motion.p variants={reveal} className="mt-4 font-mono text-[11px] text-zinc-600">
          chat → explore → test plan + test cases
        </motion.p>
      </motion.header>

      {/* how it works */}
      <section className="relative z-10 mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <motion.div
          initial={initialProp}
          whileInView={whileInViewProp}
          viewport={{ once: true, amount: 0.25 }}
          variants={{ show: { transition: { staggerChildren: shouldReduce ? 0 : 0.08 } }, hidden: {} }}
          className="glass grid gap-2 rounded-3xl p-4 sm:grid-cols-4 sm:p-6"
        >
          {STEPS.map((s, i) => (
            <motion.div key={i} variants={reveal} whileHover={shouldReduce ? undefined : { y: -3 }} className="flex items-start gap-3 rounded-2xl p-3">
              <motion.span whileHover={shouldReduce ? undefined : { rotate: -8 }} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-black">
                <s.icon size={15} />
              </motion.span>
              <p className="text-xs leading-relaxed text-zinc-300">
                <span className="font-bold text-white">{i + 1}. </span>
                {s.text}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* features */}
      <section id="features" className="relative z-10 mx-auto w-full max-w-5xl scroll-mt-4 px-4 py-8 sm:px-6">
        <motion.div
          initial={initialProp}
          whileInView={whileInViewProp}
          viewport={{ once: true, amount: 0.2 }}
          variants={{ show: { transition: { staggerChildren: shouldReduce ? 0 : 0.1 } }, hidden: {} }}
          className="grid gap-3 sm:grid-cols-2"
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              variants={reveal}
              whileHover={shouldReduce ? undefined : { y: -6, transition: { duration: 0.2 } }}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:-translate-y-1 hover:border-white/30 hover:bg-white/8"
            >
              <motion.span whileHover={shouldReduce ? undefined : { scale: 1.08, rotate: 5 }} className="inline-grid h-10 w-10 place-items-center rounded-xl bg-white text-black">
                <f.icon size={18} />
              </motion.span>
              <h2 className="mt-4 text-base font-bold">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* footer */}
      <footer className="relative z-10 mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-4 py-10 text-[11px] text-zinc-600 sm:px-6">
        <span>FarayAgent • Browser Agent</span>
      </footer>
    </div>
  );
}
