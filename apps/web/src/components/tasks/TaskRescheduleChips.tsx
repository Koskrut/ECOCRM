"use client";

import { kyivDuePresetIso, type TaskDuePreset } from "@/lib/crmDatetime";
import { strings } from "@/locales";

const t = strings.tasks;

type Props = {
  disabled?: boolean;
  onReschedule: (dueAt: string | null) => void;
};

const PRESETS: { key: TaskDuePreset | "clear"; label: string }[] = [
  { key: "today", label: t.reschedule.today },
  { key: "tomorrow", label: t.reschedule.tomorrow },
  { key: "plus7", label: t.reschedule.plus7 },
  { key: "clear", label: t.reschedule.clear },
];

export function TaskRescheduleChips({ disabled, onReschedule }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          disabled={disabled}
          onClick={() => onReschedule(p.key === "clear" ? null : kyivDuePresetIso(p.key))}
          className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
