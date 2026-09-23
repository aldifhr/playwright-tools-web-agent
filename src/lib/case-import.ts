// Client-side importer: spreadsheet rows (XLSX/CSV) -> structured test cases.
// Header matching is forgiving (aliases, case-insensitive); step cells like
// "1. Open page 2. Click login" are split into per-step entries.

export type ImportedCase = {
  id: string;
  area: string;
  type: string;
  title: string;
  preconditions: string;
  testData: string;
  steps: string[];
  expected: string;
  priority: string;
  severity: string;
};

const HEADER_ALIASES: Record<string, string[]> = {
  id: ["id", "caseid", "testid", "no"],
  area: ["area", "module", "feature", "component"],
  type: ["type", "category", "testtype"],
  title: ["title", "testcase", "casetitle", "scenario", "testtitle", "name"],
  preconditions: ["preconditions", "precondition", "preconditions", "prerequisite", "precond"],
  testData: ["testdata", "data", "testinput", "input"],
  steps: ["steps", "step", "teststep", "teststeps", "procedure"],
  expected: ["expected", "expectedresult", "expectedoutput", "expectation"],
  priority: ["priority", "prio"],
  severity: ["severity", "sev"],
};

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function headerMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normed = headers.map(normHeader);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normed.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

function splitSteps(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s ?? "").trim()).filter(Boolean).slice(0, 20);
  }
  const text = String(raw ?? "").trim();
  if (!text) return [];
  // "1. Open page 2. Click login" or newline-separated steps.
  const parts = text
    .split(/\r?\n|(?<=\S)\s*(?=\d+[.)]\s+\S)/)
    .map((s) => s.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  return parts.slice(0, 20);
}

function level(raw: unknown): string {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v.startsWith("h")) return "High";
  if (v.startsWith("l")) return "Low";
  return "Medium";
}

export function rowsToCases(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  opts?: { areaFallback?: string; idPrefix?: string }
): ImportedCase[] {
  const map = headerMap(headers);
  if (map.id === undefined && map.title === undefined) {
    throw new Error("No ID or Title column found — cannot import");
  }
  const cases: ImportedCase[] = [];
  const seen = new Set<string>();
  const areaFallback = opts?.areaFallback ?? "";
  const idPrefix = opts?.idPrefix ?? "TC";
  for (const row of rows) {
    const cell = (field: string) => {
      const idx = map[field];
      if (idx === undefined) return "";
      return String(row[idx] ?? "").trim();
    };
    const id = cell("id");
    const title = cell("title");
    if (!id && !title) continue;
    let finalId = id || `${idPrefix}-${String(cases.length + 1).padStart(3, "0")}`;
    let n = 2;
    while (seen.has(finalId)) {
      finalId = `${id || `${idPrefix}-${String(cases.length + 1).padStart(3, "0")}`}-${n}`;
      n += 1;
    }
    seen.add(finalId);
    cases.push({
      id: finalId,
      area: cell("area") || areaFallback,
      type: cell("type") || "Positive",
      title: title || id,
      preconditions: cell("preconditions"),
      testData: cell("testData"),
      steps: splitSteps(map.steps !== undefined ? row[map.steps] : ""),
      expected: cell("expected"),
      priority: level(cell("priority")),
      severity: level(cell("severity")),
    });
  }
  if (!cases.length) throw new Error("No importable rows found");
  return cases.slice(0, 50);
}

export function suggestFileName(uploadName: string): string {
  const base = uploadName.replace(/\.(xlsx|xls|csv)$/i, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "imported";
  return `${base}.spec.ts`;
}
