"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NpCitySelect, cityNameOnly } from "@/components/inputs/NpDirectorySelects";
import { CONTACT_REGION_OPTIONS } from "./contact-region-options";

export type ContactsFiltersState = {
  companyId: string;
  ownerId: string;
  hasPhone: string;
  hasEmail: string;
  hasCallToday: string;
  hasMissedCall: string;
  regions: string[];
  cities: string[];
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
  presetMode?: boolean;
  onClose: () => void;
  onApply: (next: ContactsFiltersState) => void;
  onReset: () => void;
};

const HAS_PHONE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Будь-який" },
  { value: "yes", label: "Є телефон" },
  { value: "no", label: "Немає телефону" },
];

const HAS_EMAIL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Будь-який" },
  { value: "yes", label: "Є email" },
  { value: "no", label: "Немає email" },
];

const BOOL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Будь-який" },
  { value: "yes", label: "Так" },
  { value: "no", label: "Ні" },
];

const REGION_OPTIONS = CONTACT_REGION_OPTIONS.filter((opt) => opt.value);

function FilterValueChips({
  values,
  disabled,
  onRemove,
}: {
  values: string[];
  disabled?: boolean;
  onRemove: (value: string) => void;
}) {
  if (values.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700"
        >
          {value}
          {!disabled ? (
            <button
              type="button"
              onClick={() => onRemove(value)}
              className="text-zinc-400 hover:text-zinc-700"
              aria-label={`Видалити ${value}`}
            >
              ✕
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

const SORT_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "createdAt", label: "За датою створення" },
  { value: "name", label: "За іменем" },
  { value: "updatedAt", label: "За оновленням" },
  { value: "hasMissedCall", label: "За пропущеними" },
  { value: "hasCallToday", label: "За дзвінком сьогодні" },
];

export function ContactsFiltersPopover({
  open,
  value,
  companyOptions,
  ownerOptions,
  presetMode = false,
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
      const target = evt.target;
      if (!(target instanceof Node) || !panelRef.current) return;
      if (panelRef.current.contains(target)) return;
      // NpCitySelect options render in a FixedDropdownPortal on document.body
      if (target instanceof Element && target.closest("[data-fixed-dropdown-portal]")) {
        return;
      }
      onClose();
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
          draft.regions.length ||
          draft.cities.length ||
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
        <h3 className="text-sm font-semibold text-zinc-900">Фільтр контактів</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
        >
          Закрити
        </button>
      </div>

      {presetMode ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          У робочих списках доступні лише пошук і фільтр за відповідальним. Інші фільтри та сортування
          працюють лише в режимі «Усі контакти».
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Компанія</label>
          <select
            ref={firstFieldRef}
            value={draft.companyId}
            onChange={(e) => setDraft((p) => ({ ...p, companyId: e.target.value }))}
            disabled={presetMode}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-400"
          >
            {companyOptions.map((opt) => (
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
            disabled={presetMode}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-400"
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
            disabled={presetMode}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-400"
          >
            {HAS_EMAIL_OPTIONS.map((opt) => (
              <option key={opt.value || "_any"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Дзвінок сьогодні</label>
          <select
            value={draft.hasCallToday}
            onChange={(e) => setDraft((p) => ({ ...p, hasCallToday: e.target.value }))}
            disabled={presetMode}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-400"
          >
            {BOOL_OPTIONS.map((opt) => (
              <option key={`today-${opt.value || "_any"}`} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Є пропущені</label>
          <select
            value={draft.hasMissedCall}
            onChange={(e) => setDraft((p) => ({ ...p, hasMissedCall: e.target.value }))}
            disabled={presetMode}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-400"
          >
            {BOOL_OPTIONS.map((opt) => (
              <option key={`missed-${opt.value || "_any"}`} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Область</label>
          <select
            value=""
            onChange={(e) => {
              const next = e.target.value;
              if (!next || draft.regions.includes(next)) return;
              setDraft((p) => ({ ...p, regions: [...p.regions, next] }));
            }}
            disabled={presetMode}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-400"
          >
            <option value="">Додати область…</option>
            {REGION_OPTIONS.filter((opt) => !draft.regions.includes(opt.value)).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <FilterValueChips
            values={draft.regions}
            disabled={presetMode}
            onRemove={(value) =>
              setDraft((p) => ({ ...p, regions: p.regions.filter((item) => item !== value) }))
            }
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Місто</label>
          <NpCitySelect
            valueRef=""
            valueLabel=""
            onChange={(_ref, label) => {
              const city = cityNameOnly(label);
              if (!city || draft.cities.includes(city)) return;
              setDraft((p) => ({ ...p, cities: [...p.cities, city] }));
            }}
            disabled={presetMode}
            placeholder="Додати місто…"
          />
          <FilterValueChips
            values={draft.cities}
            disabled={presetMode}
            onRemove={(value) =>
              setDraft((p) => ({ ...p, cities: p.cities.filter((item) => item !== value) }))
            }
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Тип клієнта</label>
          <input
            type="text"
            value={draft.clientType}
            onChange={(e) => setDraft((p) => ({ ...p, clientType: e.target.value }))}
            placeholder="Лікар, технік тощо"
            disabled={presetMode}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Сортування</label>
          <select
            value={draft.sortBy}
            onChange={(e) => setDraft((p) => ({ ...p, sortBy: e.target.value }))}
            disabled={presetMode}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-400"
          >
            {SORT_BY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Напрямок</label>
          <select
            value={draft.sortDir}
            onChange={(e) => setDraft((p) => ({ ...p, sortDir: e.target.value }))}
            disabled={presetMode}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-400"
          >
            <option value="desc">За спаданням</option>
            <option value="asc">За зростанням</option>
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
