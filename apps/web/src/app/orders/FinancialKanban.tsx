"use client";

import { useCallback, useMemo } from "react";
import { apiHttp } from "../../lib/api/client";
import { isTextSelected } from "@/lib/dom";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { DocumentsRequestedBadge } from "@/components/orders/DocumentsRequestedBadge";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDate } from "@/lib/crmDatetime";
import {
  KanbanLoadSentinel,
  KANBAN_COLUMN_BODY_CLASS,
} from "@/components/kanban/KanbanLoadSentinel";
import {
  KANBAN_PAGE_SIZE,
  useKanbanInfiniteColumns,
} from "@/components/kanban/useKanbanInfiniteColumns";
import { strings } from "@/locales";

const tr = strings.kanban;

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
  documentsRequested?: boolean | null;
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
  attention?: string;
  attentionPeriod?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  ids?: string;
  orderStage?: string;
  amountFrom?: string;
  amountTo?: string;
  paymentStatus?: string;
  hasTtn?: string;
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

function isFinancialStatus(s: string): s is FinancialStatus {
  return COLUMN_ORDER.includes(s as FinancialStatus);
}

const DEBT_COLUMN_STATUSES = new Set<FinancialStatus>([
  "INVOICE_PENDING",
  "AWAITING_PAYMENT",
  "DUE_SOON",
  "OVERDUE",
]);

type AmountByCurrency = Record<string, number>;

function sumByCurrency(
  items: FinancialOrder[],
  pick: (o: FinancialOrder) => number,
): AmountByCurrency {
  const out: AmountByCurrency = {};
  for (const o of items) {
    const amount = pick(o);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = o.currency?.trim() || "USD";
    out[currency] = (out[currency] ?? 0) + amount;
  }
  return out;
}

function formatAmountByCurrency(totals: AmountByCurrency): string | null {
  const entries = Object.entries(totals).filter(([, value]) => value > 0.00001);
  if (entries.length === 0) return null;
  return entries
    .map(([currency, amount]) => formatOrderAmount(amount, currency))
    .join(" · ");
}

type ColumnTotals = {
  count: number;
  debtLabel: string | null;
  amountLabel: string | null;
  isDebt: boolean;
};

function columnTotals(status: FinancialStatus, items: FinancialOrder[], total: number): ColumnTotals {
  const debtByCurrency = sumByCurrency(items, (o) => Math.max(0, Number(o.debtAmount ?? 0)));
  const debtLabel = formatAmountByCurrency(debtByCurrency);

  if (DEBT_COLUMN_STATUSES.has(status)) {
    return {
      count: total,
      debtLabel,
      amountLabel: debtLabel,
      isDebt: true,
    };
  }

  if (status === "PAID") {
    const paidByCurrency = sumByCurrency(items, (o) => Math.max(0, Number(o.paidAmount ?? 0)));
    return {
      count: total,
      debtLabel,
      amountLabel: formatAmountByCurrency(paidByCurrency),
      isDebt: false,
    };
  }

  const totalByCurrency = sumByCurrency(items, (o) => Math.max(0, Number(o.totalAmount ?? 0)));
  return {
    count: total,
    debtLabel,
    amountLabel: formatAmountByCurrency(totalByCurrency),
    isDebt: false,
  };
}

