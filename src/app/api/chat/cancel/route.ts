import { NextResponse } from "next/server";
import { cancelRun } from "@/lib/runs";

// POST /api/chat/cancel { runId } — hentikan run agent yang sedang jalan.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { runId?: string };
  if (!body.runId) {
    return NextResponse.json({ error: "runId wajib diisi" }, { status: 400 });
  }
  return NextResponse.json({ cancelled: cancelRun(body.runId) });
}
