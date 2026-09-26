/* eslint-disable @next/next/no-img-element */
"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Stagger from "@/components/chat/Stagger";
import type { LightboxState } from "@/components/chat/types";

type LightboxProps = {
  lightbox: NonNullable<LightboxState>;
  onClose: () => void;
  onStep: (i: number) => void;
};

export default function Lightbox({ lightbox, onClose, onStep }: LightboxProps) {
  if (!lightbox.list.length) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-black">
            {lightbox.i + 1} / {lightbox.list.length}
          </span>
          <p className="truncate text-xs text-zinc-400">{lightbox.list[lightbox.i]?.url}</p>
          <div className="ml-auto flex gap-1.5">
            <button
              disabled={lightbox.i === 0}
              onClick={() => onStep(lightbox.i - 1)}
              className="rounded-full bg-white/10 p-2 hover:bg-white/20 disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              disabled={lightbox.i >= lightbox.list.length - 1}
              onClick={() => onStep(lightbox.i + 1)}
              className="rounded-full bg-white/10 p-2 hover:bg-white/20 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
            <button onClick={onClose} className="rounded-full bg-white p-2 text-black hover:bg-zinc-200">
              <X size={16} />
            </button>
          </div>
        </div>
        <Stagger key={lightbox.i}>
          <img
            src={lightbox.list[lightbox.i]?.image}
            alt="full"
            className="max-h-[80vh] w-full rounded-2xl border border-white/15 object-contain shadow-2xl"
          />
        </Stagger>
      </div>
    </div>
  );
}
