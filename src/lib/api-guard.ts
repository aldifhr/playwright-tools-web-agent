import { NextResponse } from "next/server";
import { requireAuth } from "./auth";
import { clientKey, rateLimit } from "./rate-limit";

// Server-only: one-line guard for every /api/* route.
// Runs bearer auth (when APP_TOKEN is set) then a per-IP rate limit.
// Returns a Response to short-circuit with, or null to proceed.
//
//   const blocked = guardApi(req, { scope: "memory" });
//   if (blocked) return blocked;
export function guardApi(
  req: Request,
  options?: { scope?: string; limit?: number; windowMs?: number }
): NextResponse | null {
  const auth = requireAuth(req);
  if (auth) return auth;
  const scope = options?.scope ?? "api";
  return rateLimit(
    `${scope}:${clientKey(req)}`,
    options?.limit ?? 60,
    options?.windowMs ?? 60_000
  );
}
