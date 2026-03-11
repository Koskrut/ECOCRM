"use client";

import { CheckCircle2, Truck } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

export type OrderCardOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  owner?: { id: string; fullName: string } | null;
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID";
  isPaid?: boolean;
  hasTtn?: boolean;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string } | null;
  clientId?: string | null;
};

function formatRelativeTime(createdAt: string): string {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "щойно";
  if (diffMins < 60) return `${diffMins} хв тому`;
  if (diffHours < 24) return `${diffHours} год тому`;
  if (diffDays < 7) return `${diffDays} дн тому`;
  return date.toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
}

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
      ? `${order.client.firstName} ${order.client.lastName}`.trim() || "—"
      : order.company?.name ?? "—";

  return (
    <button
      type="button"
      onClick={() => onOpen(order.id)}
      className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md active:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium text-zinc-900">
            <span>{order.orderNumber}</span>
            {order.hasTtn && (
              <span title="ТТН создана" className="inline-flex text-blue-600">
                <Truck className="h-4 w-4" />
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

      <div className="mt-3">
        <StatusBadge variant="order" status={order.status} />
      </div>

      <div className="mt-3 text-xs font-medium uppercase text-zinc-500">Сума</div>
      <div className="text-sm font-medium text-zinc-900">
        {order.totalAmount.toFixed(2)} {order.currency}
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

      <div className="mt-3 text-xs font-medium uppercase text-zinc-500">Відповідальний</div>
      <div className="mt-1 text-sm text-zinc-900">{order.owner?.fullName ?? "—"}</div>
    </button>
  );
}
