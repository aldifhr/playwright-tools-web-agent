"use client";

export type ThinkingEntry = string | { text: string; phase?: string };

function normalize(entry: ThinkingEntry): { text: string; phase: string } {
  return typeof entry === "string" ? { text: entry, phase: "" } : { text: entry.text, phase: entry.phase ?? "" };
}

// Groups consecutive entries by phase so raw step chatter reads as
// Explore → Artifacts → Testing sections instead of a flat wall of text.
export default function ThinkingList({ entries }: { entries: ThinkingEntry[] }) {
  const items = entries.map(normalize);
  const blocks: { phase: string; texts: string[] }[] = [];
  for (const item of items) {
    const last = blocks.at(-1);
    if (last && last.phase === item.phase) last.texts.push(item.text);
    else blocks.push({ phase: item.phase, texts: [item.text] });
  }
  return (
    <div className="flex flex-col gap-1.5">
      {blocks.map((block, bi) => (
        <div key={`${block.phase}-${bi}`}>
          {!!block.phase && (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              {block.phase}
            </p>
          )}
          {block.texts.map((text, ti) => (
            <p key={`${text.slice(0, 24)}-${ti}`} className="text-xs leading-relaxed text-zinc-400">{text}</p>
          ))}
        </div>
      ))}
    </div>
  );
}
