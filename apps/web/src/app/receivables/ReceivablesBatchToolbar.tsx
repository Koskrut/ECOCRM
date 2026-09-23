"use client";

import { useState } from "react";
import { Bell, Phone, UserRound, X } from "lucide-react";
import { strings } from "@/locales";

export function ReceivablesBatchToolbar({
  selectedCount,
  canAssignManager,
  managers,
  busy,
  onClear,
  onRemind,
  onCreateCallTasks,
  onAssignManager,
}: {
  selectedCount: number;
  canAssignManager: boolean;
  managers: Array<{ id: string; fullName: string }>;
  busy: boolean;
  onClear: () => void;
  onRemind: () => void;
  onCreateCallTasks: () => void;
  onAssignManager: (ownerId: string) => void;
}) {
  const t = strings.receivables;
  const [ownerId, setOwnerId] = useState("");

  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-4 z-30 mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
      <span className="text-sm font-medium text-zinc-800">
        {t.batchSelected(selectedCount)}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={onRemind}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        <Bell className="h-3.5 w-3.5" />
        {t.batchRemind}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onCreateCallTasks}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        <Phone className="h-3.5 w-3.5" />
        {t.batchCallTasks}
      </button>
      {canAssignManager ? (
        <div className="flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5 text-zinc-500" />
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
          >
            <option value="">{t.batchPickManager}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !ownerId}
            onClick={() => onAssignManager(ownerId)}
            className="rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-900 disabled:opacity-50"
          >
            {t.batchAssign}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
      >
        <X className="h-3.5 w-3.5" />
        {t.batchClear}
      </button>
    </div>
  );
}
