"use client";

import { strings } from "@/locales";

type Props = {
  selectedCount: number;
  busy: boolean;
  onBulkPack: () => void;
  onBulkProduce: () => void;
};

export function SheetBulkToolbar({ selectedCount, busy, onBulkPack, onBulkProduce }: Props) {
  const sh = strings.planning.sheet;
  if (selectedCount <= 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-sm text-indigo-950">
      <span className="text-xs font-medium text-indigo-700">{selectedCount}</span>
      <button
        type="button"
        className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        disabled={busy}
        onClick={onBulkPack}
      >
        {sh.bulkPack}
      </button>
      <button
        type="button"
        className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-900 disabled:opacity-50"
        disabled={busy}
        onClick={onBulkProduce}
      >
        {sh.bulkProduce}
      </button>
    </div>
  );
}
