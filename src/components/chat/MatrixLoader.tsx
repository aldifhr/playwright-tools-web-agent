"use client";

import { useEffect, useRef } from "react";
import { cssMs } from "@/lib/css-duration";
import { cn } from "@/lib/utils";

type MatrixVariant = "scan" | "twinkle" | "orbit" | "pulse";

// transitions-dev 31-matrix-loader orchestration, adapted to React.
// The CSS (.t-matrix / t-matrix-pulse) is pasted verbatim in
// transitions-dev.css. Sixteen dots are built once per loader; each gets a
// --d delay (ms) from the variant's delay table. Cycle is read live from
// :root via cssMs() so s/ms normalization can't skew the table.
const CORNERS = [0, 3, 12, 15];
const RING = [1, 2, 7, 11, 14, 13, 8, 4];
const INNER = [5, 6, 9, 10];
const TWINKLE = [7, 2, 11, 5, 14, 9, 0, 12, 3, 15, 6, 10, 13, 1, 8, 4];

export default function MatrixLoader({
  variant = "scan",
  rounded = false,
  className,
}: {
  variant?: MatrixVariant;
  rounded?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const config = useRef({ variant, rounded });

  useEffect(() => {
    config.current = { variant, rounded };
    const loader = ref.current;
    // Dots are built once; re-runs no-op so prop changes can't duplicate them.
    if (!loader || loader.childElementCount > 0) return;
    const { variant: v, rounded: r } = config.current;
    const cycle = cssMs("--matrix-cycle", 1200);
    for (let idx = 0; idx < 16; idx++) {
      const dot = document.createElement("i");
      const col = idx % 4;
      if (r && CORNERS.includes(idx)) {
        dot.className = "is-gap";
      } else if (v === "scan") {
        dot.style.setProperty("--d", String(Math.round(col * (cycle / 10))));
      } else if (v === "twinkle") {
        dot.style.setProperty("--d", String(Math.round(TWINKLE[idx] * (cycle / 16))));
      } else if (v === "orbit") {
        const k = RING.indexOf(idx);
        if (k !== -1) {
          dot.style.setProperty("--d", String(Math.round(k * (cycle / 8))));
        } else {
          dot.style.animation = "none"; // centre holds steady under the ring
        }
      } else {
        const ring = INNER.includes(idx) ? 0 : 1;
        dot.style.setProperty("--d", String(Math.round(ring * (cycle * 0.16))));
      }
      loader.appendChild(dot);
    }
  }, [variant, rounded]);

  return (
    <div
      ref={ref}
      role="status"
      aria-label="Loading"
      data-variant={variant}
      data-rounded={rounded ? "true" : undefined}
      className={cn("t-matrix", className)}
    />
  );
}
