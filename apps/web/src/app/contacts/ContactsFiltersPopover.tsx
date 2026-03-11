"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ContactsFiltersState = {
  companyId: string;
};

type Props = {
  open: boolean;
  value: ContactsFiltersState;
  companyOptions: { value: string; label: string }[];
  onClose: () => void;
  onApply: (next: ContactsFiltersState) => void;
  onReset: () => void;
};

export function ContactsFiltersPopover({
  open,
  value,
  companyOptions,
  onClose,
  onApply,
  onReset,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<ContactsFiltersState>(value);

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

  const hasActiveFilters = useMemo(() => Boolean(draft.companyId), [draft.companyId]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-12 z-30 w-[min(92vw,400px)] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Фильтр контактов</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
        >
          Закрыть
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Компания</label>
          <select
            value={draft.companyId}
            onChange={(e) => setDraft((p) => ({ ...p, companyId: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            {companyOptions.map((opt) => (
              <option key={opt.value || "_all"} value={opt.value}>
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
          Применить
        </button>
        <button
          type="button"
          onClick={() => {
            onReset();
            onClose();
          }}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
        >
          Сбросить
        </button>
        <span className="text-xs text-zinc-500">
          {hasActiveFilters ? "Фильтры активны" : "Без фильтров"}
        </span>
      </div>
    </div>
  );
}
