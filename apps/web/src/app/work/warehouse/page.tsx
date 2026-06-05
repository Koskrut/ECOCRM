"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { OrderModal } from "@/app/orders/OrderModal";
import { ordersApi, type FulfillmentQueueOrder } from "@/lib/api/resources/orders";
import { apiHttp } from "@/lib/api/client";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { strings } from "@/locales";

const WORKSPACE_STAGE = "CONFIRMED";
const NEXT_STAGE = "READY_TO_SHIP";

function clientLabel(order: FulfillmentQueueOrder): string {
  if (order.client) {
    const full = `${order.client.lastName ?? ""} ${order.client.firstName ?? ""}`.trim();
    return full || "—";
  }
  return order.company?.name ?? "—";
}

export default function WarehouseWorkPage() {
  const [items, setItems] = useState<FulfillmentQueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pickModalOrderId, setPickModalOrderId] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await ordersApi.getFulfillmentQueue();
      const confirmed = (data.items ?? []).filter((o) => o.orderStage === WORKSPACE_STAGE);
      setItems(confirmed);
      setPickModalOrderId((prev) => {
        if (prev && confirmed.some((o) => o.id === prev)) return prev;
        return null;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося завантажити чергу");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setUserRole(r.data?.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  const pickOrder = useMemo(
    () => items.find((o) => o.id === pickModalOrderId) ?? null,
    [items, pickModalOrderId],
  );

  const closePickModal = () => {
    if (advancing) return;
    setPickModalOrderId(null);
  };

  const advanceStage = async () => {
    if (!pickOrder) return;
    setAdvancing(true);
    setErr(null);
    try {
      await ordersApi.patchStage(pickOrder.id, NEXT_STAGE, "Warehouse workspace");
      setPickModalOrderId(null);
      await loadQueue();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося оновити стадію");
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-3 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-3">
          <Link href="/orders" className="text-sm text-zinc-600 hover:text-zinc-900">
            ← {strings.nav.orders}
          </Link>
          <h1 className="mt-1 text-xl font-bold text-zinc-900">{strings.nav.warehouseWork}</h1>
          <p className="text-sm text-zinc-500">Збірка підтверджених замовлень</p>
        </div>

        {err ? <p className="mb-2 text-sm text-red-600">{err}</p> : null}

        <div className="min-h-[200px] overflow-y-auto rounded-lg border border-zinc-200 bg-white">
          {loading ? (
            <p className="p-4 text-sm text-zinc-500">Завантаження…</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">Немає замовлень на збірку</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {items.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setPickModalOrderId(o.id)}
                    className="w-full px-4 py-3 text-left transition hover:bg-zinc-50"
                  >
                    <div className="font-medium text-zinc-900">{o.orderNumber}</div>
                    <div className="text-xs text-zinc-600">{clientLabel(o)}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700">
                        Підтверджено
                      </span>
                      <span className="shrink-0 tabular-nums text-zinc-500">
                        {formatOrderAmount(o.totalAmount, o.currency)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {pickOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
          role="presentation"
          onClick={closePickModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="warehouse-pick-title"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
              <div className="min-w-0">
                <h2 id="warehouse-pick-title" className="text-lg font-semibold text-zinc-900">
                  {pickOrder.orderNumber}
                </h2>
                <p className="text-sm text-zinc-600">{clientLabel(pickOrder)}</p>
              </div>
              <button
                type="button"
                onClick={closePickModal}
                disabled={advancing}
                className="shrink-0 rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50"
                aria-label="Закрити"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto px-4 py-3">
              {pickOrder.paymentType === "PREPAYMENT" &&
              Number(pickOrder.paidAmount ?? 0) < Number(pickOrder.totalAmount ?? 0) ? (
                <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Передоплата не закрита — перехід може бути заблокований.
                </p>
              ) : null}

              <h3 className="text-sm font-semibold text-zinc-800">Товари</h3>
              <ul className="mt-2 divide-y divide-zinc-100">
                {(pickOrder.items ?? []).map((it) => (
                  <li key={it.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      {it.product?.sku ? (
                        <span className="font-medium text-zinc-800">{it.product.sku}</span>
                      ) : null}
                      {it.product?.sku ? " · " : ""}
                      <span className="text-zinc-700">
                        {it.product?.name ?? it.productNameSnapshot ?? "—"}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums font-medium text-zinc-900">
                      ×{it.qty}
                    </span>
                  </li>
                ))}
                {(pickOrder.items ?? []).length === 0 ? (
                  <li className="py-2 text-sm text-zinc-500">Немає позицій</li>
                ) : null}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setOrderModalOpen(true)}
                disabled={advancing}
                className="text-sm text-zinc-600 hover:text-zinc-900 disabled:opacity-50"
              >
                Відкрити картку
              </button>
              <button
                type="button"
                onClick={() => void advanceStage()}
                disabled={advancing}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {advancing ? "Оновлення…" : "Готово до відправки"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {orderModalOpen && pickOrder ? (
        <OrderModal
          apiBaseUrl="/api"
          orderId={pickOrder.id}
          onClose={() => setOrderModalOpen(false)}
          onSaved={() => {
            void loadQueue();
            setOrderModalOpen(false);
          }}
          userRole={userRole}
        />
      ) : null}
    </div>
  );
}
