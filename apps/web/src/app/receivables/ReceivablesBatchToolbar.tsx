"use client";

import { useState } from "react";
import { Bell, Clock, Phone, UserRound, X } from "lucide-react";
import { strings } from "@/locales";
import type { ReceivablesSnoozeDays } from "@/lib/api/resources/receivables";

export function ReceivablesBatchToolbar({
  selectedCount,
  canAssignManager,
  managers,
  busy,
  onClear,
  onRemind,
  onCreateCallTasks,
  onAssignManager,
  onSnooze,
}: {
  selectedCount: number;
  canAssignManager: boolean;
  managers: Array<{ id: string; fullName: string }>;
  busy: boolean;
  onClear: () => void;
  onRemind: () => void;
  onCreateCallTasks: () => void;
  onAssignManager: (ownerId: string) => void;
  onSnooze?: (days: ReceivablesSnoozeDays) => void;
}) {
  const t = strings.receivables;
  const [ownerId, setOwnerId] = useState("");
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-4 z-30 mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
      <span className="text-sm font-medium text-zinc-800">{t.batchSelected(selectedCount)}</span>
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
      {onSnooze ? (
        <div className="relative">
          <button
            type="button"
            disabled={busy}
            onClick={() => setSnoozeOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            <Clock className="h-3.5 w-3.5" />
            {t.batchSnooze}
          </button>
          {snoozeOpen ? (
            <div className="absolute bottom-full left-0 z-40 mb-1 flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
              {([1, 3, 7] as ReceivablesSnoozeDays[]).map((days) => (
                <button
                  key={days}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSnoozeOpen(false);
                    onSnooze(days);
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  {days === 1 ? t.snooze1d : days === 3 ? t.snooze3d : t.snooze7d}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
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
