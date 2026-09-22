import { NextResponse } from "next/server";
import { z } from "zod";
import { cancelRun } from "@/lib/runs";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

// POST /api/chat/cancel { runId } — hentikan run agent yang sedang jalan.
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (auth) return auth;
  const limited = rateLimit(`cancel:${clientKey(req)}`, 60, 60_000);
  if (limited) return limited;
  const parsed = z.object({ runId: z.string().min(1).max(100) }).safeParse(
    await req.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }
  const body = parsed.data;
  return NextResponse.json({ cancelled: cancelRun(body.runId) });
}
