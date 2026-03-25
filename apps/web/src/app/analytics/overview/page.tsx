"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { AnalyticsDrilldownModal } from "@/components/analytics/AnalyticsDrilldownModal";
import { FiltersBar } from "@/components/analytics/FiltersBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import type { AnalyticsDrilldownType } from "@/components/analytics/analytics.types";
import {
  deltaPct,
  formatMoneyUsd,
  useAnalyticsFilters,
} from "@/components/analytics/useAnalyticsFilters";

type OverviewResp = {
  period: { from: string; to: string };
  data: {
    kpi: {
      bookedRevenue: number;
      collectedPayments: number;
      ordersCount: number;
      avgCheck: number;
      debtTotal: number;
      overdueDebt: number;
      leadConversionProxy: number;
    };
    attention: {
      crm: {
        overdueTasksCount: number;
        stuckOrdersCount: number;
        leadsWithoutTouchCount: number;
      };
      finance: { overdueOrdersCount: number; overdueDebtAmount: number };
    };
  };
  compare?: OverviewResp["data"];
};

export default function AnalyticsOverviewPage() {
  const { dateFrom, dateTo, compare, managerId, setManagerId, querySuffix, onFiltersChange } =
    useAnalyticsFilters();
  const [managers, setManagers] = useState<{ id: string; fullName: string }[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [data, setData] = useState<OverviewResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillType, setDrillType] = useState<AnalyticsDrilldownType | null>(null);

  useEffect(() => {
    apiHttp.get<{ user?: { role?: string } }>("/auth/me").then((r) => setRole(r.data?.user?.role ?? null));
  }, []);

  useEffect(() => {
    if (role === "ADMIN") {
      apiHttp
        .get<{ items: { id: string; fullName: string }[] }>("/users")
        .then((r) => setManagers(r.data?.items ?? []))
        .catch(() => setManagers([]));
    }
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    apiHttp
      .get<OverviewResp>(`/analytics/overview${querySuffix}`)
      .then((r) => {
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
          body: JSON.stringify({
            sessionId: "18e84e",
            runId: "run-overview-3",
            hypothesisId: "H18",
            location: "overview/page.tsx:overviewSuccess",
            message: "Overview API success",
            data: {
              hasKpi: Boolean(r.data?.data?.kpi),
              ordersCount: r.data?.data?.kpi?.ordersCount ?? null,
              kpiKeys: r.data?.data?.kpi ? Object.keys(r.data.data.kpi) : [],
              attentionKeys: r.data?.data?.attention ? Object.keys(r.data.data.attention) : [],
              attentionCrmKeys: r.data?.data?.attention?.crm
                ? Object.keys(r.data.data.attention.crm)
                : [],
              attentionFinanceKeys: r.data?.data?.attention?.finance
                ? Object.keys(r.data.data.attention.finance)
                : [],
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (!cancelled) setData(r.data);
      })
      .catch((e) => {
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
          body: JSON.stringify({
            sessionId: "18e84e",
            runId: "run-2",
            hypothesisId: "H8",
            location: "overview/page.tsx:overviewError",
            message: "Overview API failed",
            data: {
              httpStatus: e?.response?.status ?? null,
              message: e?.response?.data?.message ?? e?.message ?? "unknown",
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (!cancelled) setErr(e?.response?.data?.message ?? "Не вдалося завантажити");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [querySuffix]);

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
      body: JSON.stringify({
        sessionId: "18e84e",
        runId: "run-1",
        hypothesisId: "H2",
        location: "overview/page.tsx:drillTypeEffect",
        message: "Overview drill type changed",
        data: { drillType, hasData: Boolean(data) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [drillType, data]);

  const k = data?.data.kpi;
  const c = data?.compare?.kpi;

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
      body: JSON.stringify({
        sessionId: "18e84e",
        runId: "run-2",
        hypothesisId: "H9",
        location: "overview/page.tsx:renderState",
        message: "Overview render state",
        data: { loading, hasErr: Boolean(err), hasKpi: Boolean(k), role },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [loading, err, k, role]);

  useEffect(() => {
    if (!k || !data) return;
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
      body: JSON.stringify({
        sessionId: "18e84e",
        runId: "run-overview-3",
        hypothesisId: "H19",
        location: "overview/page.tsx:kpiSnapshot",
        message: "Overview KPI snapshot",
        data: {
          bookedRevenue: k.bookedRevenue,
          collectedPayments: k.collectedPayments,
          ordersCount: k.ordersCount,
          avgCheck: k.avgCheck,
          debtTotal: k.debtTotal,
          overdueDebt: k.overdueDebt,
          leadConversionProxy: k.leadConversionProxy,
          attention: data.data.attention,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [k, data]);

  return (
    <>
      <FiltersBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        compare={compare}
        onChange={onFiltersChange}
        showManagerFilter={role === "ADMIN"}
        managerId={managerId}
        managers={managers}
        onManagerChange={setManagerId}
      />

      {loading && <p className="text-sm text-zinc-500">Завантаження…</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      {k && (
        <>
          <p className="mb-3 text-xs text-zinc-500">
            WON rate — проксі кваліфікації лідів, не комерційна конверсія. Booked ≠ Collected (різні дати).
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Booked revenue"
              value={formatMoneyUsd(k.bookedRevenue)}
              deltaPct={compare && c ? deltaPct(k.bookedRevenue, c.bookedRevenue) : null}
              onDrill={() => setDrillType("orders_period")}
            />
            <KpiCard
              label="Collected payments"
              value={formatMoneyUsd(k.collectedPayments)}
              sublabel="за датою оплати"
              deltaPct={compare && c ? deltaPct(k.collectedPayments, c.collectedPayments) : null}
              onDrill={() => setDrillType("payments_period")}
            />
            <KpiCard
              label="Замовлень"
              value={String(k.ordersCount)}
              deltaPct={compare && c ? deltaPct(k.ordersCount, c.ordersCount) : null}
              onDrill={() => setDrillType("orders_period")}
            />
            <KpiCard
              label="Середній чек"
              value={formatMoneyUsd(k.avgCheck)}
              deltaPct={compare && c ? deltaPct(k.avgCheck, c.avgCheck) : null}
              onDrill={() => setDrillType("orders_period")}
            />
            <KpiCard label="Дебіторка (зараз)" value={formatMoneyUsd(k.debtTotal)} />
            <KpiCard
              label="Прострочена дебіторка"
              value={formatMoneyUsd(k.overdueDebt)}
              onDrill={() => setDrillType("overdue_orders")}
            />
            <KpiCard
              label="WON rate (проксі)"
              value={`${k.leadConversionProxy}%`}
              onDrill={() => setDrillType("leads_period")}
            />
          </div>

          <h2 className="mt-8 text-sm font-semibold text-zinc-900">Увага (лічильники)</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Прострочені задачі"
              value={String(data.data.attention.crm.overdueTasksCount)}
              onDrill={() => setDrillType("overdue_tasks")}
            />
            <KpiCard label="Застряглі замовлення" value={String(data.data.attention.crm.stuckOrdersCount)} />
            <KpiCard label="Ліди без дотику" value={String(data.data.attention.crm.leadsWithoutTouchCount)} />
            <KpiCard
              label="Прострочені замовлення"
              value={String(data.data.attention.finance.overdueOrdersCount)}
              onDrill={() => setDrillType("overdue_orders")}
            />
          </div>
        </>
      )}
      <AnalyticsDrilldownModal
        open={drillType != null}
        type={drillType}
        filterQuerySuffix={querySuffix}
        onClose={() => setDrillType(null)}
      />
    </>
  );
}
