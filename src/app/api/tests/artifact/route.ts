import { NextResponse } from "next/server";
import { readFile, realpath } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { guardApi } from "@/lib/api-guard";

// GET /api/tests/artifact?path=test-results/... — sajikan trace/video/screenshot.
// Path wajib di dalam ./test-results (cegah traversal).
export async function GET(req: Request) {
  const blocked = guardApi(req, { scope: "artifact", limit: 60 });
  if (blocked) return blocked;
  const { searchParams } = new URL(req.url);
  const rel = searchParams.get("path") ?? "";
  const norm = normalize(rel);

  if (
    !rel ||
    norm.startsWith("..") ||
    !norm.split(sep).includes("test-results")
  ) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  const abs = join(/*turbopackIgnore: true*/ process.cwd(), norm);
  const root = join(process.cwd(), "test-results") + sep;
  if (!abs.startsWith(root)) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  try {
    // Resolve symlinks: a symlink inside test-results must not escape it.
    const real = await realpath(abs).catch(() => null);
    if (!real || !(real + sep).startsWith(root) && real !== join(process.cwd(), "test-results")) {
      return NextResponse.json({ error: "invalid path" }, { status: 400 });
    }
    const buf = await readFile(real);
    const ext = norm.split(".").pop()?.toLowerCase();
    const type =
      ext === "webm"
        ? "video/webm"
        : ext === "png"
          ? "image/png"
          : ext === "zip"
            ? "application/zip"
            : "application/octet-stream";
    const rawName = norm.split(sep).pop() ?? "artifact";
    const name = rawName.replace(/["\r\n]/g, "").slice(0, 120) || "artifact";
    const dl = searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(buf.length),
        ...(dl ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }
}
