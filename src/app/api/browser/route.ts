import { NextResponse } from "next/server";
import * as bw from "@/lib/browser";

export async function GET() {
  const status = await bw.getStatus();
  return NextResponse.json({ ...status, playwright: "chromium-headless" });
}

type Action =
  | { action: "status" }
  | { action: "navigate"; url: string }
  | { action: "screenshot"; fullPage?: boolean }
  | { action: "text" }
  | { action: "snapshot" }
  | { action: "click"; selector: string }
  | { action: "type"; selector: string; text: string; submit?: boolean }
  | { action: "back" }
  | { action: "close" };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<Action>;
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
        const status = await bw.getStatus();
        return NextResponse.json(status);
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}
