import {
  Bitcoin,
  Brain,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  Globe,
  MousePointerClick,
  Newspaper,
  RotateCcw,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
  Zap,
  ChevronDown,
} from "lucide-react";
import type { ProviderId } from "@/lib/providers";

export const SUGGESTIONS = [
  {
    icon: TrendingUp,
    title: "Exploratory testing",
    desc: "Explore saucedemo and list testable areas",
    prompt:
      "Open https://www.saucedemo.com, log in with standard_user / secret_sauce, then explore and list all testable areas and features",
  },
  {
    icon: Camera,
    title: "Bug repro + evidence",
    desc: "Repeat the flow and capture screenshots at each stage",
    prompt:
      "Open https://www.saucedemo.com and capture the login page as initial evidence",
  },
  {
    icon: Bitcoin,
    title: "Quick smoke test",
    desc: "Log in, add a product, and verify the cart badge",
    prompt:
      "Run a saucedemo smoke test: log in with standard_user / secret_sauce, add one product to the cart, and verify the cart badge is 1",
  },
  {
    icon: Newspaper,
    title: "Find locators",
    desc: "Robust selectors for automation",
    prompt:
      "Open https://www.saucedemo.com and provide robust locators (data-test / getByRole) for the login form",
  },
];

export const TOOL_META: Record<string, { icon: typeof Globe; label: string }> = {
  browser_navigate: { icon: Globe, label: "Navigate" },
  browser_snapshot: { icon: FileText, label: "Snapshot" },
  browser_get_text: { icon: FileText, label: "Read" },
  browser_click: { icon: MousePointerClick, label: "Click" },
  browser_type: { icon: Zap, label: "Type" },
  browser_screenshot: { icon: Camera, label: "Shot" },
  browser_go_back: { icon: RotateCcw, label: "Back" },
  browser_close: { icon: X, label: "Close" },
  browser_scroll: { icon: ChevronDown, label: "Scroll" },
  test_assert: { icon: CheckCircle2, label: "Assert" },
  browser_bash: { icon: Zap, label: "Shell" },
  browser_read_file: { icon: FileText, label: "Read file" },
  browser_delegate: { icon: Sparkles, label: "Delegate" },
  test_save: { icon: FileText, label: "Save test" },
  test_plan_document: { icon: Newspaper, label: "Test plan" },
  test_run: { icon: RotateCcw, label: "Run tests" },
  test_plan: { icon: ClipboardList, label: "Plan cases" },
  test_list: { icon: ClipboardList, label: "List tests" },
  memory_save: { icon: Brain, label: "Remember" },
  memory_forget: { icon: Trash2, label: "Forget" },
};

export const PROVIDER_META: Record<ProviderId, { icon: typeof Sparkles; hint: string }> = {
  openai: { icon: Sparkles, hint: "GPT-4o • cloud" },
  anthropic: { icon: Brain, hint: "Claude • cloud" },
};

export const PROGRESS_LABELS = ["Planning", "Browsing", "Testing", "Reporting"];
