import { NextResponse } from "next/server";
import { resolveApproval } from "@/lib/approvals";

// POST /api/chat/approve — resolve a pending human-in-the-loop approval.
// Body: { runId, id, approved }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    runId?: string;
    id?: string;
    approved?: boolean;
  };
  if (!body.runId || !body.id || typeof body.approved !== "boolean") {
    return NextResponse.json({ error: "runId, id, and approved are required" }, { status: 400 });
  }
  const ok = resolveApproval(body.runId, body.id, body.approved);
  if (!ok) {
    return NextResponse.json({ error: "approval not found or already resolved" }, { status: 404 });
  }
  return NextResponse.json({ resolved: true, approved: body.approved });
}
