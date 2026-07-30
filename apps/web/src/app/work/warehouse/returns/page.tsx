"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Package, Search, X } from "lucide-react";
import { TtnStatusBadge } from "@/components/TtnStatusBadge";
import { OrderModal } from "@/app/orders/OrderModal";
import {
  returnPackagesApi,
  type ReturnPackage,
  type ReturnPackageLinkedReturn,
} from "@/lib/api/resources/return-packages";
import { apiHttp } from "@/lib/api/client";
import { strings } from "@/locales";
import { scheduleModalClose } from "@/lib/modal/scheduleModalClose";

type SearchOrder = {
  id: string;
  orderNumber: string;
  client?: { id: string; firstName: string; lastName: string } | null;
  company?: { id: string; name: string } | null;
  items?: Array<{
    id: string;
    qty: number;
    productName?: string | null;
    product?: { name: string } | null;
  }>;
};

const STATUS_LABELS: Record<string, string> = {
  IN_TRANSIT_BACK: "В дорозі назад",
  RECEIVED_BY_WAREHOUSE: "Прийнято на склад",
};

function clientLabel(pkg: ReturnPackage): string {
  if (pkg.contact) {
    const full = `${pkg.contact.lastName ?? ""} ${pkg.contact.firstName ?? ""}`.trim();
    return full || pkg.contact.phone || "—";
  }
  const fromReturn = pkg.returns[0]?.order;
  if (fromReturn?.client) {
    return `${fromReturn.client.lastName ?? ""} ${fromReturn.client.firstName ?? ""}`.trim() || "—";
  }
  return fromReturn?.company?.name ?? "—";
}

function linkedOrdersLabel(returns: ReturnPackageLinkedReturn[]): string {
  if (returns.length === 0) return "Замовлення не привʼязані";
  return returns.map((r) => r.order.orderNumber).join(", ");
}

