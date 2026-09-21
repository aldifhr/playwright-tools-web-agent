import { chromium, Browser, BrowserContext, Page } from "playwright";

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let lastUrl = "";

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
