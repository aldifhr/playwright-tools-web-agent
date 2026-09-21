# Playwright Chat AI — AI Browser Agent

Web app chat AI + Playwright. AI bisa browsing web nyata: buka URL, baca isi, klik, isi form, screenshot.

## Stack
- Next.js 16 (App Router) + TypeScript + Tailwind
- Vercel AI SDK (`ai`) + `@ai-sdk/openai`, `@ai-sdk/anthropic`
- Playwright (Chromium headless, singleton server-side)

## Jalankan

```bash
npm install
npx playwright install chromium
npm run dev
# buka http://localhost:3000
```

## Pengaturan (`/settings`)

Sidebar kiri = daftar sesi chat (multi-session, tersimpan di localStorage).
Semua konfigurasi model ada di halaman **Pengaturan** (`/settings`, badge model di topbar juga link ke sana):

- **Provider**: OpenAI / Anthropic (klik kartu)
- **API Key**: per provider, tersimpan di localStorage
- **Base URL**: default `https://api.openai.com/v1` / `https://api.anthropic.com/v1`, bisa diganti (mis. proxy/self-hosted gateway)
- **Model**: dropdown **terisi otomatis dari API provider** (fetch `GET /models` pakai Base URL + API key, debounce saat mengetik). Badge "live dari API" kalau berhasil, fallback ke daftar bawaan kalau gagal. Tombol "Muat ulang" untuk refresh manual.

## Kepribadian (`SOUL.md`)
Kepribadian agent (nama, vibe, gaya bahasa, prinsip menjawab) didefinisikan di **`SOUL.md`** di root repo — ala Hermes. Agent bernama **Faray**. Isinya dibaca live oleh server setiap request (`src/lib/soul.ts` → digabung dengan system prompt teknis), jadi:

- Edit `SOUL.md` → kepribadian berubah **tanpa ubah kode**
- Kalau file hilang, otomatis pakai kepribadian bawaan minimal

## Memory (`MEMORY.md`)

Ingatan jangka panjang ala Hermes:

- Faray otomatis menerima isi `MEMORY.md` setiap request + bisa menyimpan via tool `memory_save` (preferensi, fakta situs demo publik, URL penting) dan menghapus via `memory_forget`
- **Rahasia ditolak otomatis**: pola API key/token/password tidak bisa tersimpan (disuruh ke `/settings`)
- Kapasitas 100 fakta, kelola manual di halaman **`/memory`** (ikon otak di topbar)
- API: `GET /api/memory`, `POST /api/memory` (`save`/`forget`)

## Cara pakai
- "Buka hackernews dan ringkas 5 berita teratas"
- "Buka example.com lalu screenshot"
- "Cek headline detik.com hari ini"

Alur agent: `browser_navigate` → `browser_snapshot` → `browser_get_text` / `click` / `type` / `screenshot`.
Panel preview kanan bisa dipakai manual tanpa API key: ketik URL → Buka → screenshot otomatis.

## Test case Playwright (`/tests`)

Faray bisa membuat + menjalankan automated test:

1. Chat: “buatkan test case login saucedemo dan jalankan” — agent eksplorasi situs, susun test plan (`test_plan` → `.cases.json`: ID, Area, Type, Title, Preconditions, Test Data, Steps, Expected, Priority, Severity), tulis spec modern (`getByRole`/`getByLabel`/locator, nama `test()` = Title), simpan via tool `test_save`, verifikasi via `test_run` (maks 2x percobaan perbaikan), lapor sebagai tabel markdown
2. **Generator di `/tests`**: kartu “Generate test case baru” — isi URL + skenario (+ kredensial demo opsional) → Generate + Run, progress live, spec langsung masuk daftar. Ikon tabel per spec = tabel test case + Status PASS/FAILED dari hasil run terakhir
2. **Generator di `/tests`**: kartu “Generate test case baru” — isi URL + skenario (+ kredensial demo opsional) → Generate + Run, progress live, spec langsung masuk daftar
2. Spec tersimpan di `tests/*.spec.ts`, dikelola di halaman **`/tests`** (topbar ikon flask): lihat kode, run per file / semua, hapus
3. Run manual: `npx playwright test`

## API
- `GET /api/tests` — daftar spec
- `POST /api/tests` — `{ action: "get" | "delete" | "run", file? }`
- `POST /api/chat/stream` — SSE (dipakai UI). Event `init { runId }`, `status { label }` per tahap kerja agent (`Agent is typing…` → `Opening …` → `Thinking…` → `Reading page…` → `Taking screenshot…`), `shot { image, url }`, lalu `done { text, toolCalls, screenshots }`, `aborted {}` (di-interrupt), atau `error { error }`
- `POST /api/chat/cancel` — `{ runId }` → hentikan run agent yang sedang jalan (tombol ■ saat loading; ganti sesi juga otomatis cancel)
- `POST /api/chat` — `{ messages, provider, model, apiKey, baseUrl }` → `{ text, toolCalls, screenshots }` (sekali jalan, tanpa progress)
- `POST /api/models` — `{ provider, apiKey, baseUrl }` → `{ models, source: "live" }`
- `GET /api/browser` — status `{ running, url, playwright }`
- `POST /api/browser` — `{ action: "navigate" | "screenshot" | "text" | "snapshot" | "click" | "type" | "back" | "close", ... }`
