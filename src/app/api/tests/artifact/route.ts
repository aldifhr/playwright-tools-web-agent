import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";

// GET /api/tests/artifact?path=test-results/... — sajikan trace/video/screenshot.
// Path wajib di dalam ./test-results (cegah traversal).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rel = searchParams.get("path") ?? "";
  const norm = normalize(rel);

  if (
    !rel ||
    norm.startsWith("..") ||
    !norm.split(sep).includes("test-results")
  ) {
    return NextResponse.json({ error: "path tidak valid" }, { status: 400 });
  }

  const abs = join(process.cwd(), norm);
  const root = join(process.cwd(), "test-results") + sep;
  if (!abs.startsWith(root)) {
    return NextResponse.json({ error: "path tidak valid" }, { status: 400 });
  }

  try {
    const buf = await readFile(abs);
    const ext = norm.split(".").pop()?.toLowerCase();
    const type =
      ext === "webm"
        ? "video/webm"
        : ext === "png"
          ? "image/png"
          : ext === "zip"
            ? "application/zip"
            : "application/octet-stream";
    const name = norm.split(sep).pop() ?? "artifact";
    const dl = searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(buf.length),
        ...(dl ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "file tidak ditemukan" }, { status: 404 });
  }
}
