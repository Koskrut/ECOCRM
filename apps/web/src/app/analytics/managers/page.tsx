"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { FiltersBar } from "@/components/analytics/FiltersBar";
import { SimpleTable } from "@/components/analytics/SimpleTable";
import { formatMoneyUsd, useAnalyticsFilters } from "@/components/analytics/useAnalyticsFilters";

type Row = {
  id: string;
  name: string;
  bookedRevenue: number;
  collectedPayments: number;
  ordersCount: number;
  avgCheck: number;
  overdueTasks: number;
};

type ManagersResp = {
  period: { from: string; to: string };
  managers: Row[];
};

export default function AnalyticsManagersPage() {
  const { dateFrom, dateTo, compare, managerId, setManagerId, querySuffix, onFiltersChange } =
    useAnalyticsFilters();
  const [userList, setUserList] = useState<{ id: string; fullName: string }[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [data, setData] = useState<ManagersResp | null>(null);
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
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
      body: JSON.stringify({
        sessionId: "18e84e",
        runId: "run-managers-1",
        hypothesisId: "H13",
        location: "analytics/managers/page.tsx:requestStart",
        message: "Managers analytics request start",
        data: { querySuffixLength: querySuffix.length, role, managerId: managerId || null },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    apiHttp
      .get<ManagersResp>(`/analytics/managers${querySuffix}`)
      .then((r) => {
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
          body: JSON.stringify({
            sessionId: "18e84e",
            runId: "run-managers-1",
            hypothesisId: "H13",
            location: "analytics/managers/page.tsx:requestSuccess",
            message: "Managers analytics request success",
            data: { managersCount: r.data?.managers?.length ?? 0 },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (!c) setData(r.data);
      })
      .catch((e) => {
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
          body: JSON.stringify({
            sessionId: "18e84e",
            runId: "run-managers-1",
            hypothesisId: "H14",
            location: "analytics/managers/page.tsx:requestError",
            message: "Managers analytics request failed",
            data: {
              httpStatus: e?.response?.status ?? null,
              message: e?.response?.data?.message ?? e?.message ?? "unknown",
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (!c) setErr(e?.response?.data?.message ?? "Не вдалося завантажити");
      })
      .finally(() => {
        if (!c) setLoading(false);
      });
    return () => {
      c = true;
    };
  }, [querySuffix]);

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
      body: JSON.stringify({
        sessionId: "18e84e",
        runId: "run-managers-1",
        hypothesisId: "H15",
        location: "analytics/managers/page.tsx:renderState",
        message: "Managers page render state",
        data: { loading, hasErr: Boolean(err), hasData: Boolean(data), rows: (data?.managers ?? []).length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [loading, err, data]);

  const rows = data?.managers ?? [];

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
      <p className="mb-3 text-xs text-zinc-500">
        Рейтинг за Booked revenue у періоді. Якщо міняли відповідального по замовленню — історія може
        зміститися.
      </p>
      <SimpleTable
        columns={[
          { key: "name", label: "Менеджер" },
          { key: "booked", label: "Booked" },
          { key: "paid", label: "Collected" },
          { key: "orders", label: "Замовлень" },
          { key: "avg", label: "Сер. чек" },
          { key: "tasks", label: "Простроч. задач" },
        ]}
        rows={rows.map((m) => ({
          name: m.name,
          booked: formatMoneyUsd(m.bookedRevenue),
          paid: formatMoneyUsd(m.collectedPayments),
          orders: m.ordersCount,
          avg: formatMoneyUsd(m.avgCheck),
          tasks: m.overdueTasks,
        }))}
      />
    </>
  );
}
