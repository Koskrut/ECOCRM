"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "../../lib/api/client";
import { isTextSelected } from "@/lib/dom";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDate } from "@/lib/crmDatetime";

/** Phase 4: Financial view — columns by financialStatus, no drag-and-drop. */

type FinancialStatus =
  | "INVOICE_PENDING"
  | "AWAITING_PAYMENT"
  | "DUE_SOON"
  | "OVERDUE"
  | "PAID"
  | "CLOSED";

type FinancialOrder = {
  id: string;
  orderNumber: string;
  status: string;
  orderStage?: string | null;
  financialStatus?: string | null;
  paymentDueDate?: string | null;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  currency: string;
  exchangeRate?: number | null;
  paymentType?: string | null;
  createdAt: string;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string } | null;
};

type FinancialListResponse = {
  items: FinancialOrder[];
  total?: number;
  page?: number;
  pageSize?: number;
};

type FinancialFilters = {
  financialStatus?: string;
  paymentType?: string;
  overdue?: string;
  dueSoon?: string;
  hasDebt?: string;
  hasDueDate?: string;
  ownerId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

const COLUMN_ORDER: FinancialStatus[] = [
  "INVOICE_PENDING",
  "AWAITING_PAYMENT",
  "DUE_SOON",
  "OVERDUE",
  "PAID",
  "CLOSED",
];

const FINANCIAL_LABELS: Record<FinancialStatus, string> = {
  INVOICE_PENDING: "Потрібно виставити рахунок",
  AWAITING_PAYMENT: "Очікуємо оплату",
  DUE_SOON: "Термін скоро",
  OVERDUE: "Прострочено",
  PAID: "Оплачено",
  CLOSED: "Закрито",
};

function resolveFinancialStatus(o: FinancialOrder): FinancialStatus {
  const s = o.financialStatus ?? "";
  if (COLUMN_ORDER.includes(s as FinancialStatus)) return s as FinancialStatus;
  return "CLOSED";
}

export function FinancialKanban({
  onOpenOrder,
  filters,
  refreshKey = 0,
}: {
  onOpenOrder: (id: string) => void;
  filters?: FinancialFilters;
  refreshKey?: number;
}) {
  const [list, setList] = useState<FinancialListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params: Record<string, string> = {
        financialBoard: "true",
        withCompanyClient: "true",
        pageSize: "100",
      };
      if (filters?.financialStatus) params.financialStatus = filters.financialStatus;
      if (filters?.paymentType) params.paymentType = filters.paymentType;
      if (filters?.overdue === "true") params.overdue = "true";
      if (filters?.dueSoon === "true") params.dueSoon = "true";
      if (filters?.hasDebt === "true") params.hasDebt = "true";
      if (filters?.hasDueDate === "true") params.hasDueDate = "true";
      if (filters?.ownerId) params.ownerId = filters.ownerId;
      if (filters?.q?.trim()) params.q = filters.q.trim();
      if (filters?.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters?.dateTo) params.dateTo = filters.dateTo;
      if (filters?.sortBy) params.sortBy = filters.sortBy;
      if (filters?.sortDir) params.sortDir = filters.sortDir;

      const res = await apiHttp.get<FinancialListResponse>("/orders", { params });
      setList(res.data ?? { items: [] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load financial board");
      setList(null);
    } finally {
      setLoading(false);
    }
  }, [
    filters?.financialStatus,
    filters?.paymentType,
    filters?.overdue,
    filters?.dueSoon,
    filters?.hasDebt,
    filters?.hasDueDate,
    filters?.ownerId,
    filters?.q,
    filters?.dateFrom,
    filters?.dateTo,
    filters?.sortBy,
    filters?.sortDir,
  ]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const columns = useMemo(() => {
    const items = list?.items ?? [];
    const map: Record<FinancialStatus, FinancialOrder[]> = {
      INVOICE_PENDING: [],
      AWAITING_PAYMENT: [],
      DUE_SOON: [],
      OVERDUE: [],
      PAID: [],
      CLOSED: [],
    };
    for (const o of items) {
      const st = resolveFinancialStatus(o);
      map[st].push(o);
    }
    const dueSort = (a: FinancialOrder, b: FinancialOrder) => {
      const aDue = a.paymentDueDate ? new Date(a.paymentDueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.paymentDueDate ? new Date(b.paymentDueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    };
    for (const st of COLUMN_ORDER) {
      map[st].sort(dueSort);
    }
    return COLUMN_ORDER.map((id) => ({
      id,
      title: FINANCIAL_LABELS[id],
      items: map[id],
    }));
  }, [list]);

  if (loading) return <div className="text-sm text-zinc-500">Завантаження фін. дошки…</div>;
  if (err) return <div className="text-sm text-red-600">{err}</div>;
  if (!list) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Фінансовий канбан — контрольний екран. Статус визначається з даних замовлення та оплат, без
        перетягування.
      </p>
      <div className="flex flex-nowrap gap-4 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div
            key={col.id}
            className="flex-shrink-0 w-[240px] min-w-[240px] rounded-lg border border-zinc-200 bg-zinc-50/80"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
              <div className="text-sm font-semibold text-zinc-900">{col.title}</div>
              <div className="text-xs text-zinc-500">{col.items.length}</div>
            </div>
            <div className="min-h-[180px] space-y-3 p-3">
              {col.items.length === 0 ? (
                <div className="text-xs text-zinc-500">—</div>
              ) : (
                col.items.map((o) => {
                  const clientName =
                    o.client != null
                      ? `${o.client.lastName ?? ""} ${o.client.firstName ?? ""}`.trim() || "—"
                      : o.company?.name ?? "—";
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        if (isTextSelected()) return;
                        onOpenOrder(o.id);
                      }}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-zinc-900">{o.orderNumber}</span>
                        {o.paymentType && (
                          <span
                            className={
                              o.paymentType === "PREPAYMENT"
                                ? "rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800"
                                : "rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                            }
                          >
                            {o.paymentType === "PREPAYMENT" ? "Предопл." : "Отсрочка"}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 text-xs text-zinc-500">{clientName}</div>
                      <div className="mt-2 flex justify-between gap-2 text-xs">
                        <span className="text-zinc-500">Сума</span>
                        <span className="font-medium text-zinc-900">
                          {formatOrderAmount(o.totalAmount, o.currency, o.exchangeRate)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="text-zinc-500">Оплачено</span>
                        <span className="text-zinc-700">{formatOrderAmount(o.paidAmount, o.currency, o.exchangeRate)}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="text-zinc-500">Борг</span>
                        <span className={o.debtAmount > 0 ? "font-medium text-amber-700" : "text-zinc-600"}>
                          {formatOrderAmount(o.debtAmount, o.currency, o.exchangeRate)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex justify-between gap-2 text-xs">
                        <span className="text-zinc-500">Срок оплати</span>
                        <span className="text-zinc-700">{formatDate(o.paymentDueDate)}</span>
                      </div>
                      <div className="mt-2">
                        <StatusBadge variant="order" status={o.status} orderStage={o.orderStage} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
