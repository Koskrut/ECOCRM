"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { FiltersBar } from "@/components/analytics/FiltersBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { SimpleTable } from "@/components/analytics/SimpleTable";
import { useAnalyticsFilters } from "@/components/analytics/useAnalyticsFilters";

type OperationsResp = {
  period: { from: string; to: string };
  data: {
    kpi: {
      readyToShip: number;
      inTransit: number;
      delivered: number;
      withTtn: number;
      withoutTtn: number;
    };
    byOrderStatus: { status: string; count: number }[];
    byShipmentStatus: { status: string; count: number }[];
  };
};

export default function AnalyticsOperationsPage() {
  const { dateFrom, dateTo, compare, managerId, setManagerId, querySuffix, onFiltersChange } =
    useAnalyticsFilters();
  const [userList, setUserList] = useState<{ id: string; fullName: string }[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [res, setRes] = useState<OperationsResp | null>(null);
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
      .get<OperationsResp>(`/analytics/operations${querySuffix}`)
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

  const data = res?.data;

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
      {data && (
        <>
          <p className="mb-3 text-xs text-zinc-500">
            Операційний зріз: статуси замовлень/відвантажень і покриття TTN по замовленнях у періоді.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="Готові до відправки" value={String(data.kpi.readyToShip)} />
            <KpiCard label="У транзиті" value={String(data.kpi.inTransit)} />
            <KpiCard label="Доставлено" value={String(data.kpi.delivered)} />
            <KpiCard label="З TTN" value={String(data.kpi.withTtn)} />
            <KpiCard label="Без TTN" value={String(data.kpi.withoutTtn)} />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="mb-2 text-sm font-semibold text-zinc-900">Замовлення за статусом</h2>
              <SimpleTable
                columns={[
                  { key: "status", label: "Статус" },
                  { key: "count", label: "Кількість" },
                ]}
                rows={data.byOrderStatus.map((r) => ({ status: r.status, count: r.count }))}
              />
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold text-zinc-900">Відвантаження за статусом</h2>
              <SimpleTable
                columns={[
                  { key: "status", label: "Статус" },
                  { key: "count", label: "Кількість" },
                ]}
                rows={data.byShipmentStatus.map((r) => ({ status: r.status, count: r.count }))}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
