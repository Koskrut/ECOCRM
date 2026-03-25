"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { FiltersBar } from "@/components/analytics/FiltersBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { SimpleTable } from "@/components/analytics/SimpleTable";
import { useAnalyticsFilters } from "@/components/analytics/useAnalyticsFilters";

type VisitsData = {
  total: number;
  done: number;
  canceled: number;
  completionRate: number;
  byOutcome: { outcome: string; count: number }[];
};

type VisitsResp = { period: { from: string; to: string }; data: VisitsData };

export default function AnalyticsVisitsPage() {
  const { dateFrom, dateTo, compare, managerId, setManagerId, querySuffix, onFiltersChange } =
    useAnalyticsFilters();
  const [userList, setUserList] = useState<{ id: string; fullName: string }[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [res, setRes] = useState<VisitsResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiHttp.get<{ user?: { role?: string } }>("/auth/me").then((r) => setRole(r.data?.user?.role ?? null));
  }, []);

  useEffect(() => {
    if (role === "ADMIN") {
      apiHttp
        .get<{ items: { id: string; fullName: string }[] }>("/users")
        .then((r) => setUserList(r.data?.items ?? []))
        .catch(() => setUserList([]));
    }
  }, [role]);

  useEffect(() => {
    let c = false;
    setLoading(true);
    setErr(null);
    apiHttp
      .get<VisitsResp>(`/analytics/visits${querySuffix}`)
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

  const d = res?.data;

  return (
    <>
      <FiltersBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        compare={compare}
        onChange={onFiltersChange}
        showManagerFilter={role === "ADMIN"}
        managerId={managerId}
        managers={userList}
        onManagerChange={setManagerId}
      />
      {loading && <p className="text-sm text-zinc-500">Завантаження…</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Усього візитів" value={String(d.total)} />
            <KpiCard label="Завершено" value={String(d.done)} />
            <KpiCard label="Скасовано" value={String(d.canceled)} />
            <KpiCard label="Completion rate" value={`${d.completionRate}%`} />
          </div>
          <h2 className="mt-8 text-sm font-semibold text-zinc-900">Результат (outcome)</h2>
          <div className="mt-2">
            <SimpleTable
              columns={[
                { key: "outcome", label: "Результат" },
                { key: "count", label: "Кількість" },
              ]}
              rows={d.byOutcome.map((x) => ({ outcome: x.outcome, count: x.count }))}
            />
          </div>
        </>
      )}
    </>
  );
}
