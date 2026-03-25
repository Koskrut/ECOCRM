"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { AttentionBlock } from "@/components/analytics/AttentionBlock";
import { FiltersBar } from "@/components/analytics/FiltersBar";
import { formatMoneyUa, useAnalyticsFilters } from "@/components/analytics/useAnalyticsFilters";

type AttentionResp = {
  data: {
    crm: {
      overdueTasks: {
        id: string;
        title: string;
        dueAt: string | null;
        assigneeName: string;
        relatedEntity: string | null;
      }[];
      stuckOrders: {
        id: string;
        orderNumber: string;
        orderStage: string | null;
        stuckSinceDate: string;
        ownerName: string | null;
      }[];
      leadsWithoutTouch: {
        id: string;
        name: string | null;
        source: string;
        createdAt: string;
        ownerName: string | null;
      }[];
    };
    finance: {
      overdueOrders: {
        id: string;
        orderNumber: string;
        clientName: string | null;
        debtAmount: number;
        paymentDueDate: string | null;
      }[];
    };
  };
};

export default function AnalyticsAttentionPage() {
  const { dateFrom, dateTo, compare, managerId, setManagerId, querySuffix, onFiltersChange } =
    useAnalyticsFilters();
  const [managers, setManagers] = useState<{ id: string; fullName: string }[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [res, setRes] = useState<AttentionResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      .get<AttentionResp>(`/analytics/attention${querySuffix}`)
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
        managers={managers}
        onManagerChange={setManagerId}
      />
      <p className="mb-3 text-xs text-zinc-500">
        Списки — поточний стан (не залежать від діапазону дат), фільтр менеджера застосовується до
        видимості.
      </p>
      {loading && <p className="text-sm text-zinc-500">Завантаження…</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {d && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900">CRM</h2>
            <AttentionBlock
              title="Прострочені задачі"
              items={d.crm.overdueTasks.map((t) => ({
                id: t.id,
                label: t.title,
                meta: `${t.assigneeName}${t.dueAt ? ` · ${t.dueAt.slice(0, 10)}` : ""}`,
              }))}
              hrefForItem={() => "/tasks"}
            />
            <AttentionBlock
              title="Застряглі замовлення"
              items={d.crm.stuckOrders.map((o) => ({
                id: o.id,
                label: o.orderNumber,
                meta: `${o.orderStage ?? "—"} · з ${o.stuckSinceDate.slice(0, 10)}`,
              }))}
              hrefForItem={(id) => `/orders?orderId=${encodeURIComponent(id)}`}
            />
            <AttentionBlock
              title="Ліди без дотику"
              items={d.crm.leadsWithoutTouch.map((l) => ({
                id: l.id,
                label: l.name ?? l.id,
                meta: `${l.source} · ${l.ownerName ?? "—"}`,
              }))}
              hrefForItem={(id) => `/leads?leadId=${encodeURIComponent(id)}`}
            />
          </div>
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900">Фінанси / бізнес</h2>
            <AttentionBlock
              title="Прострочені замовлення"
              items={d.finance.overdueOrders.map((o) => ({
                id: o.id,
                label: o.orderNumber,
                meta: `${formatMoneyUa(o.debtAmount)}${o.paymentDueDate ? ` · due ${o.paymentDueDate.slice(0, 10)}` : ""}${o.clientName ? ` · ${o.clientName}` : ""}`,
              }))}
              hrefForItem={(id) => `/orders?orderId=${encodeURIComponent(id)}`}
            />
          </div>
        </div>
      )}
    </>
  );
}
