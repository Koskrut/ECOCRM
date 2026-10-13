"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { strings } from "@/locales";
import type { ReceivablesFilterState, ReceivablesWorkView } from "./receivables-url";
import { DELAY_REASON_CODES, delayReasonLabel } from "./receivables-labels";

export type ReceivablesWorkFilters = Pick<
  ReceivablesFilterState,
  | "overdue"
  | "needsComment"
  | "promisedToday"
  | "promiseBroken"
  | "reconcileDeltaOnly"
  | "delayReason"
>;

type BooleanFilterKey = Exclude<keyof ReceivablesWorkFilters, "delayReason">;

export const EMPTY_WORK_FILTERS: ReceivablesWorkFilters = {
  overdue: false,
  needsComment: false,
  promisedToday: false,
  promiseBroken: false,
  reconcileDeltaOnly: false,
  delayReason: "",
};

export function pickWorkFilters(state: ReceivablesFilterState): ReceivablesWorkFilters {
  return {
    overdue: state.overdue,
    needsComment: state.needsComment,
    promisedToday: state.promisedToday,
    promiseBroken: state.promiseBroken,
    reconcileDeltaOnly: state.reconcileDeltaOnly,
    delayReason: state.delayReason,
  };
}

/** Clients view supports every work filter; orders view only `overdue`. */
function booleanFiltersFor(view: ReceivablesWorkView): { key: BooleanFilterKey; label: string }[] {
  const t = strings.receivables;
  const all: { key: BooleanFilterKey; label: string }[] = [
    { key: "overdue", label: t.overdueOnly },
    { key: "needsComment", label: t.needsCommentOnly },
    { key: "promisedToday", label: t.promisedTodayOnly },
    { key: "promiseBroken", label: t.promiseBrokenOnly },
    { key: "reconcileDeltaOnly", label: t.reconcileDeltaOnly },
  ];
  return view === "orders" ? all.filter((f) => f.key === "overdue") : all;
}

export type ActiveWorkFilterChip = {
  key: keyof ReceivablesWorkFilters;
  label: string;
};

export function activeWorkFilterChips(
  value: ReceivablesWorkFilters,
  view: ReceivablesWorkView,
): ActiveWorkFilterChip[] {
  const chips: ActiveWorkFilterChip[] = booleanFiltersFor(view)
    .filter((f) => value[f.key])
    .map((f) => ({ key: f.key, label: f.label }));
  if (view === "clients" && value.delayReason) {
    chips.push({ key: "delayReason", label: delayReasonLabel(value.delayReason) });
  }
  return chips;
}

export function clearWorkFilter(
  value: ReceivablesWorkFilters,
  key: keyof ReceivablesWorkFilters,
): ReceivablesWorkFilters {
  return { ...value, [key]: EMPTY_WORK_FILTERS[key] };
}

/** Clears only the filters that apply to the given view. */
export function resetWorkFilters(
  value: ReceivablesWorkFilters,
  view: ReceivablesWorkView,
): ReceivablesWorkFilters {
  return view === "orders" ? { ...value, overdue: false } : EMPTY_WORK_FILTERS;
}

export function ReceivablesWorkFiltersPopover({
  value,
  workView,
  onApply,
}: {
  value: ReceivablesWorkFilters;
  workView: ReceivablesWorkView;
  onApply: (next: ReceivablesWorkFilters) => void;
}) {
  const t = strings.receivables;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ReceivablesWorkFilters>(value);
  const activeCount = activeWorkFilterChips(value, workView).length;

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (evt: MouseEvent) => {
      const target = evt.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) setOpen(false);
    };
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const hasDraftActive = activeWorkFilterChips(draft, workView).length > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open) setDraft(value);
          setOpen(!open);
        }}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
          activeCount > 0
            ? "border-zinc-800 bg-zinc-800 text-white hover:bg-zinc-700"
            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {t.filtersButton}
        {activeCount > 0 ? (
          <span className="rounded-full bg-white/20 px-1.5 text-xs tabular-nums">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 max-h-[min(80vh,560px)] w-[min(92vw,420px)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">{t.filtersTitle}</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              {t.filtersClose}
            </button>
          </div>

          <div className="space-y-2">
            {booleanFiltersFor(workView).map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={draft[f.key]}
                  onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.checked }))}
                  className="rounded border-zinc-300"
                />
                {f.label}
              </label>
            ))}
            {workView === "clients" ? (
              <label className="block text-sm">
                <span className="text-xs font-medium text-zinc-500">{t.delayReasonLabel}</span>
                <select
                  value={draft.delayReason}
                  onChange={(e) => setDraft((p) => ({ ...p, delayReason: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">{t.delayReasonAll}</option>
                  {DELAY_REASON_CODES.map((code) => (
                    <option key={code} value={code}>
                      {delayReasonLabel(code)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onApply(draft);
                setOpen(false);
              }}
              className="btn-primary"
            >
              {t.filtersApply}
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(resetWorkFilters(value, workView));
                setOpen(false);
              }}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
            >
              {t.filtersReset}
            </button>
            <span className="text-xs text-zinc-500">
              {hasDraftActive ? t.filtersActive : t.filtersNone}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      title={strings.receivables.filterClear}
      className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
    >
      {label}
      <span aria-hidden="true">×</span>
    </button>
  );
}
