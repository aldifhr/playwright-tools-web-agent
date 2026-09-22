import { tool } from "ai";
import { z } from "zod";
import * as browser from "./browser";
import { saveSpec, runSpec, saveCases, recordRun, listSpecs } from "./specs";
import { saveFact, forgetFact } from "./memory";
import { RUN_CANCELLED } from "./runs";
import { recordToolLog } from "./tool-logs";

const TestCaseSchema = z.object({
  id: z.string().describe("ID unik, mis. TC-001"),
  area: z.string().describe("Area/fitur, mis. Login"),
  type: z.string().describe("Positive / Negative / Boundary / dst"),
  title: z.string().describe("Judul case — HARUS sama persis dengan nama test() di spec"),
  preconditions: z.string().optional().default(""),
  testData: z.string().optional().default(""),
  steps: z.array(z.string()).describe("Langkah 1,2,3…"),
  expected: z.string().describe("Hasil yang diharapkan"),
  priority: z.enum(["High", "Medium", "Low"]).optional().default("Medium"),
  severity: z.enum(["High", "Medium", "Low"]).optional().default("Medium"),
});

export { statusLabel, IDLE_STATUS, THINKING_STATUS } from "./agent-status";

// Dipakai /api/chat (sekali jalan) dan /api/chat/stream (SSE per-step).
// onCall dipanggil TEPAT SEBELUM tool dieksekusi → cocok untuk status real-time.
// shouldAbort dicek sebelum tiap tool → implementasi interrupt.
export function getBrowserTools(
  onCall?: (toolName: string, input: unknown) => void,
  shouldAbort?: () => boolean,
  delegateTask?: (task: string) => Promise<unknown>
) {
  const wrap = <T extends object>(
    toolName: string,
    fn: (input: T) => Promise<unknown>
  ) => {
    return async (input: T) => {
      if (shouldAbort?.()) throw new Error(RUN_CANCELLED);
      try {
        onCall?.(toolName, input);
      } catch {}
      const started = Date.now();
      try {
        const output = await fn(input);
        const loggedInput = toolName === "browser_type"
          ? { ...input, text: "[redacted]" }
          : input;
        void recordToolLog({
          tool: toolName,
          status: "success",
          durationMs: Date.now() - started,
          input: loggedInput,
          output,
        });
        return output;
      } catch (error) {
        const loggedInput = toolName === "browser_type"
          ? { ...input, text: "[redacted]" }
          : input;
        void recordToolLog({
          tool: toolName,
          status: "error",
          durationMs: Date.now() - started,
          input: loggedInput,
          error: error instanceof Error ? error.message : "tool gagal",
        });
        throw error;
      }
    };
  };

  return {
    browser_navigate: tool({
      description: "Buka URL di browser otomatis",
      inputSchema: z.object({ url: z.string().describe("URL lengkap") }),
      execute: wrap("browser_navigate", async ({ url }: { url: string }) =>
        browser.navigate(url)
      ),
    }),
    browser_snapshot: tool({
      description: "Lihat struktur elemen halaman aktif",
      inputSchema: z.object({}),
      execute: wrap("browser_snapshot", async () => browser.snapshot()),
    }),
    browser_get_text: tool({
      description: "Ambil teks isi halaman",
      inputSchema: z.object({}),
      execute: wrap("browser_get_text", async () => browser.getText()),
    }),
    browser_click: tool({
      description:
        "Klik elemen. Bisa selector CSS atau index angka dari snapshot.",
      inputSchema: z.object({ selector: z.string() }),
      execute: wrap("browser_click", async ({ selector }: { selector: string }) =>
        browser.click(selector)
      ),
    }),
    browser_type: tool({
      description: "Isi input form",
      inputSchema: z.object({
        selector: z.string(),
        text: z.string(),
        submit: z.boolean().optional().default(false),
      }),
      execute: wrap(
        "browser_type",
        async ({
          selector,
          text,
          submit,
        }: {
          selector: string;
          text: string;
          submit?: boolean;
        }) => browser.typeText(selector, text, submit)
      ),
    }),
    browser_screenshot: tool({
      description: "Ambil screenshot halaman aktif (PNG base64)",
      inputSchema: z.object({
        fullPage: z.boolean().optional().default(false),
      }),
      execute: wrap(
        "browser_screenshot",
        async ({ fullPage }: { fullPage?: boolean }) =>
          browser.screenshot(!!fullPage)
      ),
    }),
    browser_go_back: tool({
      description: "Kembali ke halaman sebelumnya",
      inputSchema: z.object({}),
      execute: wrap("browser_go_back", async () => browser.goBack()),
    }),
    browser_close: tool({
      description: "Tutup browser",
      inputSchema: z.object({}),
      execute: wrap("browser_close", async () => browser.closeBrowser()),
    }),
    browser_bash: tool({
      description: "Jalankan command terbatas tanpa shell (npm, node, grep, ls, dan command aman lain)",
      inputSchema: z.object({ command: z.string().min(1).max(500) }),
      execute: wrap("browser_bash", async ({ command }: { command: string }) =>
        browser.bash(command)
      ),
    }),
    browser_read_file: tool({
      description: "Baca file secara read-only dari tests/, test-results/, logs/, src/, SOUL.md, atau MEMORY.md",
      inputSchema: z.object({
        path: z.string().min(1),
        limit: z.number().int().positive().max(10000).optional(),
      }),
      execute: wrap(
        "browser_read_file",
        async ({ path, limit }: { path: string; limit?: number }) =>
          browser.readFile(path, limit)
      ),
    }),
    browser_delegate: tool({
      description: "Delegasikan subtask QA terkontrol ke sub-agent khusus eksplorasi atau test planning",
      inputSchema: z.object({ task: z.string().min(1).max(2_000) }),
      execute: wrap("browser_delegate", async ({ task }: { task: string }) => {
        if (!delegateTask) throw new Error("sub-agent tidak tersedia pada mode ini");
        return delegateTask(task);
      }),
    }),
    test_save: tool({
      description:
        "Simpan file test Playwright (.spec.ts) ke folder tests/. Pakai setelah eksplorasi situs.",
      inputSchema: z.object({
        file: z
          .string()
          .describe("nama file, mis. login-saucedemo.spec.ts"),
        content: z.string().describe("isi spec lengkap"),
      }),
      execute: wrap(
        "test_save",
        async ({ file, content }: { file: string; content: string }) =>
          saveSpec(file, content)
      ),
    }),
    test_run: tool({
      description:
        "Jalankan test Playwright dan kembalikan hasilnya (passed/failed + error).",
      inputSchema: z.object({
        file: z
          .string()
          .optional()
          .describe(
            "nama file spesifik; kosongkan untuk menjalankan semua test"
          ),
      }),
      execute: wrap("test_run", async ({ file }: { file?: string }) => {
        const summary = await runSpec(file || undefined);
        await recordRun(file || null, summary);
        return summary;
      }),
    }),
    memory_save: tool({
      description:
        "Simpan fakta tahan lama ke ingatan (preferensi user, fakta situs demo publik, URL penting). JANGAN untuk password/API key/token.",
      inputSchema: z.object({
        fact: z.string().describe("satu fakta singkat, satu baris"),
      }),
      execute: wrap("memory_save", async ({ fact }: { fact: string }) =>
        saveFact(fact)
      ),
    }),
    memory_forget: tool({
      description: "Hapus fakta usang dari ingatan berdasarkan kata kunci.",
      inputSchema: z.object({
        query: z.string().describe("kata kunci fakta yang mau dihapus"),
      }),
      execute: wrap("memory_forget", async ({ query }: { query: string }) =>
        forgetFact(query)
      ),
    }),
    test_plan: tool({
      description:
        "Simpan daftar test case terstruktur (ID, Area, Type, Title, Preconditions, TestData, Steps, Expected, Priority, Severity) sebagai .cases.json. Dipakai SEBELUM test_save.",
      inputSchema: z.object({
        file: z
          .string()
          .describe("nama dasar file, mis. login-saucedemo.spec.ts"),
        cases: z.array(TestCaseSchema).min(1).max(50),
      }),
      execute: wrap(
        "test_plan",
        async ({
          file,
          cases,
        }: {
          file: string;
          cases: z.infer<typeof TestCaseSchema>[];
        }) => saveCases(file, cases)
      ),
    }),
    test_list: tool({
      description:
        "Lihat daftar file spec (.spec.ts) yang sudah tersimpan di folder tests/.",
      inputSchema: z.object({}),
      execute: wrap("test_list", async () => listSpecs()),
    }),
  };
}
