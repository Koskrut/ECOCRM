"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { FiltersBar } from "@/components/analytics/FiltersBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { SimpleTable } from "@/components/analytics/SimpleTable";
import { formatMoneyUsd, useAnalyticsFilters } from "@/components/analytics/useAnalyticsFilters";

type ClientsData = {
  newClientsCount: number;
  repeatClientsCount: number;
  sleepingClientsCount: number;
  topByBookedRevenue: {
    clientId: string;
    clientName: string | null;
    bookedRevenue: number;
    ordersCount: number;
  }[];
  topByCollectedPayments: {
    clientId: string;
    clientName: string | null;
    collectedPayments: number;
  }[];
};

type ClientsResp = { period: { from: string; to: string }; data: ClientsData };

export default function AnalyticsClientsPage() {
  const { dateFrom, dateTo, compare, managerId, setManagerId, querySuffix, onFiltersChange } =
    useAnalyticsFilters();
  const [userList, setUserList] = useState<{ id: string; fullName: string }[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [res, setRes] = useState<ClientsResp | null>(null);
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
      .get<ClientsResp>(`/analytics/clients${querySuffix}`)
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
          <p className="mb-3 text-xs text-zinc-500">
            Клієнт = contactId на замовленні. Метрики залежать від заповнення clientId.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard label="Нові клієнти (перше замовлення в періоді)" value={String(d.newClientsCount)} />
            <KpiCard label="Повторні (2+ замовлень, є у періоді)" value={String(d.repeatClientsCount)} />
            <KpiCard label="«Сплячі» (90+ днів без замовлення)" value={String(d.sleepingClientsCount)} />
          </div>
          <h2 className="mt-8 text-sm font-semibold text-zinc-900">Топ за Booked revenue</h2>
          <div className="mt-2">
            <SimpleTable
              columns={[
                { key: "name", label: "Клієнт" },
                { key: "rev", label: "Booked" },
                { key: "n", label: "Замовлень" },
              ]}
              rows={d.topByBookedRevenue.map((x) => ({
                name: x.clientName ?? x.clientId,
                rev: formatMoneyUsd(x.bookedRevenue),
                n: x.ordersCount,
              }))}
            />
          </div>
          <h2 className="mt-8 text-sm font-semibold text-zinc-900">Топ за оплатами (Collected)</h2>
          <div className="mt-2">
            <SimpleTable
              columns={[
                { key: "name", label: "Клієнт" },
                { key: "paid", label: "Оплачено" },
              ]}
              rows={d.topByCollectedPayments.map((x) => ({
                name: x.clientName ?? x.clientId,
                paid: formatMoneyUsd(x.collectedPayments),
              }))}
            />
          </div>
        </>
      )}
    </>
  );
}
