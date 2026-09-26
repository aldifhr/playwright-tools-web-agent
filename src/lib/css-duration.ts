// Reads a CSS duration token (e.g. --modal-close-dur) and returns milliseconds.
// getComputedStyle() normalizes "150ms" to "0.15s", so parseFloat() alone
// would yield 0.15 instead of 150 — handle both units explicitly.
export function cssMs(varName: string, fallback: number): number {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
    .toLowerCase();
  if (raw.endsWith("ms")) {
    const ms = parseFloat(raw);
    return Number.isFinite(ms) ? ms : fallback;
  }
  if (raw.endsWith("s")) {
    const s = parseFloat(raw);
    return Number.isFinite(s) ? s * 1000 : fallback;
  }
  return fallback;
}
