import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApproval } from "@/lib/approvals";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

// POST /api/chat/approve — resolve a pending human-in-the-loop approval.
// Body: { runId, id, approved }
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (auth) return auth;
  const limited = rateLimit(`approve:${clientKey(req)}`, 60, 60_000);
  if (limited) return limited;
  const parsed = z.object({
    runId: z.string().min(1).max(100),
    id: z.string().min(1).max(100),
    approved: z.boolean(),
  }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "runId, id, and approved are required" }, { status: 400 });
  }
  const body = parsed.data;
  const ok = resolveApproval(body.runId, body.id, body.approved);
  if (!ok) {
    return NextResponse.json({ error: "approval not found or already resolved" }, { status: 404 });
  }
  return NextResponse.json({ resolved: true, approved: body.approved });
}
