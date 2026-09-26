"use client";

import Stagger from "@/components/chat/Stagger";
import type { Approval } from "@/components/chat/types";

type ApprovalCardProps = {
  approval: Approval;
  approving: boolean;
  onRespond: (approved: boolean) => void;
  onAlwaysAllow: () => void;
};

export default function ApprovalCard({ approval, approving, onRespond, onAlwaysAllow }: ApprovalCardProps) {
  return (
    <div className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/8 p-4">
      <Stagger>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-300">Approval required</p>
        <p className="mt-1 text-sm text-white">
          Agent wants to run <code className="rounded bg-white/10 px-1">{approval.tool}</code>
        </p>
      </Stagger>
      <pre className="mt-2 max-h-32 overflow-auto rounded-xl bg-black/50 p-3 text-[11px] whitespace-pre-wrap text-zinc-300">{JSON.stringify(approval.input, null, 2)}</pre>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onRespond(true)}
          disabled={approving}
          className="flex-1 rounded-xl bg-white px-4 py-2 text-xs font-bold text-black transition hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50"
        >
          {approving ? "Sending…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={onAlwaysAllow}
          disabled={approving}
          title="Approve this and all later sensitive tools in this run"
          className="flex-1 rounded-xl border border-emerald-300/40 bg-emerald-300/10 px-4 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-300/20 active:scale-[0.98] disabled:opacity-50"
        >
          Always allow
        </button>
        <button
          type="button"
          onClick={() => onRespond(false)}
          disabled={approving}
          className="flex-1 rounded-xl border border-white/20 bg-transparent px-4 py-2 text-xs font-bold text-white transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
