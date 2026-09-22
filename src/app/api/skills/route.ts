import { NextResponse } from "next/server";
import { installSkill, listInstalledSkills, removeSkill, searchSkills } from "@/lib/skills";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json({ skills: await searchSkills(query), installed: await listInstalledSkills() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load skills" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; id?: string };
    if (!body.id) return NextResponse.json({ error: "skill id is required" }, { status: 400 });
    if (body.action === "remove") return NextResponse.json(await removeSkill(body.id));
    return NextResponse.json(await installSkill(body.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to install skill" }, { status: 400 });
  }
}
