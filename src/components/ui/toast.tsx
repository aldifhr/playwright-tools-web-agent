"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

type ToastItem = Required<Pick<ToastInput, "title">> &
  Pick<ToastInput, "description"> & {
    id: number;
    variant: ToastVariant;
    duration: number;
  };

type ToastContextValue = {
  toast: (input: ToastInput) => number;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLE: Record<
  ToastVariant,
  { icon: typeof Info; bar: string; iconClass: string }
> = {
  success: {
    icon: CheckCircle2,
    bar: "bg-white",
    iconClass: "text-white",
  },
  error: {
    icon: CircleAlert,
    bar: "bg-white",
    iconClass: "text-white",
  },
  info: {
    icon: Info,
    bar: "bg-zinc-500",
    iconClass: "text-zinc-300",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      idRef.current += 1;
      const id = idRef.current;
      const item: ToastItem = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? "info",
        duration: input.duration ?? 4000,
      };
      setToasts((prev) => [...prev.slice(-3), item]);
      if (item.duration > 0) {
        const timer = setTimeout(() => dismiss(id), item.duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: push,
      success: (title, description) =>
        push({ title, description, variant: "success" }),
      error: (title, description) =>
        push({ title, description, variant: "error" }),
      info: (title, description) => push({ title, description, variant: "info" }),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam <ToastProvider>");
  return ctx;
}

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const meta = VARIANT_STYLE[t.variant];
          const Icon = meta.icon;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={cn(
                "pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl",
                t.variant === "error"
                  ? "border-white/25 bg-zinc-950/95"
                  : "border-white/10 bg-zinc-950/90"
              )}
            >
              <span
                className={cn(
                  "absolute top-0 left-0 h-full w-1",
                  meta.bar
                )}
              />
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/10">
                <Icon size={16} className={meta.iconClass} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug font-semibold text-white">
                  {t.title}
                </p>
                {t.description && (
                  <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-zinc-400">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => onDismiss(t.id)}
                aria-label="Tutup notifikasi"
                className="shrink-0 rounded-lg p-1 text-zinc-500 transition hover:bg-white/10 hover:text-white"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
