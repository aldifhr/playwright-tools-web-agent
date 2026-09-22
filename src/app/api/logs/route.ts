import { NextResponse } from "next/server";
import { clearToolLogs, loadToolLogs } from "@/lib/tool-logs";

export async function GET() {
  return NextResponse.json({ logs: await loadToolLogs() });
}

export async function DELETE() {
  await clearToolLogs();
  return NextResponse.json({ cleared: true });
}
