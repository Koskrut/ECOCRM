"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { OrderModal } from "@/app/orders/OrderModal";
import { ordersApi, type FulfillmentQueueOrder } from "@/lib/api/resources/orders";
import { listWarehouses, type WarehouseItem } from "@/lib/api/resources/warehouses";
import { apiHttp } from "@/lib/api/client";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { strings } from "@/locales";

const WORKSPACE_STAGE = "CONFIRMED";
const NEXT_STAGE = "READY_TO_SHIP";
const WAREHOUSE_FILTER_STORAGE_KEY = "warehouse.selectedIds";

function clientLabel(order: FulfillmentQueueOrder): string {
  if (order.client) {
    const full = `${order.client.lastName ?? ""} ${order.client.firstName ?? ""}`.trim();
    return full || "—";
  }
  return order.company?.name ?? "—";
}

function deliveryMethodLabel(method: string | null | undefined): string {
  if (method === "NOVA_POSHTA") return "Нова Пошта";
  if (method === "PICKUP") return "Самовивіз";
  return method ?? "—";
}

function loadStoredWarehouseIds(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WAREHOUSE_FILTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : null;
  } catch {
    return null;
  }
}

function saveStoredWarehouseIds(ids: string[]) {
  localStorage.setItem(WAREHOUSE_FILTER_STORAGE_KEY, JSON.stringify(ids));
}

