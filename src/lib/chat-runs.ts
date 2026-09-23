"use client";

// Module-level run tracking that survives component remounts.
// A run keeps streaming when the user switches sessions, tabs, or routes —
// only an explicit Stop (or server cancel/end) terminates it.
// NOTE: a full page reload still drops the client side; the server run
// finishes into a dead stream. In-app navigation is fully covered.

const controllers = new Map<string, AbortController>();

export function trackRun(sessionId: string, ctrl: AbortController) {
  controllers.set(sessionId, ctrl);
}

export function untrackRun(sessionId: string) {
  controllers.delete(sessionId);
}

export function abortRun(sessionId: string) {
  const ctrl = controllers.get(sessionId);
  if (ctrl) {
    controllers.delete(sessionId);
    try {
      ctrl.abort();
    } catch {}
  }
}

export function hasRun(sessionId: string) {
  return controllers.has(sessionId);
}
