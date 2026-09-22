import { NextResponse } from "next/server";
import { z } from "zod";
import { listFacts, saveFact, forgetFact } from "@/lib/memory";
import { guardApi } from "@/lib/api-guard";

const MemoryBodySchema = z.object({
  action: z.enum(["save", "forget"]).optional(),
  fact: z.string().max(500).optional(),
  query: z.string().max(200).optional(),
});


export async function GET(req: Request) {
  const blocked = guardApi(req, { scope: "memory" });
  if (blocked) return blocked;
  try {
    return NextResponse.json({ facts: listFacts() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const blocked = guardApi(req, { scope: "memory" });
  if (blocked) return blocked;
  const parsed = MemoryBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const body = parsed.data;
  try {
    if (body.action === "save") {
      if (!body.fact) {
        return NextResponse.json({ error: "fact is required" }, { status: 400 });
      }
      return NextResponse.json(saveFact(body.fact));
    }
    if (body.action === "forget") {
      if (!body.query) {
        return NextResponse.json({ error: "query is required" }, { status: 400 });
      }
      return NextResponse.json(forgetFact(body.query));
    }
    return NextResponse.json({ facts: listFacts() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 400 }
    );
  }
}
