import { chromium, Browser, BrowserContext, Page } from "playwright";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let lastUrl = "";

const ALLOWED_COMMANDS = new Set([
  "node",
  "npm",
  "npx",
  "grep",
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "date",
  "echo",
]);
const ALLOWED_READ_DIRS = ["tests", "test-results", "logs", "src"];
const ALLOWED_READ_FILES = ["SOUL.md", "MEMORY.md"];
const MAX_READ = 10_000;

function inside(parent: string, target: string): boolean {
  const rel = relative(resolve(parent), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function parseCommand(raw: string): string[] {
  const args: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && raw[i + 1] && [quote, "\\"].includes(raw[i + 1])) {
        token += raw[++i];
      } else {
        token += char;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "\\" && raw[i + 1] && /[\s'"\\]/.test(raw[i + 1])) {
      token += raw[++i];
    } else if (/\s/.test(char)) {
      if (token) {
        args.push(token);
        token = "";
      }
    } else if (/[|;&<>]/.test(char)) {
      throw new Error("shell operators tidak diizinkan");
    } else {
      token += char;
    }
  }
  if (quote) throw new Error("quote command tidak lengkap");
  if (token) args.push(token);
  return args;
}

async function ensureBrowser(): Promise<Page> {
  if (page && !page.isClosed()) return page;
  // tutup halaman mati tapi pakai ulang browser + context (hindari bocor context)
  try {
    await page?.close().catch(() => null);
  } catch {}
  page = null;
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    context = null;
  }
  if (!context) {
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    });
  }
  page = await context.newPage();
  return page;
}

export async function navigate(url: string) {
  const p = await ensureBrowser();
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) target = "https://" + target;
  await p.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });
  lastUrl = p.url();
  const title = await p.title().catch(() => "");
  return { url: lastUrl, title };
}

export async function getText(limit = 8000) {
  const p = await ensureBrowser();
  const text = await p.evaluate(() => document.body?.innerText ?? "");
  lastUrl = p.url();
  return { url: lastUrl, text: text.slice(0, limit) };
}

export async function snapshot(limit = 12000) {
  const p = await ensureBrowser();
  // Ringkas struktur interaktif: tag, teks, selector hint
  const data = await p.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll("a, button, input, textarea, select, h1, h2, h3, [role=button]")
    ).slice(0, 120);
    return els.map((el, i) => {
      const tag = el.tagName.toLowerCase();
      const text = (el as HTMLElement).innerText?.slice(0, 120) ?? "";
      const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : "";
      const name =
        (el as HTMLInputElement).name ||
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        "";
      const href = el.getAttribute("href") || "";
      return `${i}: <${tag}${id}> ${text} ${name} ${href}`.trim().slice(0, 200);
    });
  });
  lastUrl = p.url();
  const title = await p.title().catch(() => "");
  const joined = data.join("\n").slice(0, limit);
  return { url: lastUrl, title, elements: joined };
}

export async function click(selector: string) {
  const p = await ensureBrowser();
  // dukung index dari snapshot "12: ..." -> klik elemen ke-12
  const idx = /^\d+$/.test(selector.trim())
    ? parseInt(selector.trim(), 10)
    : null;
  if (idx !== null) {
    const ok = await p.evaluate((i) => {
      const els = Array.from(
        document.querySelectorAll(
          "a, button, input, textarea, select, h1, h2, h3, [role=button]"
        )
      );
      const el = els[i] as HTMLElement | undefined;
      if (!el) return false;
      el.scrollIntoView();
      (el as HTMLElement).click();
      return true;
    }, idx);
    if (!ok) throw new Error(`Elemen index ${idx} tidak ditemukan`);
    await p.waitForTimeout(1200);
    return { url: p.url(), title: await p.title().catch(() => "") };
  }
  await p.click(selector, { timeout: 10000 });
  await p.waitForTimeout(800);
  return { url: p.url(), title: await p.title().catch(() => "") };
}

