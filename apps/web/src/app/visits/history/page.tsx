"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { strings } from "@/locales";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { apiHttp } from "@/lib/api/client";
import {
  visitsApi,
  type VisitHistoryItem,
} from "@/lib/api/resources/visits";
import { EmptyState } from "@/components/feedback/EmptyState";
import { DayRouteMapDialog } from "@/components/visits/DayRouteMapDialog";
import { DayRouteMapPanel } from "@/components/visits/DayRouteMapPanel";
import { ManagerSelect } from "@/components/visits/ManagerSelect";
import { VisitsSubNav } from "../VisitsSubNav";
import {
  calendarCells,
  computeSummary,
  dayAccent,
  groupVisitsByDay,
  groupVisitsIntoDayOwnerSections,
  groupVisitsIntoDaySections,
  isInDisplayMonth,
  matchesOutcomeFilter,
  outcomeMeta,
  quickRange,
  visitDisplayTitle,
  visitSubtitle,
  type OutcomeFilter,
  type ViewMode,
  type VisitHistoryListSection,
} from "./visit-history-utils";

type MeUser = { role?: string };
type UserRow = { id: string; fullName: string; email: string; role: string };

const PAGE_SIZE = 100;
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
          Завершено: {formatDateTime(v.completedAt)}
        </span>
        {v.durationMin ? (
          <span className="text-zinc-500">{v.durationMin} хв</span>
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
        Цифри: усього візитів · зелений успіх · жовтий follow-up · червоний проблемні. Клік по дню
        відкриває список за цей день.
      </p>
    </div>
  );
}

function HistoryDaySectionHeader({
  section,
  onOpenMap,
}: {
  section: VisitHistoryListSection;
  onOpenMap: (section: VisitHistoryListSection) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2 pt-4">
      <h2 className="text-sm font-semibold capitalize text-zinc-900">{section.title}</h2>
      <button
        type="button"
        onClick={() => onOpenMap(section)}
        className="text-xs font-medium text-emerald-700 hover:underline"
      >
        Маршрут на карте ›
      </button>
    </div>
  );
}

export default function VisitsHistoryPage() {
  const searchParams = useSearchParams();
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
  const [mapDialog, setMapDialog] = useState<VisitHistoryListSection | null>(null);

  useEffect(() => {
    const spFrom = searchParams.get("from");
    const spTo = searchParams.get("to");
    const spOwner = searchParams.get("owner");
    if (spFrom) setFrom(spFrom);
    if (spTo) setTo(spTo);
    if (spOwner) setOwnerId(spOwner);
    if (spFrom && spFrom === spTo) setSelectedDay(spFrom);
  }, [searchParams]);

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
      setErr(e instanceof Error ? e.message : "Помилка");
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
  const splitByOwner = showOwnerFilter && !ownerId;
  const filteredItems = useMemo(
    () => items.filter((v) => matchesOutcomeFilter(v, outcomeFilter)),
    [items, outcomeFilter],
  );
  const listSections = useMemo(() => {
    if (splitByOwner && myUserId) {
      return groupVisitsIntoDayOwnerSections(filteredItems, myUserId);
    }
    return groupVisitsIntoDaySections(filteredItems);
  }, [filteredItems, splitByOwner, myUserId]);
  const summary = useMemo(() => computeSummary(items), [items]);
  const dayBuckets = useMemo(() => groupVisitsByDay(items), [items]);
  const monthAnchor = from || format(new Date(), "yyyy-MM-dd");
  const mapDateKey = from === to ? from : selectedDay;
  const mapOwnerId = ownerId || myUserId || "";
  const showInlineDayMap = Boolean(mapDateKey && mapOwnerId && !splitByOwner);

  function resolveMapOwnerId(section: VisitHistoryListSection): string | null {
    if (section.ownerId) return section.ownerId;
    if (ownerId) return ownerId;
    if (myUserId) return myUserId;
    return null;
  }

  function openDayMap(section: VisitHistoryListSection) {
    const oid = resolveMapOwnerId(section);
    if (!oid) return;
    setMapDialog(section);
  }

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
            <p className="text-sm text-zinc-500">Завершені візити · аналіз і контроль</p>
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
            { label: "Успішні", value: summary.success, className: "text-emerald-700" },
            { label: "Follow-up", value: summary.followUp, className: "text-amber-700" },
            { label: "Проблемні", value: summary.problem, className: "text-red-700" },
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
                ["month", "Цей місяць"],
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
                  allOptionLabel="Усі доступні"
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
                <option value="success">Успішні</option>
                <option value="follow_up">Follow-up</option>
                <option value="problem">Проблемні</option>
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

        {showInlineDayMap && mapDateKey ? (
          <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">
              Маршрут за {mapDateKey}
            </h2>
            <DayRouteMapPanel
              dateKey={mapDateKey}
              ownerId={mapOwnerId}
              mapsApiKey={mapsApiKey}
              showTeamLink={showOwnerFilter}
              mode="history"
            />
          </div>
        ) : null}

        {mapDialog && resolveMapOwnerId(mapDialog) ? (
          <DayRouteMapDialog
            open
            dateKey={mapDialog.dateKey}
            ownerId={resolveMapOwnerId(mapDialog)!}
            title={mapDialog.title}
            mapsApiKey={mapsApiKey}
            showTeamLink={showOwnerFilter}
            onClose={() => setMapDialog(null)}
          />
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
                Показано візити за{" "}
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
                  Скинути день
                </button>
              </p>
            ) : null}

            {loading ? (
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-12 text-center text-sm text-zinc-500">
                Завантаження…
              </div>
            ) : filteredItems.length === 0 ? (
              <EmptyState
                title="Немає візитів за фільтрами"
                description="За обраний період завершених візитів не знайдено. Змініть дати, менеджера або фільтр результату."
                action={
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    Скинути фільтри
                  </button>
                }
              />
            ) : (
              <div className="space-y-6">
                {listSections.map((section) => (
                  <section key={section.key}>
                    <HistoryDaySectionHeader section={section} onOpenMap={openDayMap} />
                    <div className="space-y-3">
                      {section.visits.map((v) => (
                        <VisitHistoryCard key={v.id} v={v} showOwner={splitByOwner} />
                      ))}
                    </div>
                  </section>
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
                  Далі
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {viewMode === "calendar" && !loading && items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Немає даних для календаря"
              description="У обраному періоді немає завершених візитів на поточній сторінці завантаження."
              action={
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Скинути фільтри
                </button>
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
