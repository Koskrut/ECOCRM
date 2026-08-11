"use client";

import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { formatDateTime } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import {
  isOperationalDebtOrder,
  isOrderFinancialOverdue,
  orderUnpaidAmountClassName,
} from "@/lib/operational-debt";
import { StatusBadge } from "@/components/StatusBadge";
import {
  OrderMovementSections,
  PaymentStatusBadge,
} from "@/components/orders/OrderMovementSections";
import type {
  ContactOrderMovementNode,
  ContactOrdersMovementResponse,
} from "./contact-orders-movement.types";

const t = strings.contacts.card.orders;

function getErrMsg(e: unknown, fallback: string) {
  const anyErr = e as { response?: { data?: { message?: string; error?: string } } };
  return (
    anyErr?.response?.data?.message ||
    anyErr?.response?.data?.error ||
    (e instanceof Error ? e.message : fallback)
  );
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`,
  );
}

export function ContactOrdersPanel({
  contactId,
  reloadKey,
  onOpenOrder,
  onOpenReturn,
}: {
  contactId: string;
  reloadKey: number;
  onOpenOrder: (orderId: string) => void;
  onOpenReturn?: (returnId: string) => void;
}) {
  const [items, setItems] = useState<ContactOrderMovementNode[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<ContactOrdersMovementResponse>(
        `/contacts/${contactId}/orders-movement`,
        { params: { page: 1, pageSize: 50 } },
      );
      const data = res.data;
      setItems(data?.items ?? []);
      setTotal(data?.total ?? 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setErr(getErrMsg(e, t.loadError));
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) return <div className="text-sm text-zinc-500">{t.loading}</div>;
  if (err) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm font-medium text-sky-700 hover:text-sky-900"
        >
          {t.retry}
        </button>
      </div>
    );
  }
  if (items.length === 0) return <div className="text-sm text-zinc-500">{t.empty}</div>;

  return (
    <div className="-mx-4 -mb-4 border-t border-zinc-200">
      <div className="divide-y divide-zinc-100">
        {items.map((order) => (
          <OrderMovementRow
            key={order.id}
            order={order}
            expanded={expandedIds.has(order.id)}
            onToggle={() => toggleExpanded(order.id)}
            onOpenOrder={onOpenOrder}
            onOpenReturn={onOpenReturn}
          />
        ))}
      </div>
      {total > items.length ? (
        <div className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500">
          {interpolate(t.shownOf, { shown: items.length, total })}
        </div>
      ) : null}
    </div>
  );
}

function OrderMovementRow({
  order,
  expanded,
  onToggle,
  onOpenOrder,
  onOpenReturn,
}: {
  order: ContactOrderMovementNode;
  expanded: boolean;
  onToggle: () => void;
  onOpenOrder: (orderId: string) => void;
  onOpenReturn?: (returnId: string) => void;
}) {
  const chips: Array<{ key: string; label: string; className?: string }> = [];
  if (order.counts.openReturns > 0) {
    chips.push({
      key: "openReturns",
      label: t.openReturns,
      className: "bg-amber-50 text-amber-800",
    });
  }
  if (order.counts.payments > 0) {
    chips.push({
      key: "payments",
      label: interpolate(t.paymentsChip, { count: order.counts.payments }),
    });
  }
  if (order.counts.returns > 0) {
    chips.push({
      key: "returns",
      label: interpolate(t.returnsChip, { count: order.counts.returns }),
    });
  }
  if (order.counts.children > 0) {
    chips.push({
      key: "children",
      label: interpolate(t.childrenChip, { count: order.counts.children }),
    });
  }

  const unpaidLabel =
    order.debtAmount > 0
      ? isOperationalDebtOrder(order)
        ? t.debt
        : t.amountDue
      : null;

  const financeBits = [
    `${t.paid} ${formatOrderAmount(order.paidAmount, order.currency, order.exchangeRate)}`,
    unpaidLabel
      ? `${unpaidLabel} ${formatOrderAmount(order.debtAmount, order.currency, order.exchangeRate)}`
      : null,
    order.creditAmount > 0
      ? `${t.credit} ${formatOrderAmount(order.creditAmount, order.currency, order.exchangeRate)}`
      : null,
    order.returnAdjustmentAmount > 0
      ? `${t.returnAdjustment} ${formatOrderAmount(order.returnAdjustmentAmount, order.currency, order.exchangeRate)}`
      : null,
  ].filter(Boolean);

  return (
    <div className={expanded ? "bg-zinc-50/70" : "bg-white"}>
      <div className="flex items-start gap-1 px-3 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="mt-0.5 shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          aria-expanded={expanded}
          aria-label={expanded ? t.collapse : t.expand}
        >
          <svg
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  onClick={() => onOpenOrder(order.id)}
                  className="truncate text-sm font-semibold text-zinc-900 hover:text-sky-800"
                >
                  №{order.orderNumber}
                </button>
                <span className="inline-flex flex-wrap items-center gap-1">
                  <StatusBadge
                    variant="order"
                    status={order.status ?? "—"}
                    orderStage={order.orderStage ?? null}
                  />
                  <PaymentStatusBadge status={order.paymentStatus} />
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {formatDateTime(order.createdAt)}
                {financeBits.length > 0 ? ` · ${financeBits.join(" · ")}` : null}
              </div>
              {chips.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {chips.map((chip) => (
                    <span
                      key={chip.key}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.className ?? "bg-zinc-100 text-zinc-600"}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <div className="whitespace-nowrap text-sm font-medium tabular-nums text-zinc-900">
                {formatOrderAmount(order.totalAmount, order.currency, order.exchangeRate)}
              </div>
              <button
                type="button"
                onClick={() => onOpenOrder(order.id)}
                className="mt-1 text-[11px] font-medium text-sky-700 hover:text-sky-900"
              >
                {t.openOrder}
              </button>
            </div>
          </div>

          {expanded ? (
            <div className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-3">
              <div className="mb-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  {t.finance}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-700">
                  <span>
                    {t.total}{" "}
                    <span className="font-medium tabular-nums">
                      {formatOrderAmount(order.totalAmount, order.currency, order.exchangeRate)}
                    </span>
                  </span>
                  <span>
                    {t.paid}{" "}
                    <span className="font-medium tabular-nums">
                      {formatOrderAmount(order.paidAmount, order.currency, order.exchangeRate)}
                    </span>
                  </span>
                  {order.debtAmount > 0 ? (
                    <span>
                      {isOperationalDebtOrder(order) ? t.debt : t.amountDue}{" "}
                      <span
                        className={orderUnpaidAmountClassName(order, order.debtAmount)}
                      >
                        {formatOrderAmount(order.debtAmount, order.currency, order.exchangeRate)}
                      </span>
                      {isOrderFinancialOverdue(order.financialStatus) ? (
                        <span className="ml-1 text-[10px] font-semibold uppercase text-red-700">
                          · {t.overdue}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {order.creditAmount > 0 ? (
                    <span>
                      {t.credit}{" "}
                      <span className="font-medium tabular-nums">
                        {formatOrderAmount(order.creditAmount, order.currency, order.exchangeRate)}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
              <OrderMovementSections
                parentOrderNumber={order.orderNumber}
                payments={order.paymentsSummary}
                returns={order.returnsSummary}
                children={order.children}
                parentHasPayments={order.counts.payments > 0}
                onOpenOrder={onOpenOrder}
                onOpenReturn={onOpenReturn}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