export async function typeText(selector: string, text: string, submit = false) {
  const p = await ensureBrowser();
  await p.fill(selector, text, { timeout: 10000 });
  // verifikasi nilai benar-benar masuk (ground truth untuk model)
  const readBack = () =>
    p
      .$eval(
        selector,
        (el) => (el as HTMLInputElement).value ?? ""
      )
      .catch(() => "");
  let actual = await readBack();
  if (actual !== text) {
    // retry: fokus + select-all + ketik manual (untuk input React yang bandel)
    await p.click(selector, { timeout: 10000 }).catch(() => null);
    await p.keyboard.press("ControlOrMeta+a").catch(() => null);
    await p.keyboard.type(text, { delay: 20 });
    actual = await readBack();
  }
  if (submit) await p.keyboard.press("Enter");
  await p.waitForTimeout(800);
  return { url: p.url(), filled: actual === text, length: actual.length };
}

export async function screenshot(fullPage = false): Promise<{ image: string; url: string }> {
  const p = await ensureBrowser();
  const buf = await p.screenshot({ fullPage, type: "png" });
  lastUrl = p.url();
  return {
    image: `data:image/png;base64,${buf.toString("base64")}`,
    url: lastUrl,
  };
}

export async function goBack() {
  const p = await ensureBrowser();
  await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
  return { url: p.url() };
}

export async function getStatus() {
  return {
    running: !!page && !page.isClosed(),
    url: page && !page.isClosed() ? page.url() : lastUrl || null,
  };
}

export async function closeBrowser() {
  try {
    await page?.close().catch(() => null);
  } catch {}
  page = null;
  return { closed: true };
}

export async function killBrowser() {
  try {
    await context?.close().catch(() => null);
  } catch {}
  try {
    await browser?.close().catch(() => null);
  } catch {}
  page = null;
  context = null;
  browser = null;
  return { closed: true };
}

export async function bash(command: string) {
  const raw = String(command ?? "").trim();
  if (!raw || raw.length > 500) throw new Error("command kosong atau terlalu panjang");
  // Do not invoke a shell: metacharacters and pipelines are intentionally rejected.
  const parts = parseCommand(raw);
  const executable = parts.shift()?.toLowerCase() ?? "";
  if (!ALLOWED_COMMANDS.has(executable)) {
    throw new Error(`Command '${executable}' tidak diizinkan`);
  }
  console.info(`[browser_bash] ${raw}`);
  return new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolvePromise, reject) => {
    execFile(executable, parts, {
      cwd: process.cwd(),
      timeout: 10_000,
      // Allow the process to finish; the response below still caps output.
      maxBuffer: 64_000,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
        resolvePromise({
          exitCode: 1,
          stdout: String(stdout).slice(0, 5_000),
          stderr: "output dipotong karena melebihi batas buffer",
        });
        return;
      }
      if (error && typeof error.code !== "number") {
        reject(error);
        return;
      }
      resolvePromise({
        exitCode: typeof error?.code === "number" ? error.code : 0,
        stdout: String(stdout).slice(0, 5_000),
        stderr: String(stderr).slice(0, 1_000),
      });
    });
  });
}

export async function readFile(path: string, limit = MAX_READ) {
  const root = process.cwd();
  const requested = String(path ?? "").trim();
  if (!requested) throw new Error("path wajib diisi");
  const candidate = resolve(root, requested);
  const realPath = await fs.realpath(candidate).catch(() => {
    throw new Error("file tidak ditemukan");
  });
  const allowed =
    ALLOWED_READ_DIRS.some((dir) => inside(resolve(root, dir), realPath)) ||
    ALLOWED_READ_FILES.some((file) => realPath === resolve(root, file));
  if (!allowed) {
    throw new Error("path tidak diizinkan; hanya tests/, test-results/, logs/, src/, SOUL.md, dan MEMORY.md");
  }
  const safeLimit = Math.max(1, Math.min(Number(limit) || MAX_READ, MAX_READ));
  const content = await fs.readFile(realPath, "utf8");
  return { path: realPath, size: content.length, content: content.slice(0, safeLimit) };
}
