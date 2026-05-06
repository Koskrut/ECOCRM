"use client";

import { useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import {
  AnalyticsErrorPanel,
  AnalyticsFiltersBar,
  AnalyticsOverviewSkeleton,
  KpiDeltaCard,
  formatMoneyUsd,
  formatMoneyUsdFine,
  formatNumber,
  useAnalyticsFetch,
  useAnalyticsFilters,
} from "../analytics-ui";
import { OrdersByStageBarChart } from "../overview/overview-charts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Link from "next/link";
import { deltaCountLine, deltaMoneyLine, deltaMoneyLineFine } from "../analytics-delta";

type SalesKpi = {
  bookedRevenue: number;
  collectedPayments: number;
  ordersCount: number;
  avgCheck: number;
  overdueTasksCount: number;
};

type SalesCompareKpi = SalesKpi;

type SalesResponse = {
  data: {
    kpi: SalesKpi;
    byStage: { stage: string; count: number }[];
  };
  /** Prior-period KPIs (incl. overdue tasks); no byStage. */
  compare?: { kpi: SalesCompareKpi };
};

type ManagerRow = {
  id: string;
  name: string;
  bookedRevenue: number;
  collectedPayments: number;
  ordersCount: number;
  avgCheck: number;
  overdueTasks: number;
};

type ManagersResponse = { managers: ManagerRow[] };

type SortKey =
  | "name"
  | "bookedRevenue"
  | "collectedPayments"
  | "ordersCount"
  | "avgCheck"
  | "overdueTasks";
type SortDir = "asc" | "desc";
type NumericSortKey = Exclude<SortKey, "name">;

function getManagerNumericSortValue(row: ManagerRow, key: NumericSortKey): number {
  switch (key) {
    case "bookedRevenue":
      return row.bookedRevenue;
    case "collectedPayments":
      return row.collectedPayments;
    case "ordersCount":
      return row.ordersCount;
    case "avgCheck":
      return row.avgCheck;
    case "overdueTasks":
      return row.overdueTasks;
    default:
      return 0;
  }
}

function parseYmd(dateYmd: string) {
  const [y, m, d] = dateYmd.split("-").map((x) => Number(x));
  return { y, m, d };
}

function toYmdUTC(date: Date) {
  return date.toISOString().slice(0, 10);
}

function previousPeriodOfSameLengthUTC(
  fromYmd: string,
  toYmd: string,
): { prevFrom: string; prevTo: string } {
  const f = parseYmd(fromYmd);
  const t = parseYmd(toYmd);

  const fromStart = Date.UTC(f.y, f.m - 1, f.d, 0, 0, 0, 0);
  const toEnd = Date.UTC(t.y, t.m - 1, t.d, 23, 59, 59, 999);
  const msPerDay = 86400000;
  const days = Math.floor((toEnd - fromStart) / msPerDay) + 1;

  const prevTo = new Date(fromStart);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);

  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1));

  return { prevFrom: toYmdUTC(prevFrom), prevTo: toYmdUTC(prevTo) };
}

