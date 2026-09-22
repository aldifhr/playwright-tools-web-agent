import { NextResponse } from "next/server";
import { getSystemPromptSections } from "@/lib/soul";

// GET /api/prompt — inspect the composed system prompt, split per section.
// No secrets here: provider keys live in the browser's localStorage, the
// project block is appended per-request from client-sent project data.
export async function GET() {
  try {
    const sections = getSystemPromptSections();
    const total = sections.reduce((a, s) => a + s.chars, 0);
    return NextResponse.json({ sections, total });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}
