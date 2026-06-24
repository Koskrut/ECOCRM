"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type LeadsFiltersState = {
  status: string;
  source: string;
  channel: string;
  ownerId: string;
  dateFrom: string;
  dateTo: string;
  sortBy: string;
  sortOrder: string;
};

export type OwnerOption = {
  id: string;
  fullName: string;
};

export const DEFAULT_LEADS_FILTERS: LeadsFiltersState = {
  status: "",
  source: "",
  channel: "",
  ownerId: "",
  dateFrom: "",
  dateTo: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

type Props = {
  open: boolean;
  value: LeadsFiltersState;
  statusOptions: { value: string; label: string }[];
  sourceOptions: { value: string; label: string }[];
  channelOptions: { value: string; label: string }[];
  ownerOptions: OwnerOption[];
  onClose: () => void;
  onApply: (next: LeadsFiltersState) => void;
  onReset: () => void;
};

const SORT_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "createdAt", label: "За датою створення" },
  { value: "score", label: "За балом" },
];

const SORT_ORDER_OPTIONS: { value: string; label: string }[] = [
  { value: "desc", label: "Спочатку новіші" },
  { value: "asc", label: "Спочатку старіші" },
];

function isActiveFilterState(state: LeadsFiltersState): boolean {
  return Boolean(
    state.status ||
      state.source ||
      state.channel ||
      state.ownerId ||
      state.dateFrom ||
      state.dateTo ||
      state.sortBy !== DEFAULT_LEADS_FILTERS.sortBy ||
      state.sortOrder !== DEFAULT_LEADS_FILTERS.sortOrder,
  );
}

export function LeadsFiltersPopover({
  open,
  value,
  statusOptions,
  sourceOptions,
  channelOptions,
  ownerOptions,
  onClose,
  onApply,
  onReset,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<LeadsFiltersState>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (evt: MouseEvent) => {
      const target = evt.target as Node | null;
      if (panelRef.current && target && !panelRef.current.contains(target)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose, open]);

  const hasActiveFilters = useMemo(() => isActiveFilterState(draft), [draft]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-12 z-30 w-[min(92vw,440px)] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Фільтри лідів</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
        >
          Закрити
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Статус</label>
          <select
            value={draft.status}
            onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value || "_all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Джерело</label>
          <select
            value={draft.source}
            onChange={(e) => setDraft((p) => ({ ...p, source: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            {sourceOptions.map((opt) => (
              <option key={opt.value || "_all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Канал</label>
          <select
            value={draft.channel}
            onChange={(e) => setDraft((p) => ({ ...p, channel: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            {channelOptions.map((opt) => (
              <option key={opt.value || "_all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Відповідальний</label>
          <select
            value={draft.ownerId}
            onChange={(e) => setDraft((p) => ({ ...p, ownerId: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Усі</option>
            {ownerOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Створено з</label>
          <input
            type="date"
            value={draft.dateFrom}
            onChange={(e) => setDraft((p) => ({ ...p, dateFrom: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Створено до</label>
          <input
            type="date"
            value={draft.dateTo}
            onChange={(e) => setDraft((p) => ({ ...p, dateTo: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Сортування</label>
          <select
            value={draft.sortBy}
            onChange={(e) => setDraft((p) => ({ ...p, sortBy: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            {SORT_BY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Порядок</label>
          <select
            value={draft.sortOrder}
            onChange={(e) => setDraft((p) => ({ ...p, sortOrder: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            {SORT_ORDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onApply(draft);
            onClose();
          }}
          className="btn-primary"
        >
          Застосувати
        </button>
        <button
          type="button"
          onClick={() => {
            onReset();
            onClose();
          }}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
        >
          Скинути
        </button>
        <span className="text-xs text-zinc-500">
          {hasActiveFilters ? "Фільтри активні" : "Без фільтрів"}
        </span>
      </div>
    </div>
  );
}

export { isActiveFilterState };
