import { NextResponse } from "next/server";
import { listSpecs, readSpec, deleteSpec, deleteCases, readCases, runSpec, recordRun, loadLastRun, loadRunLog } from "@/lib/specs";

export const maxDuration = 300;

export async function GET() {
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
      { error: e instanceof Error ? e.message : "gagal" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    file?: string;
  };
  try {
    switch (body.action) {
      case "get": {
        if (!body.file) {
          return NextResponse.json({ error: "file wajib diisi" }, { status: 400 });
        }
        return NextResponse.json({
          file: body.file,
          content: await readSpec(body.file),
        });
      }
      case "delete": {
        if (!body.file) {
          return NextResponse.json({ error: "file wajib diisi" }, { status: 400 });
        }
        await deleteCases(body.file);
        return NextResponse.json(await deleteSpec(body.file));
      }
      case "cases": {
        if (!body.file) {
          return NextResponse.json({ error: "file wajib diisi" }, { status: 400 });
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
      { error: e instanceof Error ? e.message : "gagal" },
      { status: 500 }
    );
  }
}
