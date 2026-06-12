"use client";

import { AlertTriangle, CheckCircle2, Globe, MailPlus } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { isTextSelected } from "@/lib/dom";

export type OrderCardOrder = {
  id: string;
  orderNumber: string;
  orderSource?: "CRM" | "STORE" | null;
  status: string;
  orderStage?: string | null;
  totalAmount: number;
  currency: string;
  exchangeRate?: number | null;
  createdAt: string;
  owner?: { id: string; fullName: string } | null;
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID";
  isPaid?: boolean;
  hasTtn?: boolean;
  /** Same TTN number is linked to more than one order */
  ttnSharedAcrossOrders?: boolean;
  debtAmount?: number;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string } | null;
  clientId?: string | null;
  warehouseId?: string | null;
  warehouse?: { id: string; name: string } | null;
};

export function OrderCard({
  order,
  onOpen,
  onOpenContact,
}: {
  order: OrderCardOrder;
  onOpen: (orderId: string) => void;
  onOpenContact?: (contactId: string) => void;
}) {
  const clientName =
    order.client != null
      ? `${order.client.lastName} ${order.client.firstName}`.trim() || "—"
      : order.company?.name ?? "—";
  const formattedAmount = formatOrderAmount(order.totalAmount, order.currency, order.exchangeRate);

  return (
    <button
      type="button"
      onClick={() => {
        if (isTextSelected()) return;
        onOpen(order.id);
      }}
      className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md active:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium text-zinc-900">
            <span>{order.orderNumber}</span>
            {order.orderSource === "STORE" && (
              <span title="Заказ с сайта" className="inline-flex text-violet-600">
                <Globe className="h-4 w-4" />
              </span>
            )}
            {order.hasTtn && (
              <span title="ТТН создана" className="inline-flex text-blue-600">
                <MailPlus className="h-4 w-4" />
              </span>
            )}
            {order.ttnSharedAcrossOrders && (
              <span
                title="Номер ТТН также привязан к другому заказу"
                className="inline-flex text-amber-600"
              >
                <AlertTriangle className="h-4 w-4" />
              </span>
            )}
            {(order.isPaid || order.paymentStatus === "PAID" || order.paymentStatus === "OVERPAID") && (
              <span title="Заказ оплачен" className="inline-flex text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">{formatRelativeTime(order.createdAt)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge variant="order" status={order.status} orderStage={order.orderStage} />
        {order.orderStage === "RECEIVED" && (order.debtAmount ?? 0) > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            Неоплачено
          </span>
        )}
      </div>

      <div className="mt-3 text-xs font-medium uppercase text-zinc-500">Сума</div>
      <div className="text-sm font-medium text-zinc-900">
        {formattedAmount}
      </div>

      <div className="mt-3 text-xs font-medium uppercase text-zinc-500">Клієнт</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="truncate text-sm text-zinc-900">{clientName}</span>
        {order.clientId && onOpenContact && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onOpenContact(order.clientId!);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onOpenContact(order.clientId!);
              }
            }}
            className="shrink-0 text-xs font-medium text-blue-600 underline"
          >
            контакт
          </span>
        )}
      </div>

      <div className="mt-3 text-xs font-medium uppercase text-zinc-500">Склад</div>
      <div className="mt-1 text-sm text-zinc-900">{order.warehouse?.name ?? "—"}</div>

      <div className="mt-3 text-xs font-medium uppercase text-zinc-500">Відповідальний</div>
      <div className="mt-1 text-sm text-zinc-900">{order.owner?.fullName ?? "—"}</div>
    </button>
  );
}
