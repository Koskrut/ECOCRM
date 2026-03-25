"use client";

import { useEffect, useState } from "react";
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { apiHttp } from "@/lib/api/client";
import { AnalyticsDrilldownModal } from "@/components/analytics/AnalyticsDrilldownModal";
import { FiltersBar } from "@/components/analytics/FiltersBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import type { AnalyticsDrilldownType } from "@/components/analytics/analytics.types";
import { SimpleTable } from "@/components/analytics/SimpleTable";
import { useAnalyticsFilters } from "@/components/analytics/useAnalyticsFilters";

const COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#64748b"];

type LeadsResp = {
  period: { from: string; to: string };
  data: {
    kpi: {
      total: number;
      won: number;
      lost: number;
      inProgress: number;
      conversionProxy: number;
      exactConversionRate?: number;
      leadsWithConvertedOrder?: number;
    };
    byStatus: { status: string; count: number }[];
    bySource: { source: string; count: number }[];
  };
  compare?: LeadsResp["data"];
};

export default function AnalyticsLeadsPage() {
  const { dateFrom, dateTo, compare, managerId, setManagerId, querySuffix, onFiltersChange } =
    useAnalyticsFilters();
  const [managers, setManagers] = useState<{ id: string; fullName: string }[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [res, setRes] = useState<LeadsResp | null>(null);
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
      .get<LeadsResp>(`/analytics/leads${querySuffix}`)
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
  const byStatusChart = res?.data.byStatus.map((r) => ({ name: r.status, value: r.count })) ?? [];

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
            WON rate — проксі кваліфікації. Точна конверсія в угоду — за полем convertedOrderId (якщо
            заповнено).
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Усього лідів"
              value={String(k.total)}
              onDrill={() => setDrillType("leads_period")}
            />
            <KpiCard
              label="WON"
              value={String(k.won)}
              onDrill={() => setDrillType("leads_period")}
            />
            <KpiCard
              label="LOST"
              value={String(k.lost)}
              onDrill={() => setDrillType("leads_period")}
            />
            <KpiCard
              label="В роботі"
              value={String(k.inProgress)}
              onDrill={() => setDrillType("leads_period")}
            />
            <KpiCard
              label="WON rate (проксі)"
              value={`${k.conversionProxy}%`}
              onDrill={() => setDrillType("leads_period")}
            />
            {k.exactConversionRate != null && (
              <KpiCard
                label="Точна конверсія (order)"
                value={`${k.exactConversionRate}%`}
                sublabel={`зв’язано: ${k.leadsWithConvertedOrder ?? 0}`}
                onDrill={() => setDrillType("leads_period")}
              />
            )}
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">За статусом</h2>
              <div className="mt-2 h-64 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byStatusChart}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    >
                      {byStatusChart.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">За джерелом</h2>
              <div className="mt-2">
                <SimpleTable
                  columns={[
                    { key: "source", label: "Джерело" },
                    { key: "count", label: "Кількість" },
                  ]}
                  rows={(res?.data.bySource ?? []).map((r) => ({
                    source: r.source,
                    count: r.count,
                  }))}
                />
              </div>
            </div>
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
