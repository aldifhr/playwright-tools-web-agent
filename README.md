# Playwright Chat AI — AI Browser Agent

Web app chat AI yang mengendalikan **browser Chromium asli** (Playwright) langsung dari percakapan: buka URL, baca isi, klik, isi form, screenshot — plus bikin dan jalanin **test case Playwright** otomatis.

Agent bernama **Faray**. UI hitam-putih, tiga halaman: **Chat** (`/`), **Tests** (`/tests`), **Settings** (`/settings`), **Memory** (`/memory`).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Vercel AI SDK (`ai`) + `@ai-sdk/openai`, `@ai-sdk/anthropic` (Chat Completions; OpenAI-compatible gateway didukung via Base URL)
- Playwright (Chromium headless, singleton server-side) + `@playwright/test` (runner)

## Jalankan

```bash
npm install
npx playwright install chromium
npm run dev
# buka http://localhost:3000
```

## Pengaturan (`/settings`)

Dibuka dari badge model di topbar. Semua tersimpan di localStorage browser.

- **Provider**: OpenAI / Anthropic (klik kartu)
- **API Key**: per provider. Tanpa key yang valid, chat mengembalikan error (browser manual + test Playwright tetap jalan tanpa key)
- **Base URL**: default `https://api.openai.com/v1` / `https://api.anthropic.com/v1`. Bisa diganti gateway OpenAI-compatible (mis. proxy/self-hosted)
- **Model**: kolom ketik-bebas + saran dropdown yang **terisi otomatis dari API provider** (`GET /models` pakai Base URL + API key, debounce saat mengetik). Badge jumlah model live kalau berhasil, fallback ke daftar bawaan kalau gagal, tombol "Muat ulang" untuk refresh manual
- **Tes Playwright**: tombol "Tes buka example.com" — buktikan browser jalan tanpa perlu API key

## Chat (`/`)

- **Sidebar kiri** = daftar sesi chat (multi-session, judul otomatis, tersimpan di localStorage, hapus per sesi). Tombol Chat baru aman diklik kapan pun — request yang masih jalan otomatis dibatalkan
- **Status live real-time** via SSE (`POST /api/chat/stream`): `Agent is typing…` → `Opening …` → `Thinking…` → `Reading page…` → `Taking screenshot…` → `Saving test…` / `Running tests…` / `Remembering…`, sesuai tool yang dieksekusi
- **Tombol ■ Stop** saat loading = interrupt beneran: loop server berhenti, tool yang mau jalan dibatalkan, stream ditutup bersih (`aborted`). Ganti sesi / tutup tab juga otomatis cancel
- **Timeline tool** per jawaban (expandable) + **screenshot** dalam mock jendela browser (klik = lightbox)
- **Preview kanan** = live browser: address bar manual (buka URL + auto-screenshot tanpa API key), screenshot terbaru, riwayat, auto-shot hemat (hanya saat pindah halaman, maks 6/run)
- Contoh: "Buka hackernews dan ringkas 5 berita teratas", "Buka saucedemo.com dan login", "Cek harga bitcoin di coingecko"

## Test case Playwright (`/tests`)

Dibuka dari ikon flask di topbar (ada badge jumlah spec).

- **Via chat**: "buatkan test case login saucedemo dan jalankan" — agent eksplorasi → susun test plan → tulis spec → verifikasi run (perbaiki maks 2x) → lapor tabel markdown
- **Generator**: kartu "Generate test case baru" — isi URL + skenario (+ kredensial demo opsional) → Generate + Run dengan progress live
- **Format tabel** (chat + ikon tabel per spec): ID | Area | Type | Title | Preconditions | Test Data | Steps | Expected | **Actual** (✓ sesuai expected / potongan error) | Status (PASS/FAILED) | Priority | Severity
- Spec di `tests/*.spec.ts` (+ sidecar `.cases.json`), bisa dilihat, di-run per file/semua, dihapus. Hasil run terakhir persisten (`tests/.last-run.json`) sehingga kolom Status tetap terisi walau run dari chat. Run manual: `npx playwright test`
- Batas langkah agent 20/run; kalau mentok, UI tampilkan peringatan jujur (bukan diam)

## Kepribadian (`SOUL.md`) & Memory (`MEMORY.md`)

- **`SOUL.md`** (root): nama, vibe, gaya bahasa, prinsip menjawab ala Hermes. Dibaca live tiap request — edit file langsung ngefek tanpa rebuild
- **`MEMORY.md`** (root): ingatan jangka panjang. Faray menerima isinya tiap request + menyimpan via `memory_save` / menghapus via `memory_forget`. Pola password/API key/token **ditolak otomatis** (diarahkan ke `/settings`). Kapasitas 100 fakta, kelola di `/memory` (ikon otak di topbar)

## API

- `POST /api/chat/stream` — SSE: `init { runId }`, `status { label }`, `shot { image, url }`, `done { text, toolCalls, screenshots, usage, model, provider, capped }`, `aborted {}`, `error { error }`
- `POST /api/chat` — non-streaming: `{ messages, provider, model, apiKey, baseUrl }`
- `POST /api/chat/cancel` — `{ runId }`
- `POST /api/models` — `{ provider, apiKey, baseUrl }` → `{ models, source: "live" }`
- `GET /api/browser` — `{ running, url, playwright }`
- `POST /api/browser` — `{ action: "navigate" | "screenshot" | "text" | "snapshot" | "click" | "type" | "back" | "close", ... }`
- `GET /api/tests` — `{ tests, lastRun }` · `POST /api/tests` — `{ action: "get" | "delete" | "run" | "cases", file? }`
- `GET /api/memory` · `POST /api/memory` — `{ action: "save" | "forget", fact? | query? }`

## Struktur proyek

```
SOUL.md MEMORY.md (root — kepribadian & ingatan, live-reload)
src/
  app/
    page.tsx                 Chat
    settings/page.tsx        Provider / key / base URL / model + tes browser
    tests/page.tsx           Daftar spec + generator + tabel case + run
    memory/page.tsx          Daftar ingatan
    api/chat/route.ts        Non-streaming (fallback)
    api/chat/stream/route.ts SSE agent loop (maks 20 langkah)
    api/chat/cancel/route.ts Interrupt run
    api/browser/route.ts     Kontrol Playwright manual
    api/models/route.ts      Daftar model live dari provider
    api/tests/route.ts       Kelola + jalankan spec
    api/memory/route.ts      Kelola ingatan
  components/Chat.tsx        UI chat (session, stream reader, preview)
  lib/
    browser.ts               Singleton Chromium + aksi (dengan verifikasi isi)
    agent.ts                 Tools AI (browser_* + test_* + memory_*)
    agent-status.ts          Label status (aman untuk client)
    specs.ts                 Simpan/baca/jalankan spec + test plan + last-run
    runs.ts                  Registry run + cancel flag
    providers.ts             Provider, model default, system prompt aturan
    soul.ts                  Komposisi SOUL + rules + MEMORY
    store.ts                 Persistensi localStorage (settings, sesi)
tests/                       Spec + .cases.json + .last-run.json (hasil)
```
