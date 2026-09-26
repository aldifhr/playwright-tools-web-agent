"use client";

import { useEffect, useRef, useState } from "react";
import { cssMs } from "@/lib/css-duration";

// transitions-dev 30-streaming-text orchestration, adapted to React.
// The CSS (.t-stream-w / .is-in) is pasted verbatim in transitions-dev.css.
// Words render as spans; newly arrived words resolve through opacity + blur,
// one every --stream-gap (read live from :root so it stays in sync). When the
// text resets (new run), the reveal replays from nothing.
export default function StreamWords({ text }: { text: string }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const [revealed, setRevealed] = useState(0);
  const revealedRef = useRef(0);

  useEffect(() => {
    if (words.length < revealedRef.current) {
      revealedRef.current = 0;
      setRevealed(0);
    }
    if (words.length <= revealedRef.current) return;
    const gap = cssMs("--stream-gap", 60);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (cancelled) return;
      revealedRef.current += 1;
      setRevealed(revealedRef.current);
      if (revealedRef.current < words.length) timer = setTimeout(next, gap);
    };
    timer = setTimeout(next, gap);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [words.length]);

  return (
    <span className="t-stream">
      {words.map((word, i) => (
        <span key={i}>
          <span className={i < revealed ? "t-stream-w is-in" : "t-stream-w"}>
            {word}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}
