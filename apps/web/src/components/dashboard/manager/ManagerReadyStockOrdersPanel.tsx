"use client";

import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { formatMoneyBase, formatNumber } from "@/app/analytics/analytics-ui";
import type { OrderStockReadiness } from "@/components/orders/StockReadinessBadge";
import type { BaseCurrency } from "@/lib/base-currency";
import { strings } from "@/locales";

export type ManagerReadyStockOrder = {
  id: string;
  orderNumber: string;
  totalAmount: number;
  currency: string;
  stockReadiness?: OrderStockReadiness | null;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string } | null;
};

type Props = {
  items: ManagerReadyStockOrder[];
  total: number;
  loading: boolean;
  currency: BaseCurrency;
  onOpenOrder: (id: string) => void;
};

const FULL_LIST_HREF = "/orders?orderStage=AWAITING_STOCK";

function clientLabel(order: ManagerReadyStockOrder): string {
  if (order.client) {
    const full = `${order.client.lastName ?? ""} ${order.client.firstName ?? ""}`.trim();
    if (full) return full;
  }
  return order.company?.name?.trim() || strings.dashboard.manager.readyStock.noClient;
}

export function ManagerReadyStockOrdersPanel({
  items,
  total,
  loading,
  currency,
  onOpenOrder,
}: Props) {
  const t = strings.dashboard.manager.readyStock;

  return (
    <section className="rounded-xl border border-emerald-200/70 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
            <PackageCheck className="h-5 w-5 text-emerald-600" />
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900">
            {t.countLabel.replace("{count}", formatNumber(total))}
          </p>
          <Link
            href={FULL_LIST_HREF}
            className="text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
          >
            {t.viewAll}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="h-28 animate-pulse rounded-lg bg-zinc-100" />
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-100">
          {items.map((order) => {
            const orderCurrency = (order.currency === "EUR" ? "EUR" : currency) as BaseCurrency;
            return (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => onOpenOrder(order.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-emerald-50/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">
                      №{order.orderNumber}
                      <span className="ml-2 text-xs font-medium text-emerald-700">{t.badge}</span>
                    </p>
                    <p className="truncate text-xs text-zinc-500">{clientLabel(order)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">
                    {formatMoneyBase(order.totalAmount, orderCurrency)}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
