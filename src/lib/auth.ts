import { NextResponse } from "next/server";

// Server-only: opt-in bearer auth for every /api/* route.
// - APP_TOKEN unset (default local use) → open, no friction.
// - APP_TOKEN set → all API routes require `Authorization: Bearer <token>`.
// Set APP_TOKEN whenever the server is reachable beyond localhost.
export function requireAuth(req: Request): NextResponse | null {
  const token = process.env.APP_TOKEN?.trim();
  if (!token) return null;
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (presented && presented.length === token.length) {
    let diff = 0;
    for (let i = 0; i < token.length; i++) {
      diff |= token.charCodeAt(i) ^ presented.charCodeAt(i);
    }
    if (diff === 0) return null;
  }
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
