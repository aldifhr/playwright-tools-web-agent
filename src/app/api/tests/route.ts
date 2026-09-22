import { NextResponse } from "next/server";
import { z } from "zod";
import { listSpecs, readSpec, deleteSpec, deleteCases, readCases, runSpec, recordRun, loadLastRun, loadRunLog } from "@/lib/specs";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const TestsBodySchema = z.object({
  action: z.enum(["get", "delete", "cases", "run"]).optional(),
  file: z.string().max(200).optional(),
});

export const maxDuration = 300;

function guard(req: Request) {
  return requireAuth(req) ?? rateLimit(`tests:${clientKey(req)}`, 60, 60_000);
}

export async function GET(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    const tests = await listSpecs();
    const lastRun = await loadLastRun();
    // buang hasil run untuk file yang sudah dihapus
    const names = new Set(tests.map((t) => t.file));
    for (const k of Object.keys(lastRun)) {
      if (k !== "__all__" && !names.has(k)) delete lastRun[k];
    }
    return NextResponse.json({ tests, lastRun, history: await loadRunLog() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const parsed = TestsBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const body = parsed.data;
  try {
    switch (body.action) {
      case "get": {
        if (!body.file) {
           return NextResponse.json({ error: "file is required" }, { status: 400 });
        }
        return NextResponse.json({
          file: body.file,
          content: await readSpec(body.file),
        });
      }
      case "delete": {
        if (!body.file) {
           return NextResponse.json({ error: "file is required" }, { status: 400 });
        }
        await deleteCases(body.file);
        return NextResponse.json(await deleteSpec(body.file));
      }
      case "cases": {
        if (!body.file) {
           return NextResponse.json({ error: "file is required" }, { status: 400 });
        }
        return NextResponse.json({ cases: await readCases(body.file) });
      }
      case "run": {
        const summary = await runSpec(body.file || undefined);
        await recordRun(body.file || null, summary);
        return NextResponse.json(summary);
      }
      default:
        return NextResponse.json({ tests: await listSpecs() });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}
