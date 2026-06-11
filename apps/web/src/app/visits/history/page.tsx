"use client";

import Link from "next/link";
import { strings } from "@/locales";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { apiHttp } from "@/lib/api/client";
import {
  routePlansApi,
  visitsApi,
  type RouteGeometryBundle,
  type VisitHistoryItem,
} from "@/lib/api/resources/visits";
import { EmptyState } from "@/components/feedback/EmptyState";
import { RouteLayerControls, type RouteLayerKey } from "@/components/visits/RouteLayerControls";
import { VisitsRouteMap } from "@/components/visits/VisitsRouteMap";
import { ManagerSelect } from "@/components/visits/ManagerSelect";
import { todayYmdInKyiv } from "@/lib/crmDatetime";
import { VisitsSubNav } from "../VisitsSubNav";
import {
  calendarCells,
  computeSummary,
  dayAccent,
  groupVisitsByDay,
  isInDisplayMonth,
  matchesOutcomeFilter,
  outcomeMeta,
  quickRange,
  visitDisplayTitle,
  visitSubtitle,
  type OutcomeFilter,
  type ViewMode,
} from "./visit-history-utils";

type MeUser = { role?: string };
type UserRow = { id: string; fullName: string; email: string; role: string };

const PAGE_SIZE = 30;
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function formatDateTime(value?: string | null) {
  return value ? format(new Date(value), "dd.MM.yyyy HH:mm") : "—";
}

