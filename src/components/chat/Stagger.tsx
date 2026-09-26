"use client";

import { Children, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// transitions-dev 18-texts-reveal orchestration, adapted to React.
// The CSS (.t-stagger / .t-stagger-line / .is-shown) is pasted verbatim in
// transitions-dev.css. Mounting adds .is-shown on a double rAF so the
// staggered entrance plays. Lines beyond --2 get the documented
// `calc(var(--stagger-stagger) * (N - 1))` delay inline.
export function useShown<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => el.classList.add("is-shown"))
    );
    return () => cancelAnimationFrame(raf);
  }, []);
  return ref;
}

export default function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useShown<HTMLDivElement>();
  const items = Children.toArray(children);
  return (
    <div ref={ref} className={cn("t-stagger", className)}>
      {items.map((child, i) => (
        <div
          key={i}
          className={`t-stagger-line t-stagger-line--${i + 1}`}
          style={
            i >= 2
              ? { transitionDelay: `calc(var(--stagger-stagger) * ${i})` }
              : undefined
          }
        >
          {child}
        </div>
      ))}
    </div>
  );
}