export default function WarehouseReturnsPage() {
  const [items, setItems] = useState<ReturnPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderSearchResults, setOrderSearchResults] = useState<SearchOrder[]>([]);
  const [orderSearchLoading, setOrderSearchLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SearchOrder | null>(null);
  const [itemQtyDrafts, setItemQtyDrafts] = useState<Record<string, string>>({});
  const [orderModalId, setOrderModalId] = useState<string | null>(null);

  const selected = useMemo(
    () => items.find((p) => p.id === selectedId) ?? null,
    [items, selectedId],
  );

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await returnPackagesApi.listWarehouseQueue();
      setItems(data.items ?? []);
      setSelectedId((prev) => {
        if (prev && data.items?.some((p) => p.id === prev)) return prev;
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
    if (!selectedOrder?.items?.length) {
      setItemQtyDrafts({});
      return;
    }
    const drafts: Record<string, string> = {};
    for (const it of selectedOrder.items) {
      drafts[it.id] = String(it.qty);
    }
    setItemQtyDrafts(drafts);
  }, [selectedOrder]);

  const searchOrders = useCallback(async () => {
    const q = orderSearch.trim();
    if (q.length < 2) {
      setOrderSearchResults([]);
      return;
    }
    setOrderSearchLoading(true);
    try {
      const res = await apiHttp.get<{ items?: SearchOrder[] }>("/orders", {
        params: { q, page: 1, pageSize: 10 },
      });
      setOrderSearchResults(res.data?.items ?? []);
    } catch {
      setOrderSearchResults([]);
    } finally {
      setOrderSearchLoading(false);
    }
  }, [orderSearch]);

  const closeModal = () => {
    scheduleModalClose(() => {
      setSelectedId(null);
      setSelectedOrder(null);
      setOrderSearch("");
      setOrderSearchResults([]);
    });
  };

  const runAction = async (fn: () => Promise<unknown>, successMsg: string) => {
    setActionLoading(true);
    setInfo(null);
    setErr(null);
    try {
      await fn();
      setInfo(successMsg);
      await loadQueue();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка операції");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReceive = () => {
    if (!selected) return;
    void runAction(
      () => returnPackagesApi.receive(selected.id),
      "Посилку позначено як прийняту",
    );
  };

  const handleAddItems = () => {
    if (!selected || !selectedOrder) return;
    const itemsPayload = (selectedOrder.items ?? [])
      .map((it) => ({
        orderItemId: it.id,
        qtyReturned: Math.max(0, Math.min(it.qty, Number(itemQtyDrafts[it.id]) || 0)),
      }))
      .filter((x) => x.qtyReturned > 0);
    if (itemsPayload.length === 0) {
      setErr("Оберіть кількість хоча б по одній позиції");
      return;
    }
    void runAction(
      () =>
        returnPackagesApi.addItems(selected.id, {
          orderId: selectedOrder.id,
          items: itemsPayload,
        }),
      "Позиції додано до посилки",
    );
  };

  const handleCompleteInspection = () => {
    if (!selected) return;
    void runAction(
      () => returnPackagesApi.completeInspection(selected.id),
      "Розбір завершено — повернення переведено на перевірку",
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Повернення на склад</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Вхідні посилки з ТТН: прийом, розбір по замовленнях, передача на перевірку.
        </p>
      </div>

      {info ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {info}
        </div>
      ) : null}
      {err ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-zinc-500">Завантаження…</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          Немає посилок у черзі
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => setSelectedId(pkg.id)}
              className="flex w-full items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm hover:border-zinc-400"
            >
              <Package className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-zinc-900">ТТН {pkg.ttnNumber}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {STATUS_LABELS[pkg.status] ?? pkg.status}
                  </span>
                  <TtnStatusBadge
                    statusCode={pkg.ttnStatusCode}
                    statusText={pkg.ttnStatusText}
                  />
                </div>
                <div className="mt-1 text-sm text-zinc-600">{clientLabel(pkg)}</div>
                <div className="mt-1 text-xs text-zinc-500">{linkedOrdersLabel(pkg.returns)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (actionLoading) return;
            closeModal();
          }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">ТТН {selected.ttnNumber}</h2>
                <p className="mt-0.5 text-sm text-zinc-500">{clientLabel(selected)}</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100"
                aria-label={strings.common.close}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-zinc-600">
                  {STATUS_LABELS[selected.status] ?? selected.status}
                </span>
                <TtnStatusBadge
                  statusCode={selected.ttnStatusCode}
                  statusText={selected.ttnStatusText}
                  size="md"
                />
              </div>

              {selected.returns.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-zinc-800">Повʼязані повернення</h3>
                  {selected.returns.map((ret) => (
                    <div
                      key={ret.id}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
                    >
                      <button
                        type="button"
                        className="font-medium text-zinc-900 hover:underline"
                        onClick={() => setOrderModalId(ret.orderId)}
                      >
                        Замовлення {ret.order.orderNumber}
                      </button>
                      <div className="mt-1 text-xs text-zinc-500">
                        {ret.itemsPending && ret.items.length === 0
                          ? "Очікує розбору позицій"
                          : `${ret.items.length} поз. · ${ret.items.reduce((s, i) => s + i.qtyReturned, 0)} од.`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-amber-700">Посилка без привʼязаних замовлень — знайдіть замовлення нижче.</p>
              )}

              {selected.status === "RECEIVED_BY_WAREHOUSE" ? (
                <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
                  <h3 className="text-sm font-medium text-zinc-800">Додати позиції з замовлення</h3>
                  <div className="flex gap-2">
                    <input
                      type="search"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Номер або клієнт…"
                      className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={orderSearchLoading}
                      onClick={() => void searchOrders()}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50"
                    >
                      <Search className="h-4 w-4" />
                      Знайти
                    </button>
                  </div>
                  {orderSearchLoading ? (
                    <p className="text-xs text-zinc-500">Пошук…</p>
                  ) : orderSearchResults.length > 0 ? (
                    <div className="space-y-1">
                      {orderSearchResults.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            setSelectedOrder(o);
                            setOrderSearchResults([]);
                          }}
                          className={`block w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                            selectedOrder?.id === o.id
                              ? "border-zinc-900 bg-zinc-50"
                              : "border-zinc-200"
                          }`}
                        >
                          {o.orderNumber}
                          {o.client
                            ? ` · ${o.client.lastName ?? ""} ${o.client.firstName ?? ""}`.trim()
                            : o.company?.name
                              ? ` · ${o.company.name}`
                              : ""}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {selectedOrder?.items?.length ? (
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {selectedOrder.items.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                        >
                          <span className="min-w-0 truncate">
                            {it.productName ?? it.product?.name ?? "—"}
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={it.qty}
                            value={itemQtyDrafts[it.id] ?? "0"}
                            onChange={(e) =>
                              setItemQtyDrafts((prev) => ({ ...prev, [it.id]: e.target.value }))
                            }
                            className="w-16 rounded border border-zinc-300 px-2 py-0.5 text-right text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-zinc-200 px-5 py-4">
              {selected.status === "IN_TRANSIT_BACK" ? (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleReceive}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  Прийняв на склад
                </button>
              ) : null}
              {selected.status === "RECEIVED_BY_WAREHOUSE" && selectedOrder ? (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleAddItems}
                  className="rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  Додати позиції
                </button>
              ) : null}
              {selected.status === "RECEIVED_BY_WAREHOUSE" ? (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleCompleteInspection}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Розбір завершено
                </button>
              ) : null}
              <button
                type="button"
                disabled={actionLoading}
                onClick={closeModal}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                {strings.common.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {orderModalId ? (
        <OrderModal
          apiBaseUrl="/api"
          orderId={orderModalId}
          onClose={() => setOrderModalId(null)}
          onSaved={() => void loadQueue()}
        />
      ) : null}
    </div>
  );
}
