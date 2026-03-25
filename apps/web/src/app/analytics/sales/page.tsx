"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

type SalesResp = {
  period: { from: string; to: string };
  data: {
    kpi: {
      bookedRevenue: number;
      collectedPayments: number;
      ordersCount: number;
      avgCheck: number;
    };
    byStage: { stage: string; count: number }[];
  };
  compare?: SalesResp["data"];
};

export default function AnalyticsSalesPage() {
  const { dateFrom, dateTo, compare, managerId, setManagerId, querySuffix, onFiltersChange } =
    useAnalyticsFilters();
  const [managers, setManagers] = useState<{ id: string; fullName: string }[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [res, setRes] = useState<SalesResp | null>(null);
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
    let c = false;
    setLoading(true);
    setErr(null);
    apiHttp
      .get<SalesResp>(`/analytics/sales${querySuffix}`)
      .then((r) => {
        if (!c) setRes(r.data);
      })
      .catch((e) => {
        if (!c) setErr(e?.response?.data?.message ?? "Не вдалося завантажити");
      })
      .finally(() => {
        if (!c) setLoading(false);
      });
    return () => {
      c = true;
    };
  }, [querySuffix]);

  const k = res?.data.kpi;
  const prev = res?.compare?.kpi;
  const chartData =
    res?.data.byStage.map((r) => ({
      name: r.stage,
      count: r.count,
    })) ?? [];

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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Booked revenue"
              value={formatMoneyUsd(k.bookedRevenue)}
              deltaPct={compare && prev ? deltaPct(k.bookedRevenue, prev.bookedRevenue) : null}
              onDrill={() => setDrillType("orders_period")}
            />
            <KpiCard
              label="Collected payments"
              value={formatMoneyUsd(k.collectedPayments)}
              deltaPct={compare && prev ? deltaPct(k.collectedPayments, prev.collectedPayments) : null}
              onDrill={() => setDrillType("payments_period")}
            />
            <KpiCard
              label="Замовлень"
              value={String(k.ordersCount)}
              deltaPct={compare && prev ? deltaPct(k.ordersCount, prev.ordersCount) : null}
              onDrill={() => setDrillType("orders_period")}
            />
            <KpiCard
              label="Середній чек"
              value={formatMoneyUsd(k.avgCheck)}
              deltaPct={compare && prev ? deltaPct(k.avgCheck, prev.avgCheck) : null}
              onDrill={() => setDrillType("orders_period")}
            />
          </div>
          <h2 className="mt-8 text-sm font-semibold text-zinc-900">Воронка за стадією</h2>
          <div className="mt-2 h-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" name="Кількість" />
              </BarChart>
            </ResponsiveContainer>
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
