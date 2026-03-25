"use client";

import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { isTextSelected } from "@/lib/dom";
import type { ContactCardPayload } from "./contact-card.types";

function stageLabel(stage: string | null): string {
  if (!stage) return "—";
  const map: Record<string, string> = {
    NEW: "Нове",
    CONFIRMED: "Підтверджено",
    AWAITING_PAYMENT: "Очікує оплати",
    AWAITING_STOCK: "Очікує залишку",
    READY_TO_SHIP: "До відправки",
    SHIPPED: "Відправлено",
    AWAITING_RECEIPT: "Очікує отримання",
    RECEIVED: "Отримано",
    COMPLETED: "Завершено",
    CANCELED: "Скасовано",
    REFUSED: "Відмова",
    RETURN_IN_PROGRESS: "Повернення",
  };
  return map[stage] ?? stage;
}

function OrderRows({
  items,
  onOpenOrder,
}: {
  items: ContactCardPayload["canonicalOrders"]["items"];
  onOpenOrder: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">Немає замовлень у цьому блоці.</p>;
  }
  return (
    <div className="divide-y divide-zinc-200">
      {items.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => {
            if (isTextSelected()) return;
            onOpenOrder(o.id);
          }}
          className="w-full px-4 py-3 text-left hover:bg-zinc-50"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900">
                {o.orderNumber}
                <span className="ml-2 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-700">
                  {stageLabel(o.orderStage)}
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {new Date(o.createdAt).toLocaleString("uk-UA")}
              </div>
            </div>
            <div className="whitespace-nowrap text-sm text-zinc-900">
              {formatOrderAmount(Number(o.totalAmount), o.currency ?? "UAH", null)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export function ContactOrdersSections({
  data,
  loading,
  onOpenOrder,
}: {
  data: ContactCardPayload | null;
  loading: boolean;
  onOpenOrder: (orderId: string) => void;
}) {
  if (loading && !data) {
    return (
      <div className="space-y-3" aria-busy aria-label="Завантаження замовлень">
        <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <div className="h-4 w-48 animate-pulse rounded bg-zinc-200" />
          </div>
          <div className="divide-y divide-zinc-100">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-zinc-100" />
                  <div className="h-3 w-28 animate-pulse rounded bg-zinc-100" />
                </div>
                <div className="h-4 w-16 shrink-0 animate-pulse rounded bg-zinc-100" />
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }
  if (!data) {
    return <div className="text-sm text-zinc-500">Немає даних картки.</div>;
  }

  const { canonicalOrders, legacyLinkedOrders, companyOrders } = data;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">
          Замовлення клієнта (clientId) — KPI{" "}
          <span className="font-normal text-zinc-500">({canonicalOrders.total})</span>
        </div>
        <OrderRows items={canonicalOrders.items} onOpenOrder={onOpenOrder} />
      </section>

      {legacyLinkedOrders.total > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/40">
          <div className="border-b border-amber-200 px-4 py-3 text-sm font-semibold text-amber-950">
            Зв’язок лише через ТТН (legacy, без clientId){" "}
            <span className="font-normal text-amber-800">({legacyLinkedOrders.total})</span>
          </div>
          <OrderRows items={legacyLinkedOrders.items} onOpenOrder={onOpenOrder} />
        </section>
      ) : null}

      {companyOrders.total > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-zinc-50/50">
          <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">
            Замовлення компанії (не як клієнт цього контакта){" "}
            <span className="font-normal text-zinc-500">({companyOrders.total})</span>
          </div>
          <OrderRows items={companyOrders.items} onOpenOrder={onOpenOrder} />
        </section>
      ) : null}
    </div>
  );
}
