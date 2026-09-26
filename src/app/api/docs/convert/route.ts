import { NextRequest } from "next/server";
import { formatFromExtension, toMarkdownBytes } from "@firecrawl/anydoc";

// POST /api/docs/convert — multipart { file } → { name, markdown }.
// Server-side office-document conversion via anydoc (local only, no OCR:
// scanned PDFs return 422 needs_ocr so the client can fall back).
// Plain-text formats never reach here; the client reads those directly.
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_CHARS = 30_000;
const ALLOWED = new Set([
  "doc", "docx", "docm",
  "ppt", "pps", "pot", "pptx", "pptm", "ppsx", "ppsm",
  "xls", "xlsx", "xlsm", "xlsb",
  "odt", "ods", "odp",
  "rtf", "epub", "csv", "pdf",
]);

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "invalid multipart body" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file field is required" }, { status: 400 });
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED.has(ext)) {
    return Response.json({ error: `extension .${ext || "?"} is not convertible` }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: `file too large (max ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 413 });
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return Response.json({ error: "could not read file" }, { status: 400 });
  }
  try {
    // Explicit format from the extension (needed for signature-less formats
    // like CSV); content sniffing covers the rest when it returns null.
    const markdown = await toMarkdownBytes(bytes, formatFromExtension(ext));
    const text = String(markdown ?? "").slice(0, MAX_CHARS);
    if (!text.trim()) {
      return Response.json({ error: "no readable content in document" }, { status: 422 });
    }
    return Response.json({ name: file.name, markdown: text, truncated: String(markdown ?? "").length > MAX_CHARS });
  } catch (e) {
    const code = typeof (e as { code?: unknown })?.code === "string" ? String((e as { code: string }).code) : "";
    const msg = e instanceof Error ? e.message : "conversion failed";
    if (/ocr/i.test(code) || /ocr|scanned/i.test(msg)) {
      return Response.json({ error: "needs_ocr: scanned pages require OCR, not available locally" }, { status: 422 });
    }
    if (/encrypt/i.test(code) || /encrypt|password/i.test(msg)) {
      return Response.json({ error: "document is encrypted or password-protected" }, { status: 422 });
    }
    return Response.json({ error: `conversion failed: ${msg.slice(0, 200)}` }, { status: 422 });
  }
}
