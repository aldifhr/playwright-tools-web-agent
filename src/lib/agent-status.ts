// Label status manusiawi — aman diimpor komponen client (tanpa dependensi node).
function shortUrl(u: string): string {
  const t = u.trim();
  if (!t) return "situs";
  try {
    const x = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    const path =
      x.pathname && x.pathname !== "/" ? x.pathname.slice(0, 28) : "";
    return (x.hostname + path).slice(0, 48);
  } catch {
    return t.slice(0, 48);
  }
}

// Label status manusiawi per tool — ditampilkan live saat agent bekerja.
export function statusLabel(toolName: string, input: unknown): string {
  const inp = (input ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case "browser_navigate":
      return `Opening ${shortUrl(String(inp.url ?? "situs"))}…`;
    case "browser_snapshot":
      return "Scanning page…";
    case "browser_get_text":
      return "Reading page…";
    case "browser_click":
      return "Clicking element…";
    case "browser_type":
      return "Typing into form…";
    case "browser_screenshot":
      return "Taking screenshot…";
    case "browser_go_back":
      return "Going back…";
    case "browser_scroll":
      return "Scrolling page…";
    case "test_assert":
      return "Asserting…";
    case "browser_close":
      return "Closing browser…";
    case "browser_network_log":
      return "Logging network…";
    case "browser_console":
      return "Reading console…";
    case "browser_select":
      return "Selecting option…";
    case "browser_wait":
      return "Waiting…";
    case "browser_storage":
      return "Reading storage…";
    case "browser_cookies":
      return "Managing cookies…";
    case "browser_upload":
      return "Uploading file…";
    case "browser_press":
      return "Pressing key…";
    case "browser_hover":
      return "Hovering…";
    case "browser_drag":
      return "Dragging…";
    case "browser_dialog":
      return "Reading dialogs…";
    case "browser_tabs":
      return "Listing tabs…";
    case "browser_tab_select":
      return "Switching tab…";
    case "browser_tab_close":
      return "Closing tab…";
    case "browser_downloads":
      return "Checking downloads…";
    case "test_save":
      return "Saving test…";
    case "test_run":
      return "Running tests…";
    case "memory_save":
      return "Remembering…";
    case "memory_forget":
      return "Forgetting…";
    case "test_plan":
      return "Planning tests…";
    case "test_list":
      return "Listing tests…";
    default:
      return "Working…";
  }
}

export const IDLE_STATUS = "Agent is typing…";
export const THINKING_STATUS = "Thinking…";