function OutcomeBadge({ outcome }: { outcome: string | null | undefined }) {
  const meta = outcomeMeta(outcome);
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badgeClass}`}>
      {meta.label}
    </span>
  );
}

function VisitHistoryCard({
  v,
  showOwner,
}: {
  v: VisitHistoryItem;
  showOwner: boolean;
}) {
  const subtitle = visitSubtitle(v);
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-zinc-900">{visitDisplayTitle(v)}</h3>
          {subtitle ? <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
        <OutcomeBadge outcome={v.outcome} />
      </div>

      {showOwner ? (
        <p className="mt-2 text-xs text-zinc-500">
          Менеджер: {v.owner?.fullName ?? v.owner?.email ?? "—"}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <span className="rounded bg-zinc-100 px-2 py-1">
          План: {formatDateTime(v.startsAt)}
        </span>
        <span className="text-zinc-400">→</span>
        <span className="rounded bg-blue-50 px-2 py-1 text-blue-800">
          Завершён: {formatDateTime(v.completedAt)}
        </span>
        {v.durationMin ? (
          <span className="text-zinc-500">{v.durationMin} мин</span>
        ) : null}
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-zinc-500">Цель</dt>
          <dd className="text-zinc-800">{v.purpose?.trim() || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Комментарий</dt>
          <dd className="text-zinc-800">{v.resultNote?.trim() || "—"}</dd>
        </div>
      </dl>

      {v.nextActionAt || v.nextActionNote?.trim() ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Следующий шаг
          </div>
          {v.nextActionAt ? (
            <p className="mt-1 text-zinc-800">{formatDateTime(v.nextActionAt)}</p>
          ) : null}
          {v.nextActionNote?.trim() ? (
            <p className="mt-1 text-zinc-700">{v.nextActionNote}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function HistoryCalendar({
  monthAnchor,
  dayBuckets,
  selectedDay,
  onSelectDay,
}: {
  monthAnchor: string;
  dayBuckets: Map<string, import("./visit-history-utils").DayBucket>;
  selectedDay: string | null;
  onSelectDay: (dateKey: string) => void;
}) {
  const cells = calendarCells(monthAnchor);
  const monthLabel = format(new Date(`${monthAnchor}T12:00:00`), "LLLL yyyy");

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-3 text-sm font-semibold capitalize text-zinc-900">{monthLabel}</div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-zinc-500">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const inMonth = isInDisplayMonth(day, monthAnchor);
          const bucket = dayBuckets.get(dateKey);
          const accent = dayAccent(bucket);
          const isSelected = selectedDay === dateKey;
          return (
            <button
              key={dateKey}
              type="button"
              disabled={!inMonth}
              onClick={() => inMonth && onSelectDay(dateKey)}
              className={`min-h-[72px] rounded-md border p-1 text-left transition ${accent} ${
                inMonth ? "hover:ring-2 hover:ring-emerald-300" : "cursor-default opacity-40"
              } ${isSelected ? "ring-2 ring-emerald-500" : ""}`}
            >
              <div
                className={`text-xs font-medium ${inMonth ? "text-zinc-800" : "text-zinc-400"}`}
              >
                {format(day, "d")}
              </div>
              {bucket && inMonth ? (
                <div className="mt-1 space-y-0.5">
                  <div className="text-[10px] font-semibold text-zinc-700">{bucket.total}</div>
                  <div className="flex flex-wrap gap-0.5">
                    {bucket.success > 0 ? (
                      <span className="rounded bg-emerald-200/80 px-1 text-[9px] text-emerald-900">
                        {bucket.success}
                      </span>
                    ) : null}
                    {bucket.followUp > 0 ? (
                      <span className="rounded bg-amber-200/80 px-1 text-[9px] text-amber-900">
                        {bucket.followUp}
                      </span>
                    ) : null}
                    {bucket.problem > 0 ? (
                      <span className="rounded bg-red-200/80 px-1 text-[9px] text-red-900">
                        {bucket.problem}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Цифры: всего визитов · зелёный успех · жёлтый follow-up · красный проблемные. Клик по дню
        открывает список за этот день.
      </p>
    </div>
  );
}

export default function VisitsHistoryPage() {
  const [role, setRole] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [from, setFrom] = useState(() => quickRange("30d").from);
  const [to, setTo] = useState(() => quickRange("30d").to);
  const [items, setItems] = useState<VisitHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
  const [routeGeometryBundle, setRouteGeometryBundle] = useState<RouteGeometryBundle | null>(null);
  const [routeGeometryLoading, setRouteGeometryLoading] = useState(false);
  const [routeLayers, setRouteLayers] = useState<Record<RouteLayerKey, boolean>>({
    planned: true,
    fact_visits: true,
    fact_gps: true,
  });

  useEffect(() => {
    apiHttp
      .get<{ user?: { id?: string; role?: string } }>("/auth/me")
      .then((r) => {
        setRole(r.data?.user?.role ?? null);
        setMyUserId(r.data?.user?.id ?? null);
      })
      .catch(() => {
        setRole(null);
        setMyUserId(null);
      });
  }, []);

  useEffect(() => {
    apiHttp
      .get<{ mapsApiKey: string | null }>("/settings/google-maps/public")
      .then((r) => setMapsApiKey(r.data?.mapsApiKey ?? null))
      .catch(() => setMapsApiKey(null));
  }, []);

  useEffect(() => {
    if (role !== "ADMIN" && role !== "LEAD") return;
    apiHttp
      .get<{ items?: UserRow[] }>("/users")
      .then((r) => setUsers(r.data?.items ?? []))
      .catch(() => setUsers([]));
  }, [role]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await visitsApi.history({
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
        ownerId: ownerId || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [from, to, ownerId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const showOwnerFilter = role === "ADMIN" || role === "LEAD";
  const filteredItems = useMemo(
    () => items.filter((v) => matchesOutcomeFilter(v, outcomeFilter)),
    [items, outcomeFilter],
  );
  const summary = useMemo(() => computeSummary(items), [items]);
  const dayBuckets = useMemo(() => groupVisitsByDay(items), [items]);
  const monthAnchor = from || format(new Date(), "yyyy-MM-dd");
  const mapDateKey = from === to ? from : selectedDay;
  const mapOwnerId = ownerId || myUserId || undefined;

  useEffect(() => {
    setRouteGeometryBundle(null);
    if (!mapDateKey || !mapOwnerId) return;
    setRouteGeometryLoading(true);
    void routePlansApi
      .geometryBundle(mapDateKey, { ownerId: mapOwnerId })
      .then((b) => setRouteGeometryBundle(b))
      .catch(() => setRouteGeometryBundle(null))
      .finally(() => setRouteGeometryLoading(false));
  }, [mapDateKey, mapOwnerId]);

  const routeCompareKpi = useMemo(() => {
    if (!routeGeometryBundle) return null;
    const plan = routeGeometryBundle.planned.distanceKm;
    const factGps = routeGeometryBundle.factGps.distanceKm;
    const factVisits = routeGeometryBundle.factVisits.distanceKm;
    const fact =
      routeGeometryBundle.compensationFactKind === "fact_gps" && factGps != null
        ? factGps
        : factVisits;
    const deviationPct =
      plan != null && fact != null && plan > 0
        ? Math.round(((fact - plan) / plan) * 100)
        : null;
    return { plan, factGps, factVisits, deviationPct };
  }, [routeGeometryBundle]);

  const mapCenter = useMemo(() => {
    const g = routeGeometryBundle?.planned;
    if (g?.path?.[0]) return { lat: g.path[0].lat, lng: g.path[0].lng };
    const g2 = routeGeometryBundle?.factVisits;
    if (g2?.path?.[0]) return { lat: g2.path[0].lat, lng: g2.path[0].lng };
    return { lat: 50.4501, lng: 30.5234 };
  }, [routeGeometryBundle]);

  const resetFilters = () => {
    const r = quickRange("30d");
    setFrom(r.from);
    setTo(r.to);
    setOwnerId("");
    setOutcomeFilter("all");
    setPage(1);
    setSelectedDay(null);
  };

  const applyQuickRange = (kind: "today" | "7d" | "30d" | "month") => {
    const r = quickRange(kind);
    setFrom(r.from);
    setTo(r.to);
    setPage(1);
    setSelectedDay(null);
  };

  const selectCalendarDay = (dateKey: string) => {
    setFrom(dateKey);
    setTo(dateKey);
    setPage(1);
    setSelectedDay(dateKey);
    setViewMode("list");
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <div className="mx-auto max-w-5xl">
        <VisitsSubNav />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">{strings.nav.visitsHistory}</h1>
            <p className="text-sm text-zinc-500">Завершённые визиты · анализ и контроль</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  viewMode === "list"
                    ? "bg-emerald-100 text-emerald-900"
                    : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                Список
              </button>
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  viewMode === "calendar"
                    ? "bg-emerald-100 text-emerald-900"
                    : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                Календарь
              </button>
            </div>
            <Link href="/visits" className="text-sm font-medium text-emerald-700 hover:underline">
              ← До планування
            </Link>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { label: "Всего", value: summary.total, sub: `из ${total} в базе` },
            { label: "Успешные", value: summary.success, className: "text-emerald-700" },
            { label: "Follow-up", value: summary.followUp, className: "text-amber-700" },
            { label: "Проблемные", value: summary.problem, className: "text-red-700" },
            { label: "След. шаг", value: summary.nextAction, className: "text-zinc-700" },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm"
            >
              <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                {c.label}
              </div>
              <div className={`text-lg font-semibold ${c.className ?? "text-zinc-900"}`}>
                {loading ? "…" : c.value}
              </div>
              {"sub" in c && c.sub ? (
                <div className="text-[10px] text-zinc-400">{c.sub}</div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mb-4 space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "Сегодня"],
                ["7d", "7 дней"],
                ["30d", "30 дней"],
                ["month", "Этот месяц"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => applyQuickRange(k)}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600">С</label>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setPage(1);
                  setFrom(e.target.value);
                  setSelectedDay(null);
                }}
                className="mt-0.5 rounded border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">По</label>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setPage(1);
                  setTo(e.target.value);
                  setSelectedDay(null);
                }}
                className="mt-0.5 rounded border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </div>
            {showOwnerFilter ? (
              <div>
                <label className="block text-xs font-medium text-zinc-600">Менеджер</label>
                <ManagerSelect
                  users={users}
                  value={ownerId}
                  onChange={(id) => {
                    setPage(1);
                    setOwnerId(id);
                  }}
                  allOptionLabel="Все доступные"
                  className="mt-0.5 min-w-[200px]"
                />
              </div>
            ) : null}
            <div>
              <label className="block text-xs font-medium text-zinc-600">Результат</label>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value as OutcomeFilter)}
                className="mt-0.5 rounded border border-zinc-200 px-2 py-1.5 text-sm"
              >
                <option value="all">Все</option>
                <option value="success">Успешные</option>
                <option value="follow_up">Follow-up</option>
                <option value="problem">Проблемные</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "…" : "Обновить"}
            </button>
          </div>
        </div>

        {err ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </div>
        ) : null}

        {mapDateKey ? (
          <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">
                  Маршрут за {mapDateKey}
                </h2>
                {showOwnerFilter &&
                mapOwnerId &&
                mapDateKey === todayYmdInKyiv() ? (
                  <Link
                    href={`/visits/team?owner=${mapOwnerId}`}
                    className="mt-1 inline-block text-xs font-medium text-blue-700 hover:underline">
                    Відкрити live-карту команди
                  </Link>
                ) : null}
                {showOwnerFilter && !ownerId ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Выберите менеджера, чтобы увидеть его маршрут.
                  </p>
                ) : routeCompareKpi ? (
                  <p className="mt-1 text-xs text-zinc-600">
                    План: {routeCompareKpi.plan ?? "—"} км · Факт GPS:{" "}
                    {routeCompareKpi.factGps ?? "—"} км · Факт (визиты):{" "}
                    {routeCompareKpi.factVisits ?? "—"} км
                    {routeCompareKpi.deviationPct != null ? (
                      <span className="ml-1 font-medium">
                        · отклонение {routeCompareKpi.deviationPct > 0 ? "+" : ""}
                        {routeCompareKpi.deviationPct}%
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <RouteLayerControls
                layers={routeLayers}
                onToggle={(key) => setRouteLayers((p) => ({ ...p, [key]: !p[key] }))}
                disabled={routeGeometryLoading}
              />
            </div>
            {showOwnerFilter && !ownerId ? null : (
              <div className="h-[320px] overflow-hidden rounded-md border border-zinc-100">
                {!mapsApiKey ? (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                    Карта недоступна (нет Google Maps API key)
                  </div>
                ) : routeGeometryLoading ? (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                    Загрузка маршрута…
                  </div>
                ) : (
                  <VisitsRouteMap
                    mapsApiKey={mapsApiKey}
                    center={mapCenter}
                    layers={routeLayers}
                    geometries={{
                      planned: routeGeometryBundle?.planned ?? null,
                      fact_visits: routeGeometryBundle?.factVisits ?? null,
                      fact_gps: routeGeometryBundle?.factGps ?? null,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        ) : null}

        {viewMode === "calendar" ? (
          <HistoryCalendar
            monthAnchor={monthAnchor}
            dayBuckets={dayBuckets}
            selectedDay={selectedDay}
            onSelectDay={selectCalendarDay}
          />
        ) : null}

        {viewMode === "list" ? (
          <>
            {selectedDay ? (
              <p className="mb-3 text-sm text-zinc-600">
                Показаны визиты за{" "}
                <span className="font-medium">{selectedDay}</span>
                <button
                  type="button"
                  className="ml-2 text-emerald-700 hover:underline"
                  onClick={() => {
                    const r = quickRange("30d");
                    setFrom(r.from);
                    setTo(r.to);
                    setSelectedDay(null);
                    setPage(1);
                  }}
                >
                  Сбросить день
                </button>
              </p>
            ) : null}

            {loading ? (
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-12 text-center text-sm text-zinc-500">
                Загрузка…
              </div>
            ) : filteredItems.length === 0 ? (
              <EmptyState
                title="Нет визитов по фильтрам"
                description="За выбранный период завершённых визитов не найдено. Измените даты, менеджера или фильтр результата."
                action={
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    Сбросить фильтры
                  </button>
                }
              />
            ) : (
              <div className="space-y-3">
                {filteredItems.map((v) => (
                  <VisitHistoryCard key={v.id} v={v} showOwner={showOwnerFilter} />
                ))}
              </div>
            )}

            {total > PAGE_SIZE ? (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-zinc-200 px-3 py-1 disabled:opacity-50"
                >
                  Назад
                </button>
                <span className="text-zinc-600">
                  Стр. {page} · всего {total}
                  {outcomeFilter !== "all" ? ` · на странице ${filteredItems.length}` : ""}
                </span>
                <button
                  type="button"
                  disabled={page * PAGE_SIZE >= total || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-zinc-200 px-3 py-1 disabled:opacity-50"
                >
                  Вперёд
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {viewMode === "calendar" && !loading && items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Нет данных для календаря"
              description="В выбранном периоде нет завершённых визитов на текущей странице загрузки."
              action={
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Сбросить фильтры
                </button>
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
