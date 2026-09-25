import { promises as fs } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "tests");

export type ExplorationScope = {
  site: string;
  areas: string[];
  priority: "critical" | "high" | "medium" | "low";
  maxActions: number;
  continue: boolean;
};

export type ExplorationCheckpoint = ExplorationScope & {
  runId: string;
  completedAreas: string[];
  currentArea: string;
  nextArea: string;
  lastAction: string;
  updatedAt: number;
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "exploration";
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function parseExplorationScope(text: string): ExplorationScope {
  const lower = text.toLowerCase();
  const squished = lower.replace(/[^a-z0-9]/g, "");
  const url = text.match(/https?:\/\/[^\s,)]+/i)?.[0] ?? "current site";
  // Generic area vocabulary for any website (matched compaction-wise so
  // "sign up" hits "signup", "user-settings" hits "settings"). Kept to nouns
  // that rarely appear as verbs in instructions; over-scoping is safe because
  // uncovered areas render as Planned/Unverified, never as verified.
  const knownAreas = [
    "login",
    "logout",
    "signup",
    "register",
    "homepage",
    "dashboard",
    "account",
    "products",
    "category",
    "cart",
    "checkout",
    "orders",
    "payment",
    "navigation",
    "dynamic catalog",
    "footer",
    "settings",
    "search",
    "profile",
    "contact",
    "pricing",
    "admin",
  ];
  const areas = unique(
    knownAreas.filter((area) => squished.includes(area.replace(/[^a-z0-9]/g, "")))
  );
  const broadExploration = /\b(explore|all|every|testable)\b/.test(lower);
  const onlyScope = /\bonly\b/.test(lower);
  // Scope rule: 2+ named areas (or 1 named area without broad words, or with
  // "only") = explicit list. Otherwise broad words ("explore all…") fall back
  // to the broad default; a bare prompt with nothing named gets primary flow.
  // Over-scoping is safe: uncovered areas render as Planned/Unverified.
  const broadDefault = ["login", "products", "cart", "checkout", "navigation", "dynamic catalog", "footer"];
  const explicit = areas.length >= 2 || (areas.length === 1 && (!broadExploration || onlyScope));
  const priority = lower.includes("critical") ? "critical" : lower.includes("high") ? "high" : lower.includes("low") ? "low" : "medium";
  const requestedLimit = Number(text.match(/(?:max|limit|about)\s*(\d+)\s*(?:browser\s*)?(?:actions|steps)?/i)?.[1]);
  return {
    site: url,
    areas: explicit ? areas : broadExploration ? broadDefault : ["primary flow"],
    priority,
    maxActions: Number.isFinite(requestedLimit) ? Math.max(1, Math.min(1000, requestedLimit)) : Number.POSITIVE_INFINITY,
    continue: /^\s*(?:\/continue\b|continue\b)/i.test(text),
  };
}

function checkpointFile(site: string) {
  return join(DIR, ".exploration", `${slug(site)}.json`);
}

export async function readExplorationCheckpoint(site: string): Promise<ExplorationCheckpoint | null> {
  try {
    return JSON.parse(await fs.readFile(checkpointFile(site), "utf-8")) as ExplorationCheckpoint;
  } catch {
    return null;
  }
}

export async function saveExplorationCheckpoint(checkpoint: Omit<ExplorationCheckpoint, "updatedAt">) {
  const file = checkpointFile(checkpoint.site);
  await fs.mkdir(join(DIR, ".exploration"), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ ...checkpoint, updatedAt: Date.now() }, null, 2) + "\n", "utf-8");
  return { saved: file.replace(`${DIR}\\`, "").replaceAll("\\", "/") };
}