function ManagerBookedRevenueChart({ rows }: { rows: ManagerRow[] }) {
  const data = rows
    .slice(0, 10)
    .sort((a, b) => b.bookedRevenue - a.bookedRevenue)
    .map((r) => ({ name: r.name, bookedRevenue: r.bookedRevenue }));

  if (data.length === 0) {
    return (
      <div className="flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Booked revenue by manager</h3>
        <p className="mt-0.5 text-xs text-zinc-500">Поточний період, USD.</p>
        <div className="mt-3 min-h-[240px] flex items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 text-sm text-zinc-500">
          Немає даних
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Booked revenue by manager</h3>
        <p className="mt-0.5 text-xs text-zinc-500">Поточний період (createdAt), USD.</p>
      </div>
      <div className="mt-3 min-h-[260px] w-full min-w-0 flex-1 overflow-x-auto">
        <ResponsiveContainer width="100%" height={260} minWidth={320}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fontSize: 10, fill: "#64748b" }}
            />
            <Tooltip
              formatter={(value: number) => [
                `${Math.round(value).toLocaleString("en-US")} $`,
                "Booked",
              ]}
              contentStyle={{ borderRadius: "8px", border: "1px solid #e4e4e7", fontSize: "12px" }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              wrapperStyle={{ fontSize: "11px", paddingBottom: 4 }}
            />
            <Bar
              dataKey="bookedRevenue"
              fill="#10b981"
              radius={[0, 4, 4, 0]}
              name="Booked revenue"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-4 py-3 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${
          active ? "text-zinc-900" : "text-zinc-500"
        } hover:text-zinc-900`}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {active ? (
          <span className="text-[10px] text-zinc-500">{dir === "asc" ? "▲" : "▼"}</span>
        ) : null}
      </button>
    </th>
  );
}

export default function AnalyticsSalesPage() {
  const filters = useAnalyticsFilters();

  const {
    data: salesData,
    loading: salesLoading,
    error: salesError,
  } = useAnalyticsFetch<SalesResponse>("sales", filters.querySuffix);

  const {
    data: managersData,
    loading: managersLoading,
    error: managersError,
  } = useAnalyticsFetch<ManagersResponse>("managers", filters.querySuffix);

  const kpi = salesData?.data.kpi;
  const compareKpi = salesData?.compare?.kpi;
  const byStage = salesData?.data.byStage ?? [];
  const managers = useMemo(() => managersData?.managers ?? [], [managersData?.managers]);

  const attentionHref = useMemo(
    () => `/analytics/attention${filters.querySuffix}`,
    [filters.querySuffix],
  );

  const [prevManagers, setPrevManagers] = useState<ManagersResponse | null>(null);
  const [prevManagersLoading, setPrevManagersLoading] = useState(false);
  const [prevManagersError, setPrevManagersError] = useState<string | null>(null);

  useEffect(() => {
    if (!filters.comparePrev) return;
    const { prevFrom, prevTo } = previousPeriodOfSameLengthUTC(filters.dateFrom, filters.dateTo);

    const qs = new URLSearchParams();
    qs.set("dateFrom", prevFrom);
    qs.set("dateTo", prevTo);
    qs.set("period", "custom");
    if (filters.managerId) qs.set("managerId", filters.managerId);

    let active = true;
    setPrevManagersLoading(true);
    setPrevManagersError(null);
    setPrevManagers(null);

    apiHttp
      .get<ManagersResponse>(`/analytics/managers?${qs.toString()}`)
      .then((res) => {
        if (!active) return;
        setPrevManagers(res.data);
      })
      .catch((e) => {
        if (!active) return;
        setPrevManagersError(e instanceof Error ? e.message : "Failed to load previous managers");
      })
      .finally(() => {
        if (!active) return;
        setPrevManagersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters.comparePrev, filters.dateFrom, filters.dateTo, filters.managerId]);

  const declineTop = useMemo(() => {
    if (!filters.comparePrev) return [];
    const prevMap = new Map<string, number>();
    for (const m of prevManagers?.managers ?? []) prevMap.set(m.id, m.bookedRevenue);

    const rows: Array<{
      id: string;
      name: string;
      currentBooked: number;
      previousBooked: number;
      deltaBooked: number;
    }> = [];

    for (const cur of managers) {
      const prev = prevMap.get(cur.id);
      if (prev === undefined) continue;
      if (prev === 0) continue;
      const delta = cur.bookedRevenue - prev;
      if (delta >= 0) continue;
      rows.push({
        id: cur.id,
        name: cur.name,
        currentBooked: cur.bookedRevenue,
        previousBooked: prev,
        deltaBooked: delta,
      });
    }

    rows.sort((a, b) => Math.abs(b.deltaBooked) - Math.abs(a.deltaBooked));
    return rows.slice(0, 10);
  }, [filters.comparePrev, managers, prevManagers]);

  const overdueManagersTop = useMemo(() => {
    return managers
      .filter((m) => m.overdueTasks > 0)
      .sort((a, b) => b.overdueTasks - a.overdueTasks)
      .slice(0, 10);
  }, [managers]);

  const [sortKey, setSortKey] = useState<SortKey>("bookedRevenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sortedManagers = useMemo(() => {
    const dirMul = sortDir === "asc" ? 1 : -1;
    const rows = [...managers];
    rows.sort((a, b) => {
      if (sortKey === "name") return dirMul * a.name.localeCompare(b.name, "uk");
      const numericKey = sortKey as NumericSortKey;
      return (
        dirMul *
        (getManagerNumericSortValue(a, numericKey) - getManagerNumericSortValue(b, numericKey))
      );
    });
    return rows;
  }, [managers, sortDir, sortKey]);

  const toggleSort = (nextKey: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === nextKey) {
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir(nextKey === "name" ? "asc" : "desc");
      return nextKey;
    });
  };

  if (salesLoading || managersLoading) {
    return (
      <div className="space-y-4">
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
        <AnalyticsOverviewSkeleton />
      </div>
    );
  }

  if (salesError || managersError) {
    return (
      <div className="space-y-4">
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
        <AnalyticsErrorPanel
          message={salesError || managersError || "Failed to load sales data"}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      <div className="min-w-0 space-y-8">
        <section className="min-w-0">
          <h2 className="text-lg font-semibold text-zinc-900">Sales overview</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Поточні продажі за період + порівняння vs попередній період (compare).
          </p>

          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiDeltaCard
              variant="money"
              title="Booked revenue"
              subtitle="USD, createdAt (period-based)"
              tooltip="Booked revenue = max(0, totalAmount − returnAdjustmentAmount) → USD."
              value={formatMoneyUsd(kpi?.bookedRevenue)}
              deltaLabel={
                filters.comparePrev
                  ? deltaMoneyLine(kpi?.bookedRevenue ?? 0, compareKpi?.bookedRevenue)
                  : null
              }
            />
            <KpiDeltaCard
              variant="count"
              title="Orders count"
              subtitle="Orders у періоді (createdAt)"
              value={formatNumber(kpi?.ordersCount)}
              deltaLabel={
                filters.comparePrev
                  ? deltaCountLine(kpi?.ordersCount ?? 0, compareKpi?.ordersCount)
                  : null
              }
            />
            <KpiDeltaCard
              variant="money"
              title="Avg check"
              subtitle="Booked / orders (USD)"
              value={formatMoneyUsdFine(kpi?.avgCheck)}
              deltaLabel={
                filters.comparePrev
                  ? deltaMoneyLineFine(kpi?.avgCheck ?? 0, compareKpi?.avgCheck)
                  : null
              }
            />
            <KpiDeltaCard
              variant="money"
              title="Collected payments"
              subtitle="USD, COMPLETED + paidAt (period-based)"
              tooltip="Collected payments ≠ booked revenue."
              value={formatMoneyUsd(kpi?.collectedPayments)}
              deltaLabel={
                filters.comparePrev
                  ? deltaMoneyLine(kpi?.collectedPayments ?? 0, compareKpi?.collectedPayments)
                  : null
              }
            />
            <KpiDeltaCard
              variant="risk"
              title="Overdue tasks (period)"
              subtitle="OPEN/IN_PROGRESS, dueAt у вибраному діапазоні"
              tooltip="Узгоджено з overview / managers / attention для того ж періоду."
              value={formatNumber(kpi?.overdueTasksCount)}
              deltaLabel={
                filters.comparePrev
                  ? deltaCountLine(kpi?.overdueTasksCount ?? 0, compareKpi?.overdueTasksCount)
                  : null
              }
            />
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Manager performance</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Сортування по KPI (без proxy / без generic activities).
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-[920px] border-collapse text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-left text-zinc-500">
                <tr>
                  <SortableTh
                    label="Manager"
                    active={sortKey === "name"}
                    dir={sortDir}
                    onClick={() => toggleSort("name")}
                  />
                  <SortableTh
                    label="Booked revenue"
                    active={sortKey === "bookedRevenue"}
                    dir={sortDir}
                    onClick={() => toggleSort("bookedRevenue")}
                    align="right"
                  />
                  <SortableTh
                    label="Collected payments"
                    active={sortKey === "collectedPayments"}
                    dir={sortDir}
                    onClick={() => toggleSort("collectedPayments")}
                    align="right"
                  />
                  <SortableTh
                    label="Orders"
                    active={sortKey === "ordersCount"}
                    dir={sortDir}
                    onClick={() => toggleSort("ordersCount")}
                    align="right"
                  />
                  <SortableTh
                    label="Avg check"
                    active={sortKey === "avgCheck"}
                    dir={sortDir}
                    onClick={() => toggleSort("avgCheck")}
                    align="right"
                  />
                  <SortableTh
                    label="Overdue tasks (period)"
                    active={sortKey === "overdueTasks"}
                    dir={sortDir}
                    onClick={() => toggleSort("overdueTasks")}
                    align="right"
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sortedManagers.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-zinc-500" colSpan={6}>
                      Немає менеджерів у вибраному періоді.
                    </td>
                  </tr>
                ) : (
                  sortedManagers.map((m) => (
                    <tr key={m.id} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-3 font-medium text-zinc-900">{m.name}</td>
                      <td className="px-4 py-3 text-right">{formatMoneyUsd(m.bookedRevenue)}</td>
                      <td className="px-4 py-3 text-right">
                        {formatMoneyUsd(m.collectedPayments)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatNumber(m.ordersCount)}</td>
                      <td className="px-4 py-3 text-right">{formatMoneyUsdFine(m.avgCheck)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(m.overdueTasks)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Charts</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Поточний період only. Booked і Collected — не змішуються.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ManagerBookedRevenueChart rows={managers} />
            <OrdersByStageBarChart rows={byStage} />
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Risk / coaching signals</h3>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-amber-200/60 bg-amber-50/20 p-4 shadow-sm">
              <h4 className="text-sm font-semibold text-zinc-900">
                Declining booked revenue vs previous period
              </h4>
              <p className="mt-1 text-xs text-amber-900/80">
                Top-10 негативних delta. Якщо prev відсутній або prev=0 — не класифікуємо.
              </p>

              {!filters.comparePrev ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-white/60 p-3 text-xs text-amber-900/70">
                  Увімкніть compare=prev_period, щоб побачити ризик падіння.
                </div>
              ) : prevManagersLoading ? (
                <div className="mt-3 h-24 animate-pulse rounded-lg bg-white/60" />
              ) : prevManagersError ? (
                <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                  {prevManagersError}
                </div>
              ) : declineTop.length === 0 ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-white/60 p-3 text-xs text-amber-900/70">
                  Немає менеджерів з падінням booked revenue у цьому порівнянні.
                </div>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-lg bg-white">
                  <table className="min-w-[460px] text-xs">
                    <thead className="bg-zinc-50 text-left text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Manager</th>
                        <th className="px-3 py-2 font-medium text-right">Current</th>
                        <th className="px-3 py-2 font-medium text-right">Previous</th>
                        <th className="px-3 py-2 font-medium text-right">Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {declineTop.map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2 font-medium text-zinc-900">{r.name}</td>
                          <td className="px-3 py-2 text-right">
                            {formatMoneyUsd(r.currentBooked)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatMoneyUsd(r.previousBooked)}
                          </td>
                          <td className="px-3 py-2 text-right text-red-700">
                            {formatMoneyUsd(r.deltaBooked)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h4 className="text-sm font-semibold text-zinc-900">Managers with overdue tasks</h4>
              <p className="mt-1 text-xs text-zinc-500">
                Серед менеджерів, представлених у selected sales period (GET /analytics/managers).
              </p>
              {overdueManagersTop.length === 0 ? (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/40 p-3 text-xs text-zinc-600">
                  Немає менеджерів з overdue tasks у цьому періоді.
                </div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-[420px] text-xs">
                    <thead className="bg-zinc-50 text-left text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Manager</th>
                        <th className="px-3 py-2 font-medium text-right">Overdue tasks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {overdueManagersTop.map((m) => (
                        <tr key={m.id}>
                          <td className="px-3 py-2 font-medium text-zinc-900">{m.name}</td>
                          <td className="px-3 py-2 text-right text-amber-800">
                            {formatNumber(m.overdueTasks)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-3 text-xs text-zinc-500">
                Для деталей:{" "}
                <Link
                  href={`${attentionHref}#overdue-tasks`}
                  scroll={false}
                  className="text-zinc-900 underline underline-offset-2"
                >
                  Attention
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
