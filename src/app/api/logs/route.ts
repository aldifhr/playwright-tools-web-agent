import { NextResponse } from "next/server";
import { clearToolLogs, loadToolLogs } from "@/lib/tool-logs";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

function guard(req: Request) {
  return requireAuth(req) ?? rateLimit(`logs:${clientKey(req)}`, 60, 60_000);
}

export async function GET(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  return NextResponse.json({ logs: await loadToolLogs() });
}

export async function DELETE(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  await clearToolLogs();
  return NextResponse.json({ cleared: true });
}
