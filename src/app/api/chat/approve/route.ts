import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApproval, setAlwaysAllow } from "@/lib/approvals";
import { guardApi } from "@/lib/api-guard";

// POST /api/chat/approve — resolve a pending human-in-the-loop approval.
// Body: { runId, id, approved, always? } — always:true also auto-approves
// every later sensitive tool in the same run.
export async function POST(req: Request) {
  const blocked = guardApi(req, { scope: "approve", limit: 60 });
  if (blocked) return blocked;
  const parsed = z.object({
    runId: z.string().min(1).max(100),
    id: z.string().min(1).max(100),
    approved: z.boolean(),
    always: z.boolean().optional(),
  }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "runId, id, and approved are required" }, { status: 400 });
  }
  const body = parsed.data;
  const ok = resolveApproval(body.runId, body.id, body.approved);
  if (!ok) {
    return NextResponse.json({ error: "approval not found or already resolved" }, { status: 404 });
  }
  if (body.approved && body.always) setAlwaysAllow(body.runId);
  return NextResponse.json({ resolved: true, approved: body.approved, always: body.approved && !!body.always });
}
