"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { FiltersBar } from "@/components/analytics/FiltersBar";
import { SimpleTable } from "@/components/analytics/SimpleTable";
import { formatMoneyUsd, useAnalyticsFilters } from "@/components/analytics/useAnalyticsFilters";

type ProductsData = {
  topByQty: { productId: string; sku: string; name: string; qty: number; revenue: number }[];
  topByRevenue: { productId: string; sku: string; name: string; qty: number; revenue: number }[];
  kitVsPart: { kind: string; count: number; revenue: number }[];
  lowStock: {
    productId: string;
    sku: string;
    name: string;
    totalQty: number;
    reserved: number;
  }[];
};

type ProductsResp = { period: { from: string; to: string }; data: ProductsData };

export default function AnalyticsProductsPage() {
  const { dateFrom, dateTo, compare, managerId, setManagerId, querySuffix, onFiltersChange } =
    useAnalyticsFilters();
  const [userList, setUserList] = useState<{ id: string; fullName: string }[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [res, setRes] = useState<ProductsResp | null>(null);
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
      .get<ProductsResp>(`/analytics/products${querySuffix}`)
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
          <h2 className="text-sm font-semibold text-zinc-900">Топ за кількістю</h2>
          <div className="mt-2">
            <SimpleTable
              columns={[
                { key: "sku", label: "SKU" },
                { key: "name", label: "Назва" },
                { key: "qty", label: "Шт" },
                { key: "rev", label: "Виручка (рядки)" },
              ]}
              rows={d.topByQty.map((p) => ({
                sku: p.sku,
                name: p.name,
                qty: p.qty,
                rev: formatMoneyUsd(p.revenue),
              }))}
            />
          </div>
          <h2 className="mt-8 text-sm font-semibold text-zinc-900">Топ за сумою</h2>
          <div className="mt-2">
            <SimpleTable
              columns={[
                { key: "sku", label: "SKU" },
                { key: "name", label: "Назва" },
                { key: "rev", label: "Виручка" },
                { key: "qty", label: "Шт" },
              ]}
              rows={d.topByRevenue.map((p) => ({
                sku: p.sku,
                name: p.name,
                rev: formatMoneyUsd(p.revenue),
                qty: p.qty,
              }))}
            />
          </div>
          <h2 className="mt-8 text-sm font-semibold text-zinc-900">KIT / PART / інше</h2>
          <div className="mt-2">
            <SimpleTable
              columns={[
                { key: "kind", label: "Тип" },
                { key: "count", label: "Шт (позиції)" },
                { key: "rev", label: "Сума рядків" },
              ]}
              rows={d.kitVsPart.map((k) => ({
                kind: k.kind,
                count: k.count,
                rev: formatMoneyUsd(k.revenue),
              }))}
            />
          </div>
          <h2 className="mt-8 text-sm font-semibold text-zinc-900">Низький залишок (склад − резерв)</h2>
          <div className="mt-2">
            <SimpleTable
              columns={[
                { key: "sku", label: "SKU" },
                { key: "name", label: "Назва" },
                { key: "qty", label: "Склад" },
                { key: "res", label: "Резерв" },
              ]}
              rows={d.lowStock.map((p) => ({
                sku: p.sku,
                name: p.name,
                qty: p.totalQty,
                res: p.reserved,
              }))}
            />
          </div>
        </>
      )}
    </>
  );
}
