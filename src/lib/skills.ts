import { promises as fs, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://skills.sh/api/v1";
const SKILLS_DIR = join(process.cwd(), ".skills");
const AGENT_SKILLS_DIR = join(process.cwd(), ".agents", "skills");
const MAX_SKILL_SIZE = 80_000;
const TRUSTED_AGENT_SKILLS = new Set([
  "playwright-best-practices",
  "playwright-explore-website",
  "playwright-stealth-verify",
  "senior-qa-engineer",
]);

const FALLBACK_SKILLS: SkillSummary[] = [
  { id: "vercel-labs/agent-browser/agent-browser", slug: "agent-browser", name: "agent-browser", source: "vercel-labs/agent-browser", installs: 901200, url: "https://skills.sh/vercel-labs/agent-browser/agent-browser", installUrl: "https://github.com/vercel-labs/agent-browser" },
  { id: "anthropics/skills/frontend-design", slug: "frontend-design", name: "frontend-design", source: "anthropics/skills", installs: 909200, url: "https://skills.sh/anthropics/skills/frontend-design", installUrl: "https://github.com/anthropics/skills" },
  { id: "obra/superpowers/systematic-debugging", slug: "systematic-debugging", name: "systematic-debugging", source: "obra/superpowers", installs: 266800, url: "https://skills.sh/obra/superpowers/systematic-debugging", installUrl: "https://github.com/obra/superpowers" },
  { id: "mattpocock/skills/diagnosing-bugs", slug: "diagnosing-bugs", name: "diagnosing-bugs", source: "mattpocock/skills", installs: 642400, url: "https://skills.sh/mattpocock/skills/diagnosing-bugs", installUrl: "https://github.com/mattpocock/skills" },
  { id: "vercel-labs/agent-skills/web-design-guidelines", slug: "web-design-guidelines", name: "web-design-guidelines", source: "vercel-labs/agent-skills", installs: 655000, url: "https://skills.sh/vercel-labs/agent-skills/web-design-guidelines", installUrl: "https://github.com/vercel-labs/agent-skills" },
];

export type SkillSummary = {
  id: string;
  slug: string;
  name: string;
  source: string;
  installs: number;
  sourceType?: string;
  installUrl?: string | null;
  url: string;
};

function skillPath(id: string) {
  const parts = id.split("/").filter(Boolean);
  if (parts.length < 2 || parts.some((part) => !/^[a-zA-Z0-9._-]+$/.test(part))) {
    throw new Error("Invalid skill id");
  }
  return join(SKILLS_DIR, parts.join("--"));
}

function apiDetailPath(id: string) {
  return `${API}/skills/${id.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;
}

export async function searchSkills(query: string) {
  const url = query.trim().length >= 2
    ? `${API}/skills/search?q=${encodeURIComponent(query.trim())}&limit=30`
    : `${API}/skills?view=trending&per_page=30`;
  const response = await fetch(url, { next: { revalidate: 60 } });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const normalized = query.trim().toLowerCase();
      return normalized.length >= 2
        ? FALLBACK_SKILLS.filter((skill) => `${skill.name} ${skill.source}`.toLowerCase().includes(normalized))
        : FALLBACK_SKILLS;
    }
    throw new Error(`skills.sh request failed (${response.status})`);
  }
  const data = await response.json() as { data?: SkillSummary[] };
  return data.data ?? [];
}

export async function installSkill(id: string) {
  const response = await fetch(apiDetailPath(id), { next: { revalidate: 300 } });
  let skillFile: { path: string; contents: string } | undefined;
  if (response.ok) {
    const data = await response.json() as { id?: string; files?: { path: string; contents: string }[] };
    skillFile = data.files?.find((file) => file.path.toLowerCase() === "skill.md");
  } else if (response.status === 401 || response.status === 403) {
    const parts = id.split("/").filter(Boolean);
    const repo = parts.slice(0, 2).join("/");
    const slug = parts.at(-1);
    const candidates = [`skills/${slug}/SKILL.md`, `${slug}/SKILL.md`, "SKILL.md"];
    for (const candidate of candidates) {
      const raw = await fetch(`https://raw.githubusercontent.com/${repo}/main/${candidate}`);
      if (raw.ok) {
        skillFile = { path: "SKILL.md", contents: await raw.text() };
        break;
      }
    }
  } else {
    throw new Error(`Skill not found (${response.status})`);
  }
  if (!skillFile?.contents) throw new Error("This skill does not contain SKILL.md");
  if (skillFile.contents.length > MAX_SKILL_SIZE) throw new Error("SKILL.md is too large");
  const directory = skillPath(id);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(join(directory, "SKILL.md"), skillFile.contents, "utf8");
  await fs.writeFile(join(directory, "source.json"), JSON.stringify({ id, installedAt: Date.now() }, null, 2), "utf8");
  return { id, directory: ".skills/" + id.split("/").join("--"), size: skillFile.contents.length };
}

export async function listInstalledSkills() {
  try {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function loadInstalledSkills() {
  const directories = await listInstalledSkills();
  const loaded: { id: string; content: string }[] = [];
  for (const directory of directories) {
    try {
      const content = await fs.readFile(join(SKILLS_DIR, directory, "SKILL.md"), "utf8");
      loaded.push({ id: directory.replaceAll("--", "/"), content: content.slice(0, MAX_SKILL_SIZE) });
    } catch {}
  }
  return loaded;
}

export function loadInstalledSkillsSync() {
  try {
    const roots = [
      { directory: SKILLS_DIR, allow: () => true },
      { directory: AGENT_SKILLS_DIR, allow: (name: string) => TRUSTED_AGENT_SKILLS.has(name) },
    ];
    return roots.flatMap(({ directory, allow }) => {
      try {
        return readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && allow(entry.name))
          .flatMap((entry) => {
            try {
              return [{ id: entry.name.replaceAll("--", "/"), content: readFileSync(join(directory, entry.name, "SKILL.md"), "utf8").slice(0, MAX_SKILL_SIZE) }];
            } catch {
              return [];
            }
          });
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export async function removeSkill(id: string) {
  await fs.rm(skillPath(id), { recursive: true, force: true });
  return { removed: id };
}
