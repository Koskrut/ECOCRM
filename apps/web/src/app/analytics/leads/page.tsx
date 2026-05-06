"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AnalyticsErrorPanel,
  AnalyticsFiltersBar,
  AnalyticsOverviewSkeleton,
  KpiDeltaCard,
  formatNumber,
  formatPercent,
  useAnalyticsFetch,
  useAnalyticsFilters,
} from "../analytics-ui";
import {
  LeadsBySourceBarChart,
  LeadsByStatusBarChart,
  LeadsCreatedTrendChart,
  LostReasonsBarChart,
} from "./leads-charts";
import { deltaCountLine, deltaPctPoints } from "../analytics-delta";

type LeadsKpi = {
  leadsCreated: number;
  won: number;
  lost: number;
  inProgress: number;
  wonShareProxy: number;
  exactConversionRate?: number;
  leadsWithConvertedOrder?: number;
};

type LeadsAttention = {
  leadsWithoutTouchCount: number;
  neverContactedNewLeadsCount: number;
  staleInProgressLeadsCount: number;
  leadsWithoutOwnerCount: number;
  leadsUnknownSourceProxyCount: number;
  overdueLeadTasksCount: number;
};

type LeadsPayload = {
  kpi: LeadsKpi;
  charts: {
    leadsCreatedByDay: { date: string; count: number }[];
    bySource: { source: string; count: number }[];
    byStatus: { status: string; count: number }[];
    lostReasons?: { reason: string; count: number }[];
  };
  tables: {
    bySource: { key: string; count: number; share: number }[];
    byStatus: { key: string; count: number; share: number }[];
  };
  attention: LeadsAttention;
};

type LeadsResponse = {
  data: LeadsPayload;
  /** Prior-period payload (same shape as `data`, including attention). */
  compare?: LeadsPayload;
};

type SortKey = "key" | "count" | "share";
type SortDir = "asc" | "desc";

function sortRows<T extends Record<string, unknown>>(rows: T[], key: SortKey, dir: SortDir): T[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
    return String(av).localeCompare(String(bv), "uk") * mul;
  });
}

