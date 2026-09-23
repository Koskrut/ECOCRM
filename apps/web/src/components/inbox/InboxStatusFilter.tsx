"use client";

import { inboxStatusLabel } from "@/lib/status-labels";

const STATUSES = ["OPEN", "PENDING", "CLOSED"] as const;
export type InboxStatus = (typeof STATUSES)[number];

type Props = {
  value: string;
  onChange: (status: InboxStatus) => void;
  hideNoise: boolean;
  onHideNoiseChange: (next: boolean) => void;
};

export function InboxStatusFilter({
  value,
  onChange,
  hideNoise,
  onHideNoiseChange,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`rounded px-2 py-1 text-xs font-medium ${
              value === s
                ? "bg-accent-gradient text-white"
                : "bg-zinc-200/80 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {inboxStatusLabel(s)}
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
        <input
          type="checkbox"
          checked={hideNoise}
          onChange={(e) => onHideNoiseChange(e.target.checked)}
          className="rounded border-zinc-300"
        />
        Приховати службові
      </label>
    </div>
  );
}
