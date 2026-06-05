"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderModal } from "@/app/orders/OrderModal";
import { ordersApi, type FulfillmentQueueOrder } from "@/lib/api/resources/orders";
import { apiHttp } from "@/lib/api/client";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { strings } from "@/locales";

type WarehouseTab = "picking" | "shipping";

const STAGE_LABELS: Record<string, string> = {
  AWAITING_STOCK: "Очікує на склад",
  CONFIRMED: "Підтверджено",
  READY_TO_SHIP: "Готово до відправки",
  SHIPPED: "Відправлено",
};

const PICKING_STAGES = new Set(["AWAITING_STOCK", "CONFIRMED"]);
const SHIPPING_STAGES = new Set(["READY_TO_SHIP"]);

const NEXT_STAGE: Record<string, string> = {
  AWAITING_STOCK: "CONFIRMED",
  CONFIRMED: "READY_TO_SHIP",
  READY_TO_SHIP: "SHIPPED",
};

const ACTION_LABELS: Record<string, string> = {
  CONFIRMED: "Зібрано",
  READY_TO_SHIP: "Готово до відправки",
  SHIPPED: "Відправлено",
};

function clientLabel(order: FulfillmentQueueOrder): string {
  if (order.client) {
    const full = `${order.client.lastName ?? ""} ${order.client.firstName ?? ""}`.trim();
    return full || "—";
  }
  return order.company?.name ?? "—";
}

export default function WarehouseWorkPage() {
  const [tab, setTab] = useState<WarehouseTab>("picking");
  const [items, setItems] = useState<FulfillmentQueueOrder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await ordersApi.getFulfillmentQueue();
      setItems(data.items ?? []);
      setCounts(data.counts ?? {});
      setSelectedId((prev) => {
        if (prev && (data.items ?? []).some((o) => o.id === prev)) return prev;
        const filtered = (data.items ?? []).filter((o) => {
          const st = o.orderStage ?? "";
          return tab === "picking" ? PICKING_STAGES.has(st) : SHIPPING_STAGES.has(st);
        });
        return filtered[0]?.id ?? null;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося завантажити чергу");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setUserRole(r.data?.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  const filteredItems = useMemo(
    () =>
      items.filter((o) => {
        const st = o.orderStage ?? "";
        return tab === "picking" ? PICKING_STAGES.has(st) : SHIPPING_STAGES.has(st);
      }),
    [items, tab],
  );

  const selected = useMemo(
    () => items.find((o) => o.id === selectedId) ?? null,
    [items, selectedId],
  );

  const nextStage = selected?.orderStage ? NEXT_STAGE[selected.orderStage] : undefined;
  const nextActionLabel = nextStage ? ACTION_LABELS[nextStage] : null;

  const advanceStage = async () => {
    if (!selected || !nextStage) return;
    setAdvancing(true);
    setErr(null);
    try {
      await ordersApi.patchStage(selected.id, nextStage, "Warehouse workspace");
      await loadQueue();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося оновити стадію");
    } finally {
      setAdvancing(false);
    }
  };

  const splitByStock = async () => {
    if (!selected) return;
    setSplitting(true);
    setErr(null);
    try {
      await ordersApi.splitByStock(selected.id);
      await loadQueue();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося розділити замовлення");
    } finally {
      setSplitting(false);
    }
  };

  const pickingCount =
    (counts.AWAITING_STOCK ?? 0) + (counts.CONFIRMED ?? 0);
  const shippingCount = counts.READY_TO_SHIP ?? 0;

  return (
    <div className="min-h-screen bg-zinc-50 p-3 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="flex w-full flex-col lg:max-w-sm">
          <div className="mb-3">
            <Link href="/orders" className="text-sm text-zinc-600 hover:text-zinc-900">
              ← {strings.nav.orders}
            </Link>
            <h1 className="mt-1 text-xl font-bold text-zinc-900">{strings.nav.warehouseWork}</h1>
            <p className="text-sm text-zinc-500">Збірка та відправка замовлень</p>
          </div>

          <div className="mb-3 flex gap-2 rounded-lg border border-zinc-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setTab("picking")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                tab === "picking" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              Збірка ({pickingCount})
            </button>
            <button
              type="button"
              onClick={() => setTab("shipping")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                tab === "shipping" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              Відправка ({shippingCount})
            </button>
          </div>

          {err ? <p className="mb-2 text-sm text-red-600">{err}</p> : null}

          <div className="min-h-[200px] flex-1 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
            {loading ? (
              <p className="p-4 text-sm text-zinc-500">Завантаження…</p>
            ) : filteredItems.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500">Немає замовлень у цій черзі</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {filteredItems.map((o) => {
                  const active = o.id === selectedId;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(o.id)}
                        className={`w-full px-4 py-3 text-left transition ${
                          active ? "bg-sky-50" : "hover:bg-zinc-50"
                        }`}
                      >
                        <div className="font-medium text-zinc-900">{o.orderNumber}</div>
                        <div className="text-xs text-zinc-600">{clientLabel(o)}</div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700">
                            {STAGE_LABELS[o.orderStage ?? ""] ?? o.orderStage}
                          </span>
                          <span className="tabular-nums text-zinc-500">
                            {formatOrderAmount(o.totalAmount, o.currency)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          {!selected ? (
            <p className="text-sm text-zinc-500">Оберіть замовлення з черги</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">{selected.orderNumber}</h2>
                  <p className="text-sm text-zinc-600">{clientLabel(selected)}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Стадія: {STAGE_LABELS[selected.orderStage ?? ""] ?? selected.orderStage ?? "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOrderModalOpen(true)}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  Відкрити картку
                </button>
              </div>

              {selected.paymentType === "PREPAYMENT" &&
              Number(selected.paidAmount ?? 0) < Number(selected.totalAmount ?? 0) ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Передоплата не закрита — перехід у «Готово до відправки» може бути заблокований.
                </p>
              ) : null}

              <div>
                <h3 className="text-sm font-semibold text-zinc-800">Позиції</h3>
                <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                  {(selected.items ?? []).map((it) => (
                    <li key={it.id} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {it.product?.sku ? `${it.product.sku} · ` : ""}
                        {it.product?.name ?? it.productNameSnapshot ?? "—"}
                      </span>
                      <span className="shrink-0 tabular-nums">×{it.qty}</span>
                    </li>
                  ))}
                  {(selected.items ?? []).length === 0 ? (
                    <li className="text-zinc-500">Немає позицій</li>
                  ) : null}
                </ul>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
                {tab === "picking" && PICKING_STAGES.has(selected.orderStage ?? "") ? (
                  <button
                    type="button"
                    onClick={() => void splitByStock()}
                    disabled={splitting || advancing}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {splitting ? "Розділення…" : "Розділити по залишках"}
                  </button>
                ) : null}
                {nextActionLabel && nextStage ? (
                  <button
                    type="button"
                    onClick={() => void advanceStage()}
                    disabled={advancing || splitting}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {advancing ? "Оновлення…" : nextActionLabel}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {orderModalOpen && selected ? (
        <OrderModal
          apiBaseUrl="/api"
          orderId={selected.id}
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
