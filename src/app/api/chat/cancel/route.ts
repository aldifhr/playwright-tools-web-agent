import { NextResponse } from "next/server";
import { z } from "zod";
import { cancelRun } from "@/lib/runs";
import { guardApi } from "@/lib/api-guard";

// POST /api/chat/cancel { runId } — hentikan run agent yang sedang jalan.
export async function POST(req: Request) {
  const blocked = guardApi(req, { scope: "cancel", limit: 60 });
  if (blocked) return blocked;
  const parsed = z.object({ runId: z.string().min(1).max(100) }).safeParse(
    await req.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }
  const body = parsed.data;
  return NextResponse.json({ cancelled: cancelRun(body.runId) });
}
