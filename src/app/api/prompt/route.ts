import { NextResponse } from "next/server";
import { getSystemPromptSections } from "@/lib/soul";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

// GET /api/prompt — inspect the composed system prompt, split per section.
// No secrets here: provider keys live in the browser's localStorage, the
// project block is appended per-request from client-sent project data.
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (auth) return auth;
  const limited = rateLimit(`prompt:${clientKey(req)}`, 60, 60_000);
  if (limited) return limited;
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
