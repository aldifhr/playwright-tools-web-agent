import { NextResponse } from "next/server";
import { clearToolLogs, loadToolLogs } from "@/lib/tool-logs";
import { guardApi } from "@/lib/api-guard";


export async function GET(req: Request) {
  const blocked = guardApi(req, { scope: "logs" });
  if (blocked) return blocked;
  return NextResponse.json({ logs: await loadToolLogs() });
}

export async function DELETE(req: Request) {
  const blocked = guardApi(req, { scope: "logs" });
  if (blocked) return blocked;
  await clearToolLogs();
  return NextResponse.json({ cleared: true });
}
