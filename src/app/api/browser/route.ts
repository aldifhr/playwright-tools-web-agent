import { NextResponse } from "next/server";
import { z } from "zod";
import * as bw from "@/lib/browser";
import { guardApi } from "@/lib/api-guard";

const BrowserActionSchema = z.object({
  action: z.enum(["status", "navigate", "screenshot", "text", "snapshot", "click", "type", "back", "close"]).optional(),
  url: z.string().max(2000).optional(),
  selector: z.string().max(1000).optional(),
  text: z.string().max(20000).optional(),
  submit: z.boolean().optional(),
  fullPage: z.boolean().optional(),
});


export async function GET(req: Request) {
  const blocked = guardApi(req, { scope: "browser" });
  if (blocked) return blocked;
  const status = await bw.getStatus();
  return NextResponse.json({ ...status, playwright: "chromium-headless", sessions: bw.sessionCount() });
}

export async function POST(req: Request) {
  const blocked = guardApi(req, { scope: "browser" });
  if (blocked) return blocked;
  const parsed = BrowserActionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const body = parsed.data;
  try {
    switch (body.action) {
      case "navigate": {
        if (!body.url || typeof body.url !== "string") {
          return NextResponse.json({ error: "url is required" }, { status: 400 });
        }
        return NextResponse.json(await bw.navigate(body.url));
      }
      case "screenshot":
        return NextResponse.json(await bw.screenshot(!!body.fullPage));
      case "text":
        return NextResponse.json(await bw.getText());
      case "snapshot":
        return NextResponse.json(await bw.snapshot());
      case "click": {
        if (!body.selector) {
          return NextResponse.json({ error: "selector is required" }, { status: 400 });
        }
        return NextResponse.json(await bw.click(body.selector));
      }
      case "type": {
        if (!body.selector || typeof body.text !== "string") {
          return NextResponse.json(
            { error: "selector and text are required" },
            { status: 400 }
          );
        }
        return NextResponse.json(
          await bw.typeText(body.selector, body.text, !!body.submit)
        );
      }
      case "back":
        return NextResponse.json(await bw.goBack());
      case "close":
        await bw.closeBrowser();
        return NextResponse.json({ closed: true });
      default: {
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}
