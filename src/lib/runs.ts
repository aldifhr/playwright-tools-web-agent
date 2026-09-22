// Server-only: registrasi run agent yang bisa di-interrupt.
// Satu run = satu request /api/chat/stream. tools + loop cek flag ini.
import { rejectRunApprovals } from "./approvals";

const runs = new Map<string, { cancelled: boolean; createdAt: number }>();
const TTL_MS = 10 * 60_000;

function prune() {
  const now = Date.now();
  for (const [id, r] of runs) {
    if (now - r.createdAt > TTL_MS) runs.delete(id);
  }
  if (runs.size > 200) {
    const sorted = [...runs.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < runs.size - 200; i++) runs.delete(sorted[i][0]);
  }
}

export function createRun(): string {
  prune();
  const id =
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  runs.set(id, { cancelled: false, createdAt: Date.now() });
  return id;
}

export function cancelRun(id: string): boolean {
  const r = runs.get(String(id ?? ""));
  if (!r) return false;
  r.cancelled = true;
  // A cancelled run must never hang waiting for a user decision.
  rejectRunApprovals(String(id ?? ""));
  return true;
}

export function isCancelled(id: string): boolean {
  return runs.get(String(id ?? ""))?.cancelled ?? false;
}

export function endRun(id: string) {
  runs.delete(String(id ?? ""));
}

export const RUN_CANCELLED = "__RUN_CANCELLED__";
