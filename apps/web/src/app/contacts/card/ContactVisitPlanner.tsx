"use client";

import { VisitLocationPicker } from "@/components/visits/VisitLocationPicker";
import type { EntityAddress } from "@/lib/api/resources/entity-addresses";
import { formatDateTime } from "@/lib/crmDatetime";
import type { VisitLocationValue } from "@/lib/visits/visit-location.types";
import { strings } from "@/locales";

const t = strings.contacts.card.visit;

type Props = {
  addresses: EntityAddress[];
  visitLocation: VisitLocationValue | null;
  onVisitLocationChange: (v: VisitLocationValue) => void;
  mapsApiKey: string | null;
  addressRequiredForVisit: boolean;
  visitPurpose: string;
  onVisitPurposeChange: (v: string) => void;
  visitStartsAt: string;
  onVisitStartsAtChange: (v: string) => void;
  visitDurationMin: string;
  onVisitDurationMinChange: (v: string) => void;
  lastVisitAt?: string | null;
  planningVisit: boolean;
  visitPlanError: string | null;
  visitPlanSuccess: string | null;
  saving: boolean;
  onScheduleVisit: () => void;
};

export function ContactVisitPlanner({
  addresses,
  visitLocation,
  onVisitLocationChange,
  mapsApiKey,
  addressRequiredForVisit,
  visitPurpose,
  onVisitPurposeChange,
  visitStartsAt,
  onVisitStartsAtChange,
  visitDurationMin,
  onVisitDurationMinChange,
  lastVisitAt,
  planningVisit,
  visitPlanError,
  visitPlanSuccess,
  saving,
  onScheduleVisit,
}: Props) {
  const disabled = saving || planningVisit;

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.title}</div>
      <VisitLocationPicker
        entityType="contact"
        addresses={addresses}
        value={visitLocation}
        onChange={onVisitLocationChange}
        mapsApiKey={mapsApiKey}
        error={addressRequiredForVisit}
        disabled={disabled}
      />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-600">{t.purpose}</span>
        <input
          value={visitPurpose}
          onChange={(e) => onVisitPurposeChange(e.target.value)}
          disabled={disabled}
          placeholder={t.purposePlaceholder}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600">{t.datetime}</span>
          <input
            type="datetime-local"
            value={visitStartsAt}
            onChange={(e) => onVisitStartsAtChange(e.target.value)}
            disabled={disabled}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600">{t.duration}</span>
          <select
            value={visitDurationMin}
            onChange={(e) => onVisitDurationMinChange(e.target.value)}
            disabled={disabled}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <option value="30">30</option>
            <option value="45">45</option>
            <option value="60">60</option>
            <option value="90">90</option>
            <option value="120">120</option>
          </select>
        </label>
      </div>
      {visitPlanError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {visitPlanError}
        </div>
      ) : null}
      {visitPlanSuccess ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {visitPlanSuccess}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-zinc-500">{t.lastVisit}</span>
        <span className="text-sm text-zinc-900">
          {lastVisitAt ? (
            formatDateTime(lastVisitAt)
          ) : (
            <span className="font-normal text-zinc-400">{t.noVisits}</span>
          )}
        </span>
      </div>
      <button type="button" onClick={onScheduleVisit} disabled={disabled} className="btn-primary w-full">
        {planningVisit ? strings.contacts.create.saving : visitStartsAt ? t.scheduleDated : t.addToBacklog}
      </button>
      <p className="text-xs text-zinc-500">{t.backlogHint}</p>
    </div>
  );
}
