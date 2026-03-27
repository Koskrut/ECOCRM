"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ContactsFiltersState = {
  companyId: string;
  ownerId: string;
  hasPhone: string;
  hasEmail: string;
  hasCallToday: string;
  hasMissedCall: string;
  region: string;
  city: string;
  clientType: string;
  sortBy: string;
  sortDir: string;
};

export type OwnerOption = {
  id: string;
  fullName: string;
};

type Props = {
  open: boolean;
  value: ContactsFiltersState;
  companyOptions: { value: string; label: string }[];
  ownerOptions: OwnerOption[];
  onClose: () => void;
  onApply: (next: ContactsFiltersState) => void;
  onReset: () => void;
};

const HAS_PHONE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Любой" },
  { value: "yes", label: "Есть телефон" },
  { value: "no", label: "Нет телефона" },
];

const HAS_EMAIL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Любой" },
  { value: "yes", label: "Есть email" },
  { value: "no", label: "Нет email" },
];

const BOOL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Любой" },
  { value: "yes", label: "Да" },
  { value: "no", label: "Нет" },
];

const SORT_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "createdAt", label: "По дате создания" },
  { value: "name", label: "По имени" },
  { value: "updatedAt", label: "По обновлению" },
  { value: "hasMissedCall", label: "По пропущенным" },
  { value: "hasCallToday", label: "По звонку сегодня" },
];

export function ContactsFiltersPopover({
  open,
  value,
  companyOptions,
  ownerOptions,
  onClose,
  onApply,
  onReset,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement | null>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<ContactsFiltersState>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    lastActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    const onMouseDown = (evt: MouseEvent) => {
      const target = evt.target as Node | null;
      if (panelRef.current && target && !panelRef.current.contains(target)) {
        onClose();
      }
    };
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        evt.preventDefault();
        onClose();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      lastActiveElementRef.current?.focus();
    };
  }, [onClose, open]);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        draft.companyId ||
          draft.ownerId ||
          draft.hasPhone ||
          draft.hasEmail ||
          draft.hasCallToday ||
          draft.hasMissedCall ||
          draft.region.trim() ||
          draft.city.trim() ||
          draft.clientType.trim() ||
          draft.sortBy !== "createdAt" ||
          draft.sortDir !== "desc",
      ),
    [draft],
  );

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-12 z-30 w-[min(95vw,420px)] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
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
            ref={firstFieldRef}
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

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Ответственный</label>
          <select
            value={draft.ownerId}
            onChange={(e) => setDraft((p) => ({ ...p, ownerId: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Все</option>
            {ownerOptions.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.fullName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Телефон</label>
          <select
            value={draft.hasPhone}
            onChange={(e) => setDraft((p) => ({ ...p, hasPhone: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            {HAS_PHONE_OPTIONS.map((opt) => (
              <option key={opt.value || "_any"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Email</label>
          <select
            value={draft.hasEmail}
            onChange={(e) => setDraft((p) => ({ ...p, hasEmail: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            {HAS_EMAIL_OPTIONS.map((opt) => (
              <option key={opt.value || "_any"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Звонок сегодня</label>
          <select
            value={draft.hasCallToday}
            onChange={(e) => setDraft((p) => ({ ...p, hasCallToday: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            {BOOL_OPTIONS.map((opt) => (
              <option key={`today-${opt.value || "_any"}`} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Есть пропущенные</label>
          <select
            value={draft.hasMissedCall}
            onChange={(e) => setDraft((p) => ({ ...p, hasMissedCall: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            {BOOL_OPTIONS.map((opt) => (
              <option key={`missed-${opt.value || "_any"}`} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Регион</label>
          <input
            type="text"
            value={draft.region}
            onChange={(e) => setDraft((p) => ({ ...p, region: e.target.value }))}
            placeholder="Часть названия региона"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Город</label>
          <input
            type="text"
            value={draft.city}
            onChange={(e) => setDraft((p) => ({ ...p, city: e.target.value }))}
            placeholder="Часть названия города"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Тип клиента</label>
          <input
            type="text"
            value={draft.clientType}
            onChange={(e) => setDraft((p) => ({ ...p, clientType: e.target.value }))}
            placeholder="Врач, техник и т.д."
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Сортировка</label>
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
          <label className="mb-1 block text-xs font-medium text-zinc-500">Направление</label>
          <select
            value={draft.sortDir}
            onChange={(e) => setDraft((p) => ({ ...p, sortDir: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <option value="desc">По убыванию</option>
            <option value="asc">По возрастанию</option>
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