function dueSort(a: FinancialOrder, b: FinancialOrder): number {
  const aDue = a.paymentDueDate ? new Date(a.paymentDueDate).getTime() : Number.MAX_SAFE_INTEGER;
  const bDue = b.paymentDueDate ? new Date(b.paymentDueDate).getTime() : Number.MAX_SAFE_INTEGER;
  return aDue - bDue;
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
  const loadColumnIds = useMemo((): FinancialStatus[] => {
    if (filters?.financialStatus && isFinancialStatus(filters.financialStatus)) {
      return [filters.financialStatus];
    }
    return COLUMN_ORDER;
  }, [filters?.financialStatus]);

  const kanbanResetKey = useMemo(
    () => JSON.stringify({ refreshKey, filters, columns: loadColumnIds }),
    [refreshKey, filters, loadColumnIds],
  );

  const buildParams = useCallback(
    (status: FinancialStatus, page: number): Record<string, string> => {
      const params: Record<string, string> = {
        financialBoard: "true",
        withCompanyClient: "true",
        financialStatus: status,
        page: String(page),
        pageSize: String(KANBAN_PAGE_SIZE),
      };
      if (filters?.paymentType) params.paymentType = filters.paymentType;
      if (filters?.overdue === "true") params.overdue = "true";
      if (filters?.dueSoon === "true") params.dueSoon = "true";
      if (filters?.hasDebt === "true") params.hasDebt = "true";
      if (filters?.hasDueDate === "true") params.hasDueDate = "true";
      if (filters?.ownerId) params.ownerId = filters.ownerId;
      if (filters?.attention) params.attention = filters.attention;
      if (filters?.attention === "stuck" && filters?.attentionPeriod) {
        params.attentionPeriod = filters.attentionPeriod;
      }
      if (filters?.q?.trim()) params.q = filters.q.trim();
      if (filters?.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters?.dateTo) params.dateTo = filters.dateTo;
      if (filters?.sortBy) params.sortBy = filters.sortBy;
      if (filters?.sortDir) params.sortDir = filters.sortDir;
      if (filters?.ids) params.ids = filters.ids;
      if (filters?.orderStage) params.orderStage = filters.orderStage;
      if (filters?.amountFrom) params.amountFrom = filters.amountFrom;
      if (filters?.amountTo) params.amountTo = filters.amountTo;
      if (filters?.paymentStatus) params.paymentStatus = filters.paymentStatus;
      if (filters?.hasTtn) params.hasTtn = filters.hasTtn;
      return params;
    },
    [
      filters?.paymentType,
      filters?.overdue,
      filters?.dueSoon,
      filters?.hasDebt,
      filters?.hasDueDate,
      filters?.ownerId,
      filters?.attention,
      filters?.attentionPeriod,
      filters?.q,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.sortBy,
      filters?.sortDir,
      filters?.ids,
      filters?.orderStage,
      filters?.amountFrom,
      filters?.amountTo,
      filters?.paymentStatus,
      filters?.hasTtn,
    ],
  );

  const fetchPage = useCallback(async (params: Record<string, string>) => {
    const res = await apiHttp.get<FinancialListResponse>("/orders", { params });
    const data = res.data ?? { items: [] };
    return {
      items: data.items ?? [],
      total: data.total ?? data.items?.length ?? 0,
    };
  }, []);

  const { columns: columnStates, loadMore, reloadColumn, anyInitialLoading, firstError } =
    useKanbanInfiniteColumns<FinancialOrder, FinancialStatus>({
      columnIds: loadColumnIds,
      buildParams,
      fetchPage,
      resetKey: kanbanResetKey,
    });

  const columns = useMemo(
    () =>
      loadColumnIds.map((id) => {
        const items = [...(columnStates[id]?.items ?? [])].sort(dueSort);
        const total = columnStates[id]?.total ?? items.length;
        return {
          id,
          title: FINANCIAL_LABELS[id],
          items,
          totals: columnTotals(id, items, total),
          state: columnStates[id],
        };
      }),
    [columnStates, loadColumnIds],
  );

  const boardEmpty = columns.every((col) => col.items.length === 0);
  if (anyInitialLoading && boardEmpty) {
    return <div className="text-sm text-zinc-500">{tr.financialLoadingBoard}</div>;
  }
  if (firstError && boardEmpty) {
    return <div className="text-sm text-red-600">{firstError}</div>;
  }

  return (
    <div className="max-w-full min-w-0 space-y-4">
      <p className="text-xs text-zinc-500">{tr.financialHint}</p>
      <div className="flex flex-nowrap gap-4 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div
            key={col.id}
            className="flex-shrink-0 w-[240px] min-w-[240px] rounded-lg border border-zinc-200 bg-zinc-50/80"
          >
              <div className="flex items-start justify-between gap-2 border-b border-zinc-200 px-3 py-2">
                <div className="min-w-0 text-sm font-semibold leading-snug text-zinc-900">
                  {col.title}
                </div>
                <div className="shrink-0 text-right text-xs leading-snug">
                  <div className="text-zinc-500">{col.totals.count}</div>
                  {col.totals.amountLabel ? (
                    <div
                      className={
                        col.totals.isDebt
                          ? "mt-0.5 font-medium text-amber-700"
                          : "mt-0.5 font-medium text-zinc-700"
                      }
                      title={tr.loadedCardsHint}
                    >
                      {col.totals.isDebt ? `борг ${col.totals.amountLabel}` : col.totals.amountLabel}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className={KANBAN_COLUMN_BODY_CLASS}>
                {col.state?.initialLoading ? (
                  <div className="text-xs text-zinc-500">{tr.loadingColumn}</div>
                ) : col.state?.error && col.items.length === 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs text-red-600">{col.state.error}</div>
                    <button
                      type="button"
                      onClick={() => reloadColumn(col.id)}
                      className="text-xs font-medium text-zinc-700 underline"
                    >
                      {tr.retry}
                    </button>
                  </div>
                ) : col.items.length === 0 ? (
                  <div className="text-xs text-zinc-500">{tr.emptyColumn}</div>
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
                          <span className="flex items-center gap-1 font-medium text-zinc-900">
                            <span>{o.orderNumber}</span>
                            <DocumentsRequestedBadge documentsRequested={o.documentsRequested} size="xs" />
                          </span>
                          {o.paymentType && (
                            <span
                              className={
                                o.paymentType === "PREPAYMENT"
                                  ? "rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800"
                                  : "rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                              }
                            >
                              {o.paymentType === "PREPAYMENT" ? "Передопл." : "Відтерм."}
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
                          <span className="text-zinc-700">
                            {formatOrderAmount(o.paidAmount, o.currency, o.exchangeRate)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2 text-xs">
                          <span className="text-zinc-500">Борг</span>
                          <span
                            className={
                              o.debtAmount > 0 ? "font-medium text-amber-700" : "text-zinc-600"
                            }
                          >
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
                {col.state?.hasMore ? (
                  <KanbanLoadSentinel
                    disabled={col.state.loadingMore || col.state.initialLoading}
                    onVisible={() => loadMore(col.id)}
                  />
                ) : null}
                {col.state?.loadingMore ? (
                  <div className="py-1 text-center text-xs text-zinc-400">Завантаження…</div>
                ) : null}
              </div>
            </div>
        ))}
      </div>
    </div>
  );
}
