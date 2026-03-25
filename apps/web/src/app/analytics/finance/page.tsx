"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { FiltersBar } from "@/components/analytics/FiltersBar";
import { KpiCard } from "@/components/analytics/KpiCard";
import { SimpleTable } from "@/components/analytics/SimpleTable";
import { formatMoneyUsd, useAnalyticsFilters } from "@/components/analytics/useAnalyticsFilters";

type FinanceData = {
  collectedPayments: number;
  debtTotal: number;
  overdueDebt: number;
  agingBuckets: { label: string; amount: number; ordersCount: number }[];
  topDebtors: {
    clientId: string;
    clientName: string | null;
    debtAmount: number;
    overdueAmount: number;
    orderCount: number;
  }[];
  overdueOrders: {
    id: string;
    orderNumber: string;
    clientName: string | null;
    debtAmount: number;
    paymentDueDate: string | null;
  }[];
};

type FinanceResp = { period: { from: string; to: string }; data: FinanceData };

export default function AnalyticsFinancePage() {
  const { dateFrom, dateTo, compare, managerId, setManagerId, querySuffix, onFiltersChange } =
    useAnalyticsFilters();
  const [userList, setUserList] = useState<{ id: string; fullName: string }[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [res, setRes] = useState<FinanceResp | null>(null);
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
      .get<FinanceResp>(`/analytics/finance${querySuffix}`)
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
            <KpiCard label="Collected (період)" value={formatMoneyUsd(d.collectedPayments)} sublabel="paidAt" />
            <KpiCard label="Дебіторка" value={formatMoneyUsd(d.debtTotal)} />
            <KpiCard label="Прострочено" value={formatMoneyUsd(d.overdueDebt)} />
          </div>
          <h2 className="mt-8 text-sm font-semibold text-zinc-900">Aging (де є paymentDueDate)</h2>
          <div className="mt-2">
            <SimpleTable
              columns={[
                { key: "label", label: "Вік (днів)" },
                { key: "amount", label: "Сума" },
                { key: "ordersCount", label: "Замовлень" },
              ]}
              rows={d.agingBuckets.map((b) => ({
                label: b.label,
                amount: formatMoneyUsd(b.amount),
                ordersCount: b.ordersCount,
              }))}
            />
          </div>
          <h2 className="mt-8 text-sm font-semibold text-zinc-900">Топ боржників (контакт)</h2>
          <div className="mt-2">
            <SimpleTable
              columns={[
                { key: "name", label: "Клієнт" },
                { key: "debt", label: "Борг" },
                { key: "overdue", label: "Прострочено" },
                { key: "orders", label: "Замовлень" },
              ]}
              rows={d.topDebtors.map((x) => ({
                name: x.clientName ?? x.clientId,
                debt: formatMoneyUsd(x.debtAmount),
                overdue: formatMoneyUsd(x.overdueAmount),
                orders: x.orderCount,
              }))}
            />
          </div>
          <h2 className="mt-8 text-sm font-semibold text-zinc-900">Прострочені замовлення</h2>
          <div className="mt-2">
            <SimpleTable
              columns={[
                { key: "num", label: "№" },
                { key: "client", label: "Клієнт" },
                { key: "debt", label: "Борг" },
                { key: "due", label: "Термін" },
              ]}
              rows={d.overdueOrders.map((o) => ({
                num: o.orderNumber,
                client: o.clientName ?? "—",
                debt: formatMoneyUsd(o.debtAmount),
                due: o.paymentDueDate?.slice(0, 10) ?? "—",
              }))}
            />
          </div>
        </>
      )}
    </>
  );
}
