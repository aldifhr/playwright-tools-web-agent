"use client";

import { X } from "lucide-react";
import type { Session } from "@/lib/store";
import type { Msg } from "@/components/chat/types";

type SearchModalProps = {
  sessions: Session[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onClose: () => void;
  onPick: (sessionId: string) => void;
};

export default function SearchModal({ sessions, searchQuery, setSearchQuery, onClose, onPick }: SearchModalProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/70 p-4 pt-[12vh] backdrop-blur-sm">
      <div className="glass w-full max-w-xl rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
             placeholder="Search chat history..."
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
          />
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={16} /></button>
        </div>
        <div className="mt-3 max-h-72 overflow-y-auto">
          {sessions.flatMap((s) => s.messages.map((m) => ({ session: s, message: m } as { session: Session; message: Msg })))
            .filter(({ message }) => !searchQuery.trim() || message.content.toLowerCase().includes(searchQuery.toLowerCase()))
            .slice(-30).reverse().map(({ session, message }, i) => (
              <button key={`${session.id}-${i}`} onClick={() => onPick(session.id)} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/10">
                <span className="text-[10px] text-zinc-500">{session.title}</span>
                <span className="mt-0.5 block truncate text-sm text-zinc-200">{message.content}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
