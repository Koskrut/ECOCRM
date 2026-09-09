"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { NpCitySelect, cityNameOnly } from "@/components/inputs/NpDirectorySelects";
import {
  CONTACT_PRIORITY_REASON_CODES,
  type ContactPriorityReasonCode,
} from "@/lib/api/resources/contacts";
import { strings } from "@/locales";
import { formatContactPriorityReasonCompact } from "./contact-formatters";
import { CONTACT_REGION_OPTIONS } from "./contact-region-options";
import { shouldInitFilterDraft } from "./contacts-ui-state";

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
  reasons: ContactPriorityReasonCode[];
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

function FilterValueChips({
  values,
  disabled,
  onRemove,
}: {
  values: string[];
  disabled?: boolean;
  onRemove: (value: string) => void;
}) {
  const t = strings.contacts.filters;
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
              aria-label={t.removeValue.replace("{value}", value)}
            >
              ✕
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
      {children}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}

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
  const t = strings.contacts.filters;
  const titleId = useId();
  const baseId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement | null>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const [draft, setDraft] = useState<ContactsFiltersState>(value);

  const hasPhoneOptions = [
    { value: "", label: t.any },
    { value: "yes", label: t.hasPhone },
    { value: "no", label: t.noPhone },
  ];
  const hasEmailOptions = [
    { value: "", label: t.any },
    { value: "yes", label: t.hasEmail },
    { value: "no", label: t.noEmail },
  ];
  const boolOptions = [
    { value: "", label: t.any },
    { value: "yes", label: t.yes },
    { value: "no", label: t.no },
  ];
  const sortByOptions = [
    { value: "createdAt", label: t.sortCreatedAt },
    { value: "name", label: t.sortName },
    { value: "updatedAt", label: t.sortUpdatedAt },
    { value: "hasMissedCall", label: t.sortMissed },
    { value: "hasCallToday", label: t.sortCallToday },
  ];
  const regionOptions = CONTACT_REGION_OPTIONS.filter((opt) => opt.value);

  useEffect(() => {
    if (shouldInitFilterDraft(open, wasOpenRef.current)) {
      setDraft(value);
    }
    wasOpenRef.current = open;
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    lastActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);

    const onMouseDown = (evt: MouseEvent) => {
      const target = evt.target;
      if (!(target instanceof Node) || !panelRef.current) return;
      if (panelRef.current.contains(target)) return;
      if (target instanceof Element && target.closest("[data-fixed-dropdown-portal]")) {
        return;
      }
      onClose();
    };

    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        evt.preventDefault();
        onClose();
        return;
      }
      if (evt.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (evt.shiftKey && document.activeElement === first) {
        evt.preventDefault();
        last.focus();
      } else if (!evt.shiftKey && document.activeElement === last) {
        evt.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
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
        draft.reasons.length ||
        draft.sortBy !== "createdAt" ||
        draft.sortDir !== "desc",
      ),
    [draft],
  );

  const toggleReason = (code: ContactPriorityReasonCode) => {
    setDraft((prev) => {
      const has = prev.reasons.includes(code);
      return {
        ...prev,
        reasons: has ? prev.reasons.filter((r) => r !== code) : [...prev.reasons, code],
      };
    });
  };

  if (!open) return null;

  const ownerId = `${baseId}-owner`;
  const companyId = `${baseId}-company`;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="absolute right-0 top-12 z-30 w-[min(95vw,420px)] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 id={titleId} className="text-sm font-semibold text-zinc-900">
          {t.title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
        >
          {t.close}
        </button>
      </div>

      {presetMode ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t.presetNote}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        {presetMode ? (
          <>
            <Field id={ownerId} label={t.owner}>
              <select
                id={ownerId}
                ref={firstFieldRef}
                value={draft.ownerId}
                onChange={(e) => setDraft((p) => ({ ...p, ownerId: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">{t.allOwners}</option>
                {ownerOptions.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.fullName}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`${baseId}-reasons`} label={t.reason}>
              <div
                id={`${baseId}-reasons`}
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label={t.reason}
              >
                {CONTACT_PRIORITY_REASON_CODES.map((code) => {
                  const pressed = draft.reasons.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => toggleReason(code)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        pressed
                          ? "border-amber-400 bg-amber-50 text-amber-900"
                          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {formatContactPriorityReasonCompact(code)}
                    </button>
                  );
                })}
              </div>
            </Field>
          </>
        ) : (
          <>
            <FilterGroup title={t.groupContact}>
              <Field id={companyId} label={t.company}>
                <select
                  id={companyId}
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
              </Field>
              <Field id={`${baseId}-owner-all`} label={t.owner}>
                <select
                  id={`${baseId}-owner-all`}
                  value={draft.ownerId}
                  onChange={(e) => setDraft((p) => ({ ...p, ownerId: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">{t.allOwners}</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.fullName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={`${baseId}-phone`} label={t.phone}>
                <select
                  id={`${baseId}-phone`}
                  value={draft.hasPhone}
                  onChange={(e) => setDraft((p) => ({ ...p, hasPhone: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  {hasPhoneOptions.map((opt) => (
                    <option key={opt.value || "_any"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={`${baseId}-email`} label={t.email}>
                <select
                  id={`${baseId}-email`}
                  value={draft.hasEmail}
                  onChange={(e) => setDraft((p) => ({ ...p, hasEmail: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  {hasEmailOptions.map((opt) => (
                    <option key={opt.value || "_any"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={`${baseId}-type`} label={t.clientType}>
                <input
                  id={`${baseId}-type`}
                  type="text"
                  value={draft.clientType}
                  onChange={(e) => setDraft((p) => ({ ...p, clientType: e.target.value }))}
                  placeholder={t.clientTypePlaceholder}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400"
                />
              </Field>
            </FilterGroup>

            <FilterGroup title={t.groupGeo}>
              <Field id={`${baseId}-region`} label={t.region}>
                <select
                  id={`${baseId}-region`}
                  value=""
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next || draft.regions.includes(next)) return;
                    setDraft((p) => ({ ...p, regions: [...p.regions, next] }));
                  }}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">{t.addRegion}</option>
                  {regionOptions
                    .filter((opt) => !draft.regions.includes(opt.value))
                    .map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                </select>
                <FilterValueChips
                  values={draft.regions}
                  onRemove={(value) =>
                    setDraft((p) => ({
                      ...p,
                      regions: p.regions.filter((item) => item !== value),
                    }))
                  }
                />
              </Field>
              <div>
                <div className="mb-1 block text-xs font-medium text-zinc-500">{t.city}</div>
                <NpCitySelect
                  valueRef=""
                  valueLabel=""
                  onChange={(_ref, label) => {
                    const city = cityNameOnly(label);
                    if (!city || draft.cities.includes(city)) return;
                    setDraft((p) => ({ ...p, cities: [...p.cities, city] }));
                  }}
                  placeholder={t.addCity}
                />
                <FilterValueChips
                  values={draft.cities}
                  onRemove={(value) =>
                    setDraft((p) => ({
                      ...p,
                      cities: p.cities.filter((item) => item !== value),
                    }))
                  }
                />
              </div>
            </FilterGroup>

            <FilterGroup title={t.groupActivity}>
              <Field id={`${baseId}-call-today`} label={t.callToday}>
                <select
                  id={`${baseId}-call-today`}
                  value={draft.hasCallToday}
                  onChange={(e) => setDraft((p) => ({ ...p, hasCallToday: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  {boolOptions.map((opt) => (
                    <option key={`today-${opt.value || "_any"}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={`${baseId}-missed`} label={t.missed}>
                <select
                  id={`${baseId}-missed`}
                  value={draft.hasMissedCall}
                  onChange={(e) => setDraft((p) => ({ ...p, hasMissedCall: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  {boolOptions.map((opt) => (
                    <option key={`missed-${opt.value || "_any"}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </FilterGroup>

            <FilterGroup title={t.groupSort}>
              <Field id={`${baseId}-sort-by`} label={t.sortBy}>
                <select
                  id={`${baseId}-sort-by`}
                  value={draft.sortBy}
                  onChange={(e) => setDraft((p) => ({ ...p, sortBy: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  {sortByOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={`${baseId}-sort-dir`} label={t.sortDir}>
                <select
                  id={`${baseId}-sort-dir`}
                  value={draft.sortDir}
                  onChange={(e) => setDraft((p) => ({ ...p, sortDir: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="desc">{t.sortDesc}</option>
                  <option value="asc">{t.sortAsc}</option>
                </select>
              </Field>
            </FilterGroup>
          </>
        )}
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
          {t.apply}
        </button>
        <button
          type="button"
          onClick={() => {
            onReset();
            onClose();
          }}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
        >
          {t.reset}
        </button>
        <span className="text-xs text-zinc-500">{hasActiveFilters ? t.active : t.none}</span>
      </div>
    </div>
  );
}
