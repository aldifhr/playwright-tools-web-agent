import { NextResponse } from "next/server";
import { listFacts, saveFact, forgetFact } from "@/lib/memory";

export async function GET() {
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
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    fact?: string;
    query?: string;
  };
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