export default function AnalyticsLeadsPage() {
  const filters = useAnalyticsFilters();
  const [refreshKey, setRefreshKey] = useState(0);
  const [sourceSort, setSourceSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "count",
    dir: "desc",
  });

  const { data, loading, error } = useAnalyticsFetch<LeadsResponse>(
    "leads",
    filters.querySuffix,
    refreshKey,
  );

  const kpi = data?.data.kpi;
  const charts = data?.data.charts;
  const attention = data?.data.attention;
  const tables = data?.data.tables;
  const cmp = data?.compare?.kpi;

  const attentionHref = useMemo(
    () => `/analytics/attention${filters.querySuffix}`,
    [filters.querySuffix],
  );

  const sortedSourceRows = useMemo(
    () => sortRows(tables?.bySource ?? [], sourceSort.key, sourceSort.dir),
    [tables?.bySource, sourceSort],
  );

  const toggleSourceSort = (key: SortKey) => {
    setSourceSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "key" ? "asc" : "desc" },
    );
  };

  const sortIndicator = (key: SortKey) =>
    sourceSort.key === key ? (sourceSort.dir === "asc" ? " ↑" : " ↓") : "";

  const filtersBar = (
    <AnalyticsFiltersBar
      dateFrom={filters.dateFrom}
      dateTo={filters.dateTo}
      managerId={filters.managerId}
      managers={filters.managers}
      rangePreset={filters.rangePreset}
      comparePrev={filters.comparePrev}
      onDateFromChange={filters.setDateFrom}
      onDateToChange={filters.setDateTo}
      onManagerIdChange={filters.setManagerId}
      onRangePresetChange={filters.setRangePreset}
      onComparePrevChange={filters.setComparePrev}
    />
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {filtersBar}
        <AnalyticsOverviewSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {filtersBar}
        <AnalyticsErrorPanel message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
      </div>
    );
  }

  const showExact = kpi?.exactConversionRate != null && kpi?.leadsWithConvertedOrder != null;
  const showLostReasons = (charts?.lostReasons?.length ?? 0) > 0;

  return (
    <div className="min-w-0 space-y-8">
      {filtersBar}

      <section className="min-w-0">
        <h2 className="text-lg font-semibold text-zinc-900">Ліди — KPI</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Періодні метрики — за датою створення ліда (createdAt). Дельта показується лише з
          увімкненим порівнянням. Знімки внизу (без дотику, задачі) — стан «зараз», без дельти до
          попереднього періоду.
        </p>
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiDeltaCard
            variant="count"
            title="Створені ліди"
            subtitle="createdAt у вибраному періоді"
            value={formatNumber(kpi?.leadsCreated)}
            deltaLabel={
              filters.comparePrev ? deltaCountLine(kpi?.leadsCreated ?? 0, cmp?.leadsCreated) : null
            }
          />
          <KpiDeltaCard
            variant="count"
            title="WON"
            subtitle="Статус WON у періоді"
            tooltip="Не плутати з виручкою замовлень."
            value={formatNumber(kpi?.won)}
            deltaLabel={filters.comparePrev ? deltaCountLine(kpi?.won ?? 0, cmp?.won) : null}
          />
          <KpiDeltaCard
            variant="percent"
            title="Частка WON (proxy)"
            subtitle="WON / створені в періоді"
            tooltip="Це частка лідів зі статусом WON серед створених у періоді, не конверсія в замовлення."
            value={formatPercent(kpi?.wonShareProxy)}
            deltaLabel={
              filters.comparePrev
                ? deltaPctPoints(kpi?.wonShareProxy ?? 0, cmp?.wonShareProxy)
                : null
            }
          />
          <KpiDeltaCard
            variant="count"
            title="LOST"
            subtitle="Статус LOST у періоді"
            tooltip="Лише enum LOST. NOT_TARGET / SPAM — окремі статуси."
            value={formatNumber(kpi?.lost)}
            deltaLabel={filters.comparePrev ? deltaCountLine(kpi?.lost ?? 0, cmp?.lost) : null}
          />
          <KpiDeltaCard
            variant="count"
            title="В роботі"
            subtitle="IN_PROGRESS, створені в періоді"
            value={formatNumber(kpi?.inProgress)}
            deltaLabel={
              filters.comparePrev ? deltaCountLine(kpi?.inProgress ?? 0, cmp?.inProgress) : null
            }
          />
          {showExact ? (
            <KpiDeltaCard
              variant="percent"
              title="Exact: лід → замовлення"
              subtitle={`Записаний зв’язок (convertedOrderId), не статус WON. У періоді: ${formatNumber(kpi?.leadsWithConvertedOrder)} лідів`}
              tooltip="Частка лідів, створених у періоді, у яких заповнено convertedOrderId після конверсії з замовленням. Не плутати з «Частка WON (proxy)»."
              value={formatPercent(kpi?.exactConversionRate)}
              deltaLabel={
                filters.comparePrev
                  ? deltaPctPoints(kpi?.exactConversionRate ?? 0, cmp?.exactConversionRate)
                  : null
              }
            />
          ) : null}
        </div>
      </section>

      <section className="min-w-0">
        <h2 className="text-lg font-semibold text-zinc-900">Графіки</h2>
        <p className="mt-1 text-sm text-zinc-500">Лише поточний період; вісь часу — UTC.</p>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
          <LeadsCreatedTrendChart rows={charts?.leadsCreatedByDay ?? []} />
          <LeadsBySourceBarChart rows={charts?.bySource ?? []} />
          <LeadsByStatusBarChart rows={charts?.byStatus ?? []} />
          {showLostReasons ? <LostReasonsBarChart rows={charts?.lostReasons ?? []} /> : null}
        </div>
      </section>

      <section className="min-w-0">
        <h2 className="text-lg font-semibold text-zinc-900">Джерела — зведення</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Частка від усіх лідів, створених у періоді. Клік по заголовку — сортування.
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      className="hover:text-zinc-800"
                      onClick={() => toggleSourceSort("key")}
                    >
                      Джерело{sortIndicator("key")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      className="hover:text-zinc-800"
                      onClick={() => toggleSourceSort("count")}
                    >
                      Кількість{sortIndicator("count")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      className="hover:text-zinc-800"
                      onClick={() => toggleSourceSort("share")}
                    >
                      Частка{sortIndicator("share")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSourceRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-zinc-500" colSpan={3}>
                      Немає даних
                    </td>
                  </tr>
                ) : (
                  sortedSourceRows.map((row) => (
                    <tr key={row.key} className="border-t border-zinc-100">
                      <td className="px-4 py-3 text-zinc-800">{row.key.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-zinc-800">{formatNumber(row.count)}</td>
                      <td className="px-4 py-3 text-zinc-800">{formatPercent(row.share)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="min-w-0">
        <h2 className="text-lg font-semibold text-zinc-900">Ризики та увага (знімок)</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Не залежать від дат періоду на сторінці — це поточний стан у межах обраного менеджера /
          команди. Без дельти «vs попередній». Частина визначень збігається з{" "}
          <Link
            href={attentionHref}
            className="font-medium text-indigo-600 underline-offset-2 hover:underline"
          >
            /analytics/attention
          </Link>
          .
        </p>
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiDeltaCard
            variant="risk"
            title="Без недавнього дотику"
            subtitle="Як у overview: NEW &gt;3д без активності 3д або IP &gt;7д без активності 7д"
            tooltip="Базується на Activity, не на lastActivityAt."
            value={formatNumber(attention?.leadsWithoutTouchCount)}
            deltaLabel={null}
          />
          <KpiDeltaCard
            variant="risk"
            title="NEW без жодної активності"
            subtitle="Жодного запису Activity"
            value={formatNumber(attention?.neverContactedNewLeadsCount)}
            deltaLabel={null}
          />
          <KpiDeltaCard
            variant="risk"
            title="Застарілі IN_PROGRESS"
            subtitle="Створені ≥7д тому, без Activity за 7д"
            value={formatNumber(attention?.staleInProgressLeadsCount)}
            deltaLabel={null}
          />
          <KpiDeltaCard
            variant="risk"
            title="Без власника"
            subtitle="ownerId порожній у видимій вибірці"
            value={formatNumber(attention?.leadsWithoutOwnerCount)}
            deltaLabel={null}
          />
          <KpiDeltaCard
            variant="risk"
            title="OTHER (proxy невідомого джерела)"
            subtitle="Лічильник лідів source=OTHER зараз"
            tooltip="Enum за замовчуванням може маскувати реальне джерело."
            value={formatNumber(attention?.leadsUnknownSourceProxyCount)}
            deltaLabel={null}
          />
          <KpiDeltaCard
            variant="risk"
            title="Прострочені задачі на лід"
            subtitle="Task з leadId, OPEN/IN_PROGRESS, dueAt &lt; зараз"
            tooltip="Той самий assignee scope, що й overdue tasks у overview."
            value={formatNumber(attention?.overdueLeadTasksCount)}
            deltaLabel={null}
          />
        </div>
      </section>

      <section className="min-w-0">
        <h2 className="text-lg font-semibold text-zinc-900">Статуси — зведення</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Кількість</th>
                  <th className="px-4 py-3 font-medium">Частка</th>
                </tr>
              </thead>
              <tbody>
                {(tables?.byStatus ?? []).length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-zinc-500" colSpan={3}>
                      Немає даних
                    </td>
                  </tr>
                ) : (
                  tables?.byStatus.map((row) => (
                    <tr key={row.key} className="border-t border-zinc-100">
                      <td className="px-4 py-3 text-zinc-800">{row.key}</td>
                      <td className="px-4 py-3 text-zinc-800">{formatNumber(row.count)}</td>
                      <td className="px-4 py-3 text-zinc-800">{formatPercent(row.share)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
