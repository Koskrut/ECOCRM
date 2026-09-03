"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import { apiHttp } from "@/lib/api/client";
import {
  fieldFuelApi,
  type FuelDayResponse,
  type FuelRangeResponse,
  type FuelVisitBreakdownRow,
  type UserFieldProfile,
} from "@/lib/api/resources/field-fuel";
import { fieldShiftsApi } from "@/lib/api/resources/field-shifts";
import { CRM_TIME_ZONE, todayYmdInKyiv } from "@/lib/crmDatetime";
import { fuelStatusLabel } from "@/lib/status-labels";
import { strings } from "@/locales";
import { ManagerSelect } from "@/components/visits/ManagerSelect";
import { FuelRefuelList, FuelRefuelModal } from "@/components/visits/FuelRefuelPanel";
import { VisitsSubNav } from "../VisitsSubNav";

type MeUser = { role?: string };
type UserRow = { id: string; fullName: string; email: string; role: string };

const GPS_LABELS: Record<string, string> = {
  VERIFIED: "GPS ✓",
  NEARBY_WARNING: "GPS поруч",
  OUTSIDE_RADIUS: "GPS далеко",
  MANUAL_REVIEW: "Перевірка",
  NO_FIX: "Немає GPS",
};

function warningText(code: string): string | null {
  const w = strings.visitsFuelPage.warnings;
  if (code in w) {
    return w[code as keyof typeof w];
  }
  if (code.startsWith("visit_no_coordinates:")) return w.visit_no_coordinates;
  if (code.startsWith("visit_gps_review:")) return w.visit_gps_review;
  return null;
}

function monthKeyFromYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

function monthBounds(monthKey: string): { from: string; to: string } {
  const start = DateTime.fromISO(`${monthKey}-01`, { zone: CRM_TIME_ZONE });
  const end = start.endOf("month");
  return { from: start.toISODate()!, to: end.toISODate()! };
}

function shiftMonth(monthKey: string, delta: number): string {
  const dt = DateTime.fromISO(`${monthKey}-01`, { zone: CRM_TIME_ZONE }).plus({ months: delta });
  return dt.toFormat("yyyy-MM");
}

function formatMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} грн`;
}

function GpsBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-zinc-400">GPS —</span>;
  const label = GPS_LABELS[value] ?? value;
  const tone =
    value === "VERIFIED"
      ? "bg-emerald-100 text-emerald-800"
      : value === "NEARBY_WARNING"
        ? "bg-amber-100 text-amber-900"
        : "bg-zinc-100 text-zinc-700";
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
  );
}

function ProfileBar({
  profile,
  onEdit,
}: {
  profile: UserFieldProfile;
  onEdit: () => void;
}) {
  const price =
    profile.fuelPricePerLiter != null ? Number(profile.fuelPricePerLiter) : null;
  // Price is manager-set for compensation ₴ estimate only — never auto-filled from receipts.
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
      <div className="text-zinc-700">
        <span className="font-medium">{profile.vehicleLabel || "Авто не вказано"}</span>
        <span className="text-zinc-400"> · </span>
        {profile.fuelLitersPer100km} л/100 км
        {price != null && Number.isFinite(price) ? (
          <>
            <span className="text-zinc-400"> · </span>
            {price.toLocaleString("uk-UA")} грн/л{" "}
            <span className="text-zinc-400">(оцінка компенсації)</span>
          </>
        ) : (
          <>
            <span className="text-zinc-400"> · </span>
            <span className="text-amber-700">ціна для оцінки ₴ не задана</span>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
        Редагувати профіль
      </button>
    </div>
  );
}

function VisitBreakdownList({ rows }: { rows: FuelVisitBreakdownRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">Немає завершених візитів за цей день.</p>;
  }
  return (
    <ol className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
      {rows.map((v, i) => (
        <li key={v.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
          <span className="mt-0.5 w-6 shrink-0 text-sm font-semibold text-zinc-400">{i + 1}.</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-zinc-900">{v.title || "Візит"}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
              {v.completedAt
                ? DateTime.fromISO(v.completedAt).setZone(CRM_TIME_ZONE).toFormat("HH:mm")
                : "—"}
              {!v.hasCoordinates ? (
                <span className="text-amber-700">Немає точки на карті</span>
              ) : null}
              {v.includedInRoute ? (
                <span className="text-emerald-700">У плані маршруту</span>
              ) : (
                <span>Поза планом</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <GpsBadge value={v.startGpsVerification} />
              <GpsBadge value={v.completeGpsVerification} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function DayDetailPanel({
  date,
  ownerId,
  reviewerRole,
  onClose,
  onRefreshMonth,
}: {
  date: string;
  ownerId?: string;
  reviewerRole?: string | null;
  onClose: () => void;
  onRefreshMonth: () => void;
}) {
  const [data, setData] = useState<FuelDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [note, setNote] = useState("");
  const [refuelModalOpen, setRefuelModalOpen] = useState(false);
  const [mobilityMode, setMobilityMode] = useState<"CAR" | "WALK_TRANSIT">("CAR");
  const [mobilityNote, setMobilityNote] = useState("");
  const [savingMobility, setSavingMobility] = useState(false);
  const canReview = reviewerRole === "ADMIN" || reviewerRole === "LEAD";

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fieldFuelApi.getDay(date, ownerId);
      setData(r);
      setNote(r.report.managerNote ?? "");
      setMobilityMode(r.mobilityMode === "WALK_TRANSIT" ? "WALK_TRANSIT" : "CAR");
      setMobilityNote(r.mobilityNote ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }, [date, ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const recalc = async () => {
    setLoading(true);
    try {
      const r = await fieldFuelApi.recalculate(date, ownerId);
      setData(r);
      setMobilityMode(r.mobilityMode === "WALK_TRANSIT" ? "WALK_TRANSIT" : "CAR");
      setMobilityNote(r.mobilityNote ?? "");
      onRefreshMonth();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLoading(false);
    }
  };

  const saveMobility = async () => {
    if (!data?.shiftId) {
      setErr(strings.visitsFuelPage.mobilityNoShift);
      return;
    }
    if (data.report.compensationStatus === "PAID") {
      setErr(strings.visitsFuelPage.mobilityPaidLocked);
      return;
    }
    setSavingMobility(true);
    setErr(null);
    try {
      await fieldShiftsApi.patchMobility(data.shiftId, {
        mobilityMode,
        mobilityNote: mobilityNote.trim() || null,
      });
      await load();
      onRefreshMonth();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка");
    } finally {
      setSavingMobility(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await fieldFuelApi.submit(date, { managerNote: note.trim() || null });
      await load();
      onRefreshMonth();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка");
    } finally {
      setSubmitting(false);
    }
  };

  const review = async (status: "APPROVED" | "REJECTED") => {
    if (!ownerId) return;
    setReviewing(true);
    try {
      await fieldFuelApi.review(date, ownerId, status);
      await load();
      onRefreshMonth();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка");
    } finally {
      setReviewing(false);
    }
  };

  const r = data?.report;
  const isWalkTransit = (data?.mobilityMode ?? mobilityMode) === "WALK_TRANSIT";
  const canManageRefuels =
    !ownerId &&
    r?.compensationStatus != null &&
    r.compensationStatus !== "PAID" &&
    !isWalkTransit;
  const canEditMobility =
    canReview && ownerId && r?.compensationStatus !== "PAID";
  const warnings = (data?.warnings ?? [])
    .map(warningText)
    .filter((x): x is string => Boolean(x));

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-900">
          {DateTime.fromISO(date).setZone(CRM_TIME_ZONE).toFormat("d MMMM yyyy", {
            locale: "uk",
          })}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void recalc()}
            disabled={loading}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50">
            Перерахувати
          </button>
          {r?.compensationStatus === "DRAFT" && r.compensationKm != null && !ownerId ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || loading}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              Надіслати
            </button>
          ) : null}
          {canReview && ownerId && r?.compensationStatus === "SUBMITTED" ? (
            <>
              <button
                type="button"
                onClick={() => void review("APPROVED")}
                disabled={reviewing || loading}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                Затвердити
              </button>
              <button
                type="button"
                onClick={() => void review("REJECTED")}
                disabled={reviewing || loading}
                className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                Відхилити
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-white">
            Закрити
          </button>
        </div>
      </div>

      {err ? (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {err}
        </div>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      ) : null}

      {data ? (
        <>
          {isWalkTransit ? (
            <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {strings.visitsFuelPage.mobilityBanner}
              {data.mobilityNote?.trim() ? ` · ${data.mobilityNote.trim()}` : ""}
            </p>
          ) : null}

          {canEditMobility ? (
            <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-zinc-900">
                {strings.visitsFuelPage.mobilityTitle}
              </h3>
              {!data.shiftId ? (
                <p className="mt-2 text-sm text-amber-800">
                  {strings.visitsFuelPage.mobilityNoShift}
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs font-medium text-zinc-500">Режим</span>
                    <select
                      value={mobilityMode}
                      onChange={(e) =>
                        setMobilityMode(e.target.value === "WALK_TRANSIT" ? "WALK_TRANSIT" : "CAR")
                      }
                      className="rounded-md border border-zinc-200 bg-white px-3 py-1.5">
                      <option value="CAR">{strings.visitsFuelPage.mobilityCar}</option>
                      <option value="WALK_TRANSIT">
                        {strings.visitsFuelPage.mobilityWalkTransit}
                      </option>
                    </select>
                  </label>
                  <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm">
                    <span className="text-xs font-medium text-zinc-500">Нотатка</span>
                    <input
                      type="text"
                      value={mobilityNote}
                      onChange={(e) => setMobilityNote(e.target.value)}
                      placeholder={strings.visitsFuelPage.mobilityNotePlaceholder}
                      className="rounded-md border border-zinc-200 px-3 py-1.5"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void saveMobility()}
                    disabled={savingMobility || loading || !data.shiftId}
                    className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                    {strings.visitsFuelPage.mobilitySave}
                  </button>
                </div>
              )}
            </section>
          ) : null}

          {data.routeAnchors?.usesSettingsAnchors ? (
            <p className="mb-3 rounded border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
              Маршрут:{" "}
              <span className="font-medium">
                {data.routeAnchors.startLabel || "Старт"}
                {" → … → "}
                {data.routeAnchors.endLabel ||
                  (data.routeAnchors.hasExplicitEnd ? "Фініш" : data.routeAnchors.startLabel || "Старт")}
              </span>
              {" "}
              (точки з профілю співробітника)
            </p>
          ) : null}

          {warnings.length > 0 ? (
            <ul className="mb-3 space-y-1 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}

          <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-zinc-900">A. Компенсація (км)</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Оцінка за пробіг особистого авто (км × л/100км × ціна в профілі). Не сума чеків.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                <div className="text-xs font-medium uppercase text-emerald-800">Компенсація км</div>
                <div className="mt-1 text-xl font-semibold text-zinc-900">
                  {r?.compensationKm != null ? `${r.compensationKm} км` : "—"}
                </div>
                <div className="text-sm text-zinc-600">
                  {r?.litersEstimated != null ? `${r.litersEstimated} л (оцінка)` : "—"}
                </div>
                <div className="text-xs text-zinc-400">
                  {(() => {
                    const snap = r?.calculationSnapshot;
                    const confirmed = snap?.payoutConfirmedStopCount;
                    const planStops = snap?.payoutPlanStopCount;
                    if (
                      data.compensationFactKind === "planned" &&
                      confirmed != null &&
                      planStops != null &&
                      planStops > 0 &&
                      confirmed < planStops
                    ) {
                      return strings.visitsFuelPage.compensationPlannedPartial
                        .replace("{confirmed}", String(confirmed))
                        .replace("{plan}", String(planStops));
                    }
                    if (data.compensationFactKind === "planned") {
                      return strings.visitsFuelPage.compensationPlanned;
                    }
                    if (data.compensationFactKind === "fact_gps") {
                      return strings.visitsFuelPage.compensationGps;
                    }
                    if (data.compensationFactKind === "none") {
                      return strings.visitsFuelPage.compensationReview;
                    }
                    return strings.visitsFuelPage.compensationVisits;
                  })()}
                  {data.snapFailureReason === "gps_snap_loop_collapse"
                    ? strings.visitsFuelPage.loopCollapseBadge
                    : ""}
                  {r?.metricsSource ? ` · ${r.metricsSource}` : ""}
                </div>
              </div>
              <div
                className={`rounded-lg border p-3 ${
                  (data.warnings ?? []).some((w) => w.startsWith("planned_km_"))
                    ? "border-amber-300 bg-amber-50"
                    : "border-zinc-200 bg-zinc-50"
                }`}>
                <div className="text-xs font-medium uppercase text-zinc-500">
                  {data.compensationFactKind === "planned"
                    ? strings.visitsFuelPage.plannedPayoutKpi
                    : strings.visitsFuelPage.plannedSeparateKpi}
                </div>
                <div className="mt-1 text-xl font-semibold text-zinc-700">
                  {r?.plannedKm != null ? `${r.plannedKm} км` : "—"}
                </div>
                <div className="text-xs text-zinc-400">
                  {r?.plannedKm != null
                    ? strings.visitsFuelPage.plannedExpected.replace("{km}", String(r.plannedKm))
                    : "—"}
                  {(data.warnings ?? []).some((w) => w.startsWith("planned_km_"))
                    ? " · підозрілий план"
                    : data.plannedMetrics.source !== "none"
                      ? ` · ${data.plannedMetrics.source}`
                      : ""}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs font-medium uppercase text-zinc-500">Факт (деталізація)</div>
                <div className="mt-1 flex flex-col gap-1 text-sm text-zinc-700">
                  <span>
                    {strings.visitsFuelPage.trackSnapKm}:{" "}
                    {data.snappedTrackDistanceKm ?? data.factGpsMetrics?.distanceKm ?? "—"} км
                    {data.rawPolylineDistanceKm != null
                      ? ` · ${strings.visitsFuelPage.trackRawKm} ${data.rawPolylineDistanceKm} км`
                      : ""}
                    {` · ${strings.visitsFuelPage.gpsDisplayOnly}`}
                  </span>
                  <span>
                    {strings.visitsFuelPage.visitsKm}:{" "}
                    {data.factVisitsMetrics?.distanceKm ?? data.factMetrics.distanceKm ?? "—"} км
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-xs font-medium uppercase text-emerald-800">Оцінка ₴</div>
                <div className="mt-1 text-xl font-semibold text-emerald-900">
                  {formatMoney(r?.amountEstimated)}
                </div>
                <div className="text-sm text-emerald-800">
                  {fuelStatusLabel(r?.compensationStatus ?? "DRAFT")}
                </div>
                {r?.amountEstimated == null && r?.compensationKm != null ? (
                  <div className="mt-1 text-xs text-amber-800">Вкажіть ціну в профілі для оцінки ₴</div>
                ) : null}
              </div>
            </div>
          </section>

          {r?.compensationStatus === "DRAFT" ? (
            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-600">Примітка</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </div>
          ) : r?.managerNote ? (
            <p className="mb-4 text-sm text-zinc-600">
              <span className="font-medium">Примітка:</span> {r.managerNote}
            </p>
          ) : null}

          <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">B. Чеки заправок</h3>
                <p className="text-xs text-zinc-500">
                  Реальні витрати з чека (фото + літри + сума). Окремо від компенсації км.
                </p>
                {data.refuelTotals ? (
                  <p className="mt-1 text-xs text-zinc-600">
                    {data.refuelTotals.count} заправок · {data.refuelTotals.liters} л ·{" "}
                    {formatMoney(data.refuelTotals.amount)}
                  </p>
                ) : null}
              </div>
              {canManageRefuels ? (
                <button
                  type="button"
                  onClick={() => setRefuelModalOpen(true)}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">
                  Заправка
                </button>
              ) : null}
            </div>
            <FuelRefuelList
              items={data.refuels ?? []}
              canDelete={canManageRefuels}
              onDelete={async (id) => {
                await fieldFuelApi.deleteRefuel(id);
                await load();
                onRefreshMonth();
              }}
            />
          </section>

          <h3 className="mb-2 mt-2 text-sm font-semibold text-zinc-800">Маршрут за фактом (порядок завершення)</h3>
          <VisitBreakdownList rows={data.breakdown} />
        </>
      ) : null}

      {refuelModalOpen ? (
        <FuelRefuelModal
          date={date}
          ownerId={ownerId}
          onClose={() => setRefuelModalOpen(false)}
          onCreated={() => {
            void load();
            onRefreshMonth();
          }}
        />
      ) : null}
    </div>
  );
}

function ProfileModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: UserFieldProfile;
  onClose: () => void;
  onSaved: (p: UserFieldProfile) => void;
}) {
  const [liters, setLiters] = useState(String(profile.fuelLitersPer100km));
  const [price, setPrice] = useState(
    profile.fuelPricePerLiter != null ? String(profile.fuelPricePerLiter) : "",
  );
  const [vehicle, setVehicle] = useState(profile.vehicleLabel ?? "");
  const [personal, setPersonal] = useState(profile.usePersonalCar);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const r = await fieldFuelApi.updateProfile({
        fuelLitersPer100km: Number(liters.replace(",", ".")),
        fuelPricePerLiter: price.trim() ? Number(price.replace(",", ".")) : null,
        vehicleLabel: vehicle.trim() || null,
        usePersonalCar: personal,
      });
      onSaved(r.profile);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
        <h2 className="text-lg font-semibold text-zinc-900">Профіль авто</h2>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-zinc-600">Авто</label>
            <input
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600">л/100 км</label>
            <input
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600">Ціна, грн/л</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5"
            />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} />
            Особисте авто
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-600">
            {strings.common.cancel}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {strings.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VisitsFuelPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedDate = searchParams.get("date");

  const [role, setRole] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [monthKey, setMonthKey] = useState(() => monthKeyFromYmd(todayYmdInKyiv()));
  const [range, setRange] = useState<FuelRangeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [onlyWithCompensationKm, setOnlyWithCompensationKm] = useState(false);

  const { from, to } = useMemo(() => monthBounds(monthKey), [monthKey]);
  const showOwnerFilter = role === "ADMIN" || role === "LEAD";
  const effectiveOwnerId = ownerId || undefined;

  useEffect(() => {
    apiHttp
      .get<{ user?: MeUser }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (!showOwnerFilter) return;
    apiHttp
      .get<{ items?: UserRow[] }>("/users")
      .then((r) => setUsers(r.data?.items ?? []))
      .catch(() => setUsers([]));
  }, [showOwnerFilter]);

  useEffect(() => {
    const owner = searchParams.get("owner");
    if (owner) setOwnerId(owner);
  }, [searchParams]);

  const loadRange = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fieldFuelApi.getRange(from, to, effectiveOwnerId);
      setRange(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка");
      setRange(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, effectiveOwnerId]);

  useEffect(() => {
    void loadRange();
  }, [loadRange]);

  const openDay = (date: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", date);
    router.push(`/visits/fuel?${params.toString()}`);
  };

  const closeDay = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("date");
    const q = params.toString();
    router.push(q ? `/visits/fuel?${q}` : "/visits/fuel");
  };

  const monthLabel = DateTime.fromISO(`${monthKey}-01`, { zone: CRM_TIME_ZONE }).toFormat(
    "LLLL yyyy",
    { locale: "uk" },
  );

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <div className="mx-auto max-w-5xl">
        <VisitsSubNav />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">{strings.nav.visitsFuel}</h1>
            <p className="text-sm text-zinc-500">
              Компенсація км (оцінка) та чеки заправок — окремі контури
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonthKey(shiftMonth(monthKey, -1))}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm">
              ◀
            </button>
            <span className="min-w-[140px] text-center text-sm font-medium capitalize">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => setMonthKey(shiftMonth(monthKey, 1))}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm">
              ▶
            </button>
          </div>
        </div>

        {range?.profile ? (
          <div className="mb-4">
            <ProfileBar profile={range.profile} onEdit={() => setProfileOpen(true)} />
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4">
          {showOwnerFilter ? (
            <div>
              <label className="block text-xs font-medium text-zinc-600">Менеджер</label>
              <ManagerSelect
                users={users}
                value={ownerId}
                onChange={setOwnerId}
                allOptionLabel="Я / за замовчуванням"
                className="mt-0.5 min-w-[200px]"
              />
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={onlyWithCompensationKm}
              onChange={(e) => setOnlyWithCompensationKm(e.target.checked)}
            />
            Лише з compensation km
          </label>
          <button
            type="button"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await fieldFuelApi.downloadExport(from, to, "csv", effectiveOwnerId);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Export failed");
              } finally {
                setExporting(false);
              }
            }}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50">
            CSV
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await fieldFuelApi.downloadExport(from, to, "xlsx", effectiveOwnerId);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Export failed");
              } finally {
                setExporting(false);
              }
            }}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50">
            Excel
          </button>
        </div>

        {err ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </div>
        ) : null}

        {range ? (
          <div className="mb-4 grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-zinc-500">Разом км</div>
              <div className="text-lg font-semibold">{range.totals.totalKm} км</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Разом літрів</div>
              <div className="text-lg font-semibold">{range.totals.totalLiters} л</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Разом сума</div>
              <div className="text-lg font-semibold">
                {range.totals.totalAmount.toLocaleString("uk-UA")} грн
              </div>
            </div>
            <p className="text-xs text-zinc-500 sm:col-span-3">
              {range.totals.daysWithReport} днів з розрахунком · {range.totals.daysDraft} чернеток ·{" "}
              {range.totals.daysWithoutCalc} без розрахунку
            </p>
          </div>
        ) : null}

        {selectedDate ? (
          <div className="mb-6">
            <DayDetailPanel
              date={selectedDate}
              ownerId={effectiveOwnerId}
              reviewerRole={role}
              onClose={closeDay}
              onRefreshMonth={() => void loadRange()}
            />
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50 text-xs text-zinc-600">
              <tr>
                <th className="px-3 py-2">Дата</th>
                <th className="px-3 py-2">Візити</th>
                <th className="px-3 py-2">Виплата км</th>
                <th className="px-3 py-2">Літри</th>
                <th className="px-3 py-2">Сума</th>
                <th className="px-3 py-2">Заправки</th>
                <th className="px-3 py-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {(range?.days ?? [])
                .filter((d) =>
                  onlyWithCompensationKm
                    ? d.report.compensationKm != null && Number(d.report.compensationKm) > 0
                    : true,
                )
                .map((d) => {
                const dayWarnings = d.warnings ?? [];
                const hasWarn =
                  dayWarnings.length > 0 ||
                  Boolean(d.report.calculationSnapshot?.plannedKmDegraded);
                return (
                <tr
                  key={d.date}
                  className={`cursor-pointer border-t border-zinc-50 hover:bg-emerald-50/50 ${
                    hasWarn ? "bg-amber-50/40" : ""
                  }`}
                  onClick={() => openDay(d.date)}>
                  <td className="px-3 py-2 font-medium text-zinc-900">
                    {DateTime.fromISO(d.date).setZone(CRM_TIME_ZONE).toFormat("dd.MM")}
                    {hasWarn ? (
                      <span className="ml-1 text-xs text-amber-700" title={dayWarnings.join(", ")}>
                        ⚠
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{d.report.visitCount ?? "—"}</td>
                  <td className="px-3 py-2">{d.report.compensationKm ?? "—"}</td>
                  <td className="px-3 py-2">{d.report.litersEstimated ?? "—"}</td>
                  <td className="px-3 py-2">{formatMoney(d.report.amountEstimated)}</td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {d.refuelCount ? (
                      <>
                        {d.refuelCount}
                        {d.refuelAmountTotal != null && d.refuelAmountTotal > 0
                          ? ` · ${d.refuelAmountTotal.toLocaleString("uk-UA")} грн`
                          : ""}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {fuelStatusLabel(d.report.compensationStatus)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && (range?.days.length ?? 0) === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">Немає даних</div>
          ) : null}
          {loading ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">{strings.common.loading}</div>
          ) : null}
        </div>
      </div>

      {profileOpen && range?.profile ? (
        <ProfileModal
          profile={range.profile}
          onClose={() => setProfileOpen(false)}
          onSaved={(p) => setRange((prev) => (prev ? { ...prev, profile: p } : prev))}
        />
      ) : null}
    </div>
  );
}
