import { randomUUID } from "node:crypto";

// Server-only: human-in-the-loop approvals for sensitive tools.
// A tool execution suspends on a promise; the client resolves it through
// POST /api/chat/approve. Cancelling or ending a run denies everything pending.

export type ApprovalRequest = {
  id: string;
  runId: string;
  tool: string;
  input: unknown;
  createdAt: number;
};

const pending = new Map<string, (approved: boolean) => void>();
// Runs the user marked "always allow": sensitive tools skip the prompt.
const alwaysAllow = new Set<string>();

function key(runId: string, id: string) {
  return `${runId}:${id}`;
}

function prune() {
  // Best-effort: entries are always settled by resolve/reject/endRun,
  // this only guards against leaks from crashed runs. Evicted entries
  // resolve false (deny) so no tool waits forever.
  if (pending.size > 200) {
    const first = pending.keys().next();
    if (!first.done) {
      const resolvePromise = pending.get(first.value);
      pending.delete(first.value);
      resolvePromise?.(false);
    }
  }
}

export function createApproval(runId: string): { id: string; promise: Promise<boolean> } {
  prune();
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  const promise = new Promise<boolean>((resolvePromise) => {
    pending.set(key(runId, id), resolvePromise);
  });
  return { id, promise };
}

export function resolveApproval(runId: string, id: string, approved: boolean): boolean {
  const k = key(String(runId ?? ""), String(id ?? ""));
  const resolvePromise = pending.get(k);
  if (!resolvePromise) return false;
  pending.delete(k);
  resolvePromise(approved);
  return true;
}

// Deny everything waiting on a run (cancel, abort, run end).
export function rejectRunApprovals(runId: string) {
  const prefix = `${String(runId ?? "")}:`;
  for (const [k, resolvePromise] of pending) {
    if (k.startsWith(prefix)) {
      pending.delete(k);
      resolvePromise(false);
    }
  }
  alwaysAllow.delete(String(runId ?? ""));
}

export function setAlwaysAllow(runId: string) {
  alwaysAllow.add(String(runId ?? ""));
}

export function isAlwaysAllowed(runId: string): boolean {
  return alwaysAllow.has(String(runId ?? ""));
}
