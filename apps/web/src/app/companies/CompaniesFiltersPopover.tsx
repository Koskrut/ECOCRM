"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
};

export function CompaniesFiltersPopover({ open, onClose, onApply, onReset }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-12 z-30 w-[min(92vw,400px)] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Фильтр компаний</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
        >
          Закрыть
        </button>
      </div>

      <p className="mb-4 text-xs text-zinc-500">
        Поиск по названию, ЕДРПОУ и ИНН доступен в строке поиска.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onApply();
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
      </div>
    </div>
  );
}