export default function WarehouseWorkPage() {
  const [items, setItems] = useState<FulfillmentQueueOrder[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pickModalOrderId, setPickModalOrderId] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [userRole, setUserRole] = useState<string | null>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);

  useEffect(() => {
    void listWarehouses()
      .then((list) => {
        setWarehouses(list);
        const stored = loadStoredWarehouseIds();
        const allIds = list.map((w) => w.id);
        if (stored && stored.length > 0) {
          setSelectedWarehouseIds(stored.filter((id) => allIds.includes(id)));
        } else {
          setSelectedWarehouseIds(allIds);
        }
      })
      .catch(() => setWarehouses([]));
  }, []);

  const activeWarehouseFilter = useMemo(() => {
    if (warehouses.length === 0) return undefined;
    if (selectedWarehouseIds.length === 0) return [];
    if (selectedWarehouseIds.length === warehouses.length) return undefined;
    return selectedWarehouseIds;
  }, [selectedWarehouseIds, warehouses]);

  const loadQueue = useCallback(async () => {
    if (activeWarehouseFilter && activeWarehouseFilter.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await ordersApi.getFulfillmentQueue({
        warehouseIds: activeWarehouseFilter,
      });
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
  }, [activeWarehouseFilter]);

  useEffect(() => {
    if (warehouses.length === 0 && selectedWarehouseIds.length === 0) return;
    void loadQueue();
  }, [loadQueue, warehouses.length, selectedWarehouseIds.length]);

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

  useEffect(() => {
    if (!pickOrder) {
      setQtyDrafts({});
      return;
    }
    const drafts: Record<string, string> = {};
    for (const it of pickOrder.items ?? []) {
      drafts[it.id] = String(it.qty);
    }
    setQtyDrafts(drafts);
  }, [pickOrder]);

  const toggleWarehouse = (id: string) => {
    setSelectedWarehouseIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveStoredWarehouseIds(next);
      return next;
    });
  };

  const closePickModal = () => {
    if (advancing || splitting || savingItemId) return;
    setPickModalOrderId(null);
  };

  const advanceStage = async () => {
    if (!pickOrder) return;
    setAdvancing(true);
    setErr(null);
    setInfo(null);
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

  const splitByStock = async () => {
    if (!pickOrder) return;
    setSplitting(true);
    setErr(null);
    setInfo(null);
    try {
      const result = await ordersApi.splitByStock(pickOrder.id);
      const childNo = result?.child?.orderNumber;
      setPickModalOrderId(null);
      await loadQueue();
      setInfo(
        childNo
          ? `Замовлення розділено. Дочірнє: ${childNo}`
          : "Замовлення розділено по залишках",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося розділити замовлення");
    } finally {
      setSplitting(false);
    }
  };

  const saveItemQty = async (itemId: string) => {
    if (!pickOrder) return;
    const raw = qtyDrafts[itemId];
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty < 1) {
      setErr("Кількість має бути не менше 1");
      return;
    }
    const existing = pickOrder.items?.find((it) => it.id === itemId);
    if (existing && existing.qty === qty) return;

    setSavingItemId(itemId);
    setErr(null);
    try {
      await ordersApi.updateItem(pickOrder.id, itemId, { qty });
      await loadQueue();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося зберегти кількість");
    } finally {
      setSavingItemId(null);
    }
  };

  const busy = advancing || splitting || savingItemId != null;

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

        {warehouses.length > 0 ? (
          <div className="mb-3 rounded-lg border border-zinc-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Склади
            </div>
            <div className="flex flex-wrap gap-2">
              {warehouses.map((w) => {
                const active = selectedWarehouseIds.includes(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => toggleWarehouse(w.id)}
                    className={[
                      "rounded-full border px-3 py-1 text-sm transition",
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    {w.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {err ? <p className="mb-2 text-sm text-red-600">{err}</p> : null}
        {info ? <p className="mb-2 text-sm text-emerald-700">{info}</p> : null}

        <div className="min-h-[200px] overflow-y-auto rounded-lg border border-zinc-200 bg-white">
          {loading ? (
            <p className="p-4 text-sm text-zinc-500">Завантаження…</p>
          ) : selectedWarehouseIds.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">Оберіть хоча б один склад</p>
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
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700">
                          Підтверджено
                        </span>
                        {o.warehouse?.name ? (
                          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-800">
                            {o.warehouse.name}
                          </span>
                        ) : null}
                      </div>
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
                disabled={busy}
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

              <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Склад
                  </div>
                  <div className="mt-0.5 font-medium text-zinc-900">
                    {pickOrder.warehouse?.name ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Доставка
                  </div>
                  <div className="mt-0.5 font-medium text-zinc-900">
                    {deliveryMethodLabel(pickOrder.deliveryMethod)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Документи
                  </div>
                  <div className="mt-0.5 font-medium text-zinc-900">
                    {pickOrder.documentsRequested === true ? "Так" : "Ні"}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Коментар
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-zinc-700">
                    {pickOrder.comment?.trim() ? pickOrder.comment : "—"}
                  </p>
                </div>
              </div>

              <h3 className="text-sm font-semibold text-zinc-800">Товари</h3>
              <ul className="mt-2 divide-y divide-zinc-100">
                {(pickOrder.items ?? []).map((it) => {
                  const name = it.product?.name ?? it.productNameSnapshot ?? "—";
                  const saving = savingItemId === it.id;
                  return (
                    <li key={it.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        {it.product?.sku ? (
                          <span className="font-medium text-zinc-800">{it.product.sku}</span>
                        ) : null}
                        {it.product?.sku ? " · " : ""}
                        <span className="text-zinc-700">{name}</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={qtyDrafts[it.id] ?? String(it.qty)}
                          disabled={busy}
                          onChange={(e) =>
                            setQtyDrafts((prev) => ({ ...prev, [it.id]: e.target.value }))
                          }
                          onBlur={() => void saveItemQty(it.id)}
                          className="w-16 rounded border border-zinc-200 px-2 py-1 text-right tabular-nums"
                        />
                        {saving ? (
                          <span className="text-xs text-zinc-400">…</span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
                {(pickOrder.items ?? []).length === 0 ? (
                  <li className="py-2 text-sm text-zinc-500">Немає позицій</li>
                ) : null}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setOrderModalOpen(true)}
                disabled={busy}
                className="text-sm text-zinc-600 hover:text-zinc-900 disabled:opacity-50"
              >
                Відкрити картку
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void splitByStock()}
                  disabled={busy}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {splitting ? "Розділення…" : "Розділити по залишках"}
                </button>
                <button
                  type="button"
                  onClick={() => void advanceStage()}
                  disabled={busy}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {advancing ? "Оновлення…" : "Готово до відправки"}
                </button>
              </div>
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
