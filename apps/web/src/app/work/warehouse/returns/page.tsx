"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Package, Search, X } from "lucide-react";
import { TtnStatusBadge } from "@/components/TtnStatusBadge";
import { HelpHint } from "@/components/help/HelpHint";
import { OrderModal } from "@/app/orders/OrderModal";
import {
  returnPackagesApi,
  type ReturnPackage,
  type ReturnPackageLinkedReturn,
  type ReturnPackageReturnItem,
} from "@/lib/api/resources/return-packages";
import { listWarehouses, type WarehouseItem } from "@/lib/api/resources/warehouses";
import { apiHttp } from "@/lib/api/client";
import { strings } from "@/locales";
import { scheduleModalClose } from "@/lib/modal/scheduleModalClose";
import {
  DISPOSITION_OPTIONS,
  dispositionLabel,
  returnReasonLabel,
} from "@/lib/returns/return-labels";
import { buildWarehousesParam, parseWarehouseIdsParam } from "../warehouse-url";

type OrderLine = {
  id: string;
  qty: number;
  productName?: string | null;
  productNameSnapshot?: string | null;
  product?: { name: string; sku?: string | null } | null;
};

type SearchOrder = {
  id: string;
  orderNumber: string;
  client?: { id: string; firstName: string; lastName: string } | null;
  company?: { id: string; name: string } | null;
  items?: OrderLine[];
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

function needsBreakdown(ret: ReturnPackageLinkedReturn): boolean {
  return ret.itemsPending || ret.items.length === 0;
}

function packageNeedsBreakdown(pkg: ReturnPackage): boolean {
  if (pkg.status !== "RECEIVED_BY_WAREHOUSE") return false;
  if (pkg.returns.length === 0) return true;
  return pkg.returns.some(needsBreakdown);
}

function lineName(line: OrderLine): string {
  return line.productNameSnapshot ?? line.productName ?? line.product?.name ?? "—";
}

function returnItemName(it: ReturnPackageReturnItem): string {
  return (
    it.orderItem?.productNameSnapshot ??
    it.orderItem?.product?.name ??
    it.orderItem?.product?.sku ??
    "—"
  );
}

function draftKey(orderId: string, orderItemId: string): string {
  return `${orderId}:${orderItemId}`;
}

const WAREHOUSE_FILTER_STORAGE_KEY = "warehouse.returns.selectedIds";

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

function StepPill({
  n,
  label,
  state,
}: {
  n: number;
  label: string;
  state: "done" | "active" | "todo";
}) {
  const cls =
    state === "done"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : state === "active"
        ? "border-zinc-900 bg-zinc-900 text-white"
        : "border-zinc-200 bg-zinc-50 text-zinc-500";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}
    >
      <span className="tabular-nums">{n}</span>
      {label}
    </span>
  );
}

export default function WarehouseReturnsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-zinc-500">Завантаження повернень…</div>
      }
    >
      <WarehouseReturnsPageContent />
    </Suspense>
  );
}

function WarehouseReturnsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ReturnPackage[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [receiveWarehouseId, setReceiveWarehouseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderSearchResults, setOrderSearchResults] = useState<SearchOrder[]>([]);
  const [orderSearchLoading, setOrderSearchLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SearchOrder | null>(null);
  const [ordersById, setOrdersById] = useState<Record<string, SearchOrder>>({});
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [itemQtyDrafts, setItemQtyDrafts] = useState<Record<string, string>>({});
  const [dispositionDrafts, setDispositionDrafts] = useState<
    Record<string, "RESTOCK" | "QUARANTINE" | "WRITE_OFF">
  >({});
  const [orderModalId, setOrderModalId] = useState<string | null>(null);
  const [showExtraOrderSearch, setShowExtraOrderSearch] = useState(false);

  const selected = useMemo(
    () => items.find((p) => p.id === selectedId) ?? null,
    [items, selectedId],
  );

  const misPickReturnItems = useMemo(() => {
    if (!selected) return [];
    return selected.returns.flatMap((ret) =>
      ret.reason === "WRONG_ITEM"
        ? ret.items.map((it) => ({ ...it, returnId: ret.id, orderNumber: ret.order.orderNumber }))
        : [],
    );
  }, [selected]);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const filterIds =
        selectedWarehouseIds.length > 0 && selectedWarehouseIds.length < warehouses.length
          ? selectedWarehouseIds
          : undefined;
      const data = await returnPackagesApi.listWarehouseQueue(filterIds);
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
  }, [selectedWarehouseIds, warehouses.length]);

  useEffect(() => {
    void listWarehouses()
      .then((list) => {
        setWarehouses(list);
        const allIds = list.map((w) => w.id);
        const fromUrl = parseWarehouseIdsParam(searchParams);
        if (fromUrl !== null) {
          setSelectedWarehouseIds(fromUrl.filter((id) => allIds.includes(id)));
          return;
        }
        const stored = loadStoredWarehouseIds();
        if (stored && stored.length > 0) {
          setSelectedWarehouseIds(stored.filter((id) => allIds.includes(id)));
        } else {
          setSelectedWarehouseIds(allIds);
        }
      })
      .catch(() => setWarehouses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init from URL once on mount
  }, []);

  useEffect(() => {
    if (warehouses.length === 0) return;
    const allIds = warehouses.map((w) => w.id);
    const params = new URLSearchParams(searchParams.toString());
    const warehousesParam = buildWarehousesParam(selectedWarehouseIds, allIds);
    if (warehousesParam === null) params.delete("warehouses");
    else params.set("warehouses", warehousesParam);
    const q = params.toString();
    const next = q ? `${pathname}?${q}` : pathname;
    const current = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    if (next !== current) router.replace(next, { scroll: false });
  }, [pathname, router, searchParams, selectedWarehouseIds, warehouses]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  /** Prefill qty drafts + auto-load order lines for linked returns that need breakdown. */
  useEffect(() => {
    if (!selected || selected.status !== "RECEIVED_BY_WAREHOUSE") {
      setOrdersById({});
      setItemQtyDrafts({});
      setSelectedOrder(null);
      setShowExtraOrderSearch(false);
      return;
    }

    const drafts: Record<string, string> = {};
    for (const ret of selected.returns) {
      if (ret.items.length > 0) {
        for (const it of ret.items) {
          drafts[draftKey(ret.orderId, it.orderItemId)] = String(it.qtyReturned);
        }
      }
    }
    setItemQtyDrafts(drafts);
    setSelectedOrder(null);
    setShowExtraOrderSearch(selected.returns.length === 0);

    const needFetch = selected.returns.filter(needsBreakdown).map((r) => r.orderId);
    const uniqueIds = Array.from(new Set(needFetch));
    if (uniqueIds.length === 0) {
      setOrdersById({});
      return;
    }

    let cancelled = false;
    setOrdersLoading(true);
    void (async () => {
      const next: Record<string, SearchOrder> = {};
      const nextDrafts: Record<string, string> = { ...drafts };
      await Promise.all(
        uniqueIds.map(async (orderId) => {
          try {
            const res = await apiHttp.get<SearchOrder>(`/orders/${orderId}`);
            const order = res.data;
            if (!order) return;
            next[orderId] = order;
            for (const line of order.items ?? []) {
              const key = draftKey(orderId, line.id);
              if (nextDrafts[key] === undefined) {
                nextDrafts[key] = String(line.qty);
              }
            }
          } catch {
            /* leave missing; UI shows retry via search */
          }
        }),
      );
      if (cancelled) return;
      setOrdersById(next);
      setItemQtyDrafts(nextDrafts);
      setOrdersLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (!selectedOrder?.items?.length) return;
    setItemQtyDrafts((prev) => {
      const next = { ...prev };
      for (const it of selectedOrder.items ?? []) {
        const key = draftKey(selectedOrder.id, it.id);
        if (next[key] === undefined) next[key] = String(it.qty);
      }
      return next;
    });
  }, [selectedOrder]);

  useEffect(() => {
    if (!selected) {
      setDispositionDrafts({});
      setReceiveWarehouseId("");
      return;
    }
    setReceiveWarehouseId(
      selected.warehouseId ??
        selected.returns.find((r) => r.warehouseId)?.warehouseId ??
        "",
    );
    const drafts: Record<string, "RESTOCK" | "QUARANTINE" | "WRITE_OFF"> = {};
    for (const it of misPickReturnItems) {
      if (it.disposition && it.disposition !== "PENDING") {
        drafts[it.id] = it.disposition as "RESTOCK" | "QUARANTINE" | "WRITE_OFF";
      }
    }
    setDispositionDrafts(drafts);
  }, [selected, misPickReturnItems]);

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
      setShowExtraOrderSearch(false);
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
      () =>
        returnPackagesApi.receive(selected.id, {
          warehouseId: receiveWarehouseId || undefined,
        }),
      "Посилку позначено як прийняту — перевірте склад позицій",
    );
  };

  const buildItemsPayload = (
    orderId: string,
    lines: OrderLine[],
    existingByOrderItemId?: Map<string, number>,
  ) => {
    const payload: Array<{ orderItemId: string; qtyReturned: number }> = [];
    for (const line of lines) {
      const key = draftKey(orderId, line.id);
      const draftQty = Math.max(0, Math.min(line.qty, Number(itemQtyDrafts[key]) || 0));
      const existing = existingByOrderItemId?.get(line.id) ?? 0;
      if (existingByOrderItemId) {
        if (draftQty < existing) {
          throw new Error(
            "Не можна зменшити вже зафіксовану кількість через розбір — зверніться до менеджера",
          );
        }
        const delta = draftQty - existing;
        if (delta > 0) payload.push({ orderItemId: line.id, qtyReturned: delta });
      } else if (draftQty > 0) {
        payload.push({ orderItemId: line.id, qtyReturned: draftQty });
      }
    }
    return payload;
  };

  const handleSaveReturnItems = (ret: ReturnPackageLinkedReturn) => {
    if (!selected) return;
    const order = ordersById[ret.orderId];
    const lines = order?.items ?? [];
    if (needsBreakdown(ret)) {
      if (lines.length === 0) {
        setErr("Не вдалося завантажити позиції замовлення — скористайтесь пошуком");
        return;
      }
      try {
        const itemsPayload = buildItemsPayload(ret.orderId, lines);
        if (itemsPayload.length === 0) {
          setErr("Оберіть кількість хоча б по одній позиції");
          return;
        }
        void runAction(
          () =>
            returnPackagesApi.addItems(selected.id, {
              orderId: ret.orderId,
              items: itemsPayload,
            }),
          `Позиції збережено для замовлення ${ret.order.orderNumber}`,
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Помилка збереження");
      }
      return;
    }

    // Already has items — only send positive deltas
    const existing = new Map(ret.items.map((it) => [it.orderItemId, it.qtyReturned]));
    const maxByItem = new Map<string, number>();
    for (const it of ret.items) {
      maxByItem.set(it.orderItemId, it.orderItem?.qty ?? it.qtyReturned);
    }
    const linesFromReturn: OrderLine[] = ret.items.map((it) => ({
      id: it.orderItemId,
      qty: maxByItem.get(it.orderItemId) ?? it.qtyReturned,
      productNameSnapshot: it.orderItem?.productNameSnapshot,
      product: it.orderItem?.product,
    }));
    try {
      const itemsPayload = buildItemsPayload(ret.orderId, linesFromReturn, existing);
      if (itemsPayload.length === 0) {
        setInfo(`Позиції замовлення ${ret.order.orderNumber} без змін`);
        return;
      }
      void runAction(
        () =>
          returnPackagesApi.addItems(selected.id, {
            orderId: ret.orderId,
            items: itemsPayload,
          }),
        `Кількість оновлено для замовлення ${ret.order.orderNumber}`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка збереження");
    }
  };

  const handleAddItemsFromSearch = () => {
    if (!selected || !selectedOrder) return;
    const lines = selectedOrder.items ?? [];
    try {
      const linked = selected.returns.find(
        (r) => r.orderId === selectedOrder.id && r.status !== "CLOSED",
      );
      const existing = linked
        ? new Map(linked.items.map((it) => [it.orderItemId, it.qtyReturned]))
        : undefined;
      const itemsPayload = buildItemsPayload(selectedOrder.id, lines, existing);
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка збереження");
    }
  };

  const handleSaveDispositions = () => {
    if (!selected) return;
    const dispositionItems = misPickReturnItems
      .map((it) => ({
        returnItemId: it.id,
        disposition: dispositionDrafts[it.id],
      }))
      .filter((x): x is { returnItemId: string; disposition: "RESTOCK" | "QUARANTINE" | "WRITE_OFF" } =>
        Boolean(x.disposition),
      );
    if (dispositionItems.length === 0) {
      setErr("Оберіть дію для хоча б однієї позиції пересорту");
      return;
    }
    void runAction(
      () => returnPackagesApi.updateDispositions(selected.id, { items: dispositionItems }),
      "Дії по пересорту збережено",
    );
  };

  const handleCompleteInspection = () => {
    if (!selected) return;
    void runAction(
      () => returnPackagesApi.completeInspection(selected.id),
      "Розбір завершено — повернення закрито",
    );
  };

  const stepStates = useMemo(() => {
    if (!selected) {
      return { receive: "todo" as const, unpack: "todo" as const, done: "todo" as const };
    }
    if (selected.status === "IN_TRANSIT_BACK") {
      return { receive: "active" as const, unpack: "todo" as const, done: "todo" as const };
    }
    const unpackNeeded = packageNeedsBreakdown(selected);
    if (unpackNeeded) {
      return { receive: "done" as const, unpack: "active" as const, done: "todo" as const };
    }
    return { receive: "done" as const, unpack: "done" as const, done: "active" as const };
  }, [selected]);

  const renderChecklistLines = (
    orderId: string,
    lines: Array<{
      orderItemId: string;
      name: string;
      maxQty: number;
      recordedQty?: number;
    }>,
  ) => (
    <div className="max-h-56 space-y-2 overflow-y-auto">
      {lines.map((line) => {
        const key = draftKey(orderId, line.orderItemId);
        return (
          <div
            key={line.orderItemId}
            className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm"
          >
            <div className="min-w-0 flex-1">
              <span className="block truncate text-zinc-800">{line.name}</span>
              <span className="text-[11px] text-zinc-500">
                {line.recordedQty != null
                  ? `Зафіксовано ${line.recordedQty} · макс. ${line.maxQty}`
                  : `У замовленні ${line.maxQty} од.`}
              </span>
            </div>
            <label className="shrink-0 text-right text-[11px] text-zinc-500">
              Факт
              <input
                type="number"
                min={0}
                max={line.maxQty}
                value={itemQtyDrafts[key] ?? "0"}
                onChange={(e) =>
                  setItemQtyDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                }
                className="mt-0.5 block w-16 rounded border border-zinc-300 px-2 py-0.5 text-right text-sm text-zinc-900"
              />
            </label>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Повернення на склад</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Вхідні посилки з ТТН: прийом, розбір по замовленнях, закриття повернення.
          </p>
        </div>
        <HelpHint routeKey="work.warehouse.returns" />
      </div>

      {warehouses.length > 1 ? (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-xs font-medium text-zinc-600">{strings.returns.returnWarehouseLabel}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {warehouses.map((w) => {
              const checked = selectedWarehouseIds.includes(w.id);
              return (
                <label
                  key={w.id}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelectedWarehouseIds((prev) => {
                        const next = checked
                          ? prev.filter((id) => id !== w.id)
                          : [...prev, w.id];
                        saveStoredWarehouseIds(next);
                        return next;
                      });
                    }}
                  />
                  {w.name}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

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
          {items.map((pkg) => {
            const awaiting = packageNeedsBreakdown(pkg);
            return (
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
                    {awaiting ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                        Очікує розбору
                      </span>
                    ) : null}
                    {pkg.warehouse?.name ? (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
                        {pkg.warehouse.name}
                      </span>
                    ) : null}
                    <TtnStatusBadge
                      statusCode={pkg.ttnStatusCode}
                      statusText={pkg.ttnStatusText}
                    />
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">{clientLabel(pkg)}</div>
                  <div className="mt-1 text-xs text-zinc-500">{linkedOrdersLabel(pkg.returns)}</div>
                </div>
              </button>
            );
          })}
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
                <StepPill n={1} label="Прийом" state={stepStates.receive} />
                <span className="text-zinc-300">→</span>
                <StepPill n={2} label="Розбір позицій" state={stepStates.unpack} />
                <span className="text-zinc-300">→</span>
                <StepPill n={3} label="Закрити" state={stepStates.done} />
              </div>

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

              {selected.status === "IN_TRANSIT_BACK" ? (
                <label className="block text-sm text-zinc-700">
                  {strings.returns.returnWarehouseLabel}
                  <select
                    value={receiveWarehouseId}
                    onChange={(e) => setReceiveWarehouseId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  >
                    <option value="">{strings.orders.modal.notSpecified}</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : selected.warehouse?.name ? (
                <p className="text-sm text-zinc-600">
                  {strings.returns.returnWarehouseLabel}: {selected.warehouse.name}
                </p>
              ) : null}

              {selected.status === "RECEIVED_BY_WAREHOUSE" && packageNeedsBreakdown(selected) ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Очікує розбору: зазначте фактичні позиції з посилки, збережіть і натисніть «Розбір
                  завершено» — повернення буде закрито.
                </div>
              ) : null}

              {selected.returns.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-zinc-800">Розбір по замовленнях</h3>
                  {ordersLoading ? (
                    <p className="text-xs text-zinc-500">Завантаження позицій замовлень…</p>
                  ) : null}
                  {selected.returns.map((ret) => {
                    const pending = needsBreakdown(ret);
                    const order = ordersById[ret.orderId];
                    return (
                      <div
                        key={ret.id}
                        className={`rounded-lg border px-3 py-3 text-sm ${
                          pending
                            ? "border-amber-200 bg-amber-50/40"
                            : "border-zinc-200 bg-zinc-50"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="font-medium text-zinc-900 hover:underline"
                            onClick={() => setOrderModalId(ret.orderId)}
                          >
                            Замовлення {ret.order.orderNumber}
                          </button>
                          {ret.reason === "WRONG_ITEM" ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                              {strings.returns.misPickBadge}
                            </span>
                          ) : ret.reason ? (
                            <span className="text-[10px] text-zinc-500">
                              {returnReasonLabel(ret.reason)}
                            </span>
                          ) : null}
                          {pending ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                              Очікує розбору позицій
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500">
                              {ret.items.length} поз. ·{" "}
                              {ret.items.reduce((s, i) => s + i.qtyReturned, 0)} од.
                            </span>
                          )}
                        </div>

                        {selected.status === "RECEIVED_BY_WAREHOUSE" ? (
                          <div className="mt-3 space-y-2">
                            {pending ? (
                              order?.items?.length ? (
                                <>
                                  {renderChecklistLines(
                                    ret.orderId,
                                    order.items.map((line) => ({
                                      orderItemId: line.id,
                                      name: lineName(line),
                                      maxQty: line.qty,
                                    })),
                                  )}
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => handleSaveReturnItems(ret)}
                                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                                  >
                                    Зберегти позиції
                                  </button>
                                </>
                              ) : (
                                <p className="text-xs text-amber-800">
                                  Позиції замовлення не завантажились. Додайте через пошук нижче.
                                </p>
                              )
                            ) : (
                              <>
                                {renderChecklistLines(
                                  ret.orderId,
                                  ret.items.map((it) => ({
                                    orderItemId: it.orderItemId,
                                    name: returnItemName(it),
                                    maxQty: it.orderItem?.qty ?? it.qtyReturned,
                                    recordedQty: it.qtyReturned,
                                  })),
                                )}
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => handleSaveReturnItems(ret)}
                                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white disabled:opacity-50"
                                >
                                  Оновити кількість
                                </button>
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-amber-700">
                  Посилка без привʼязаних замовлень — знайдіть замовлення нижче.
                </p>
              )}

              {selected.status === "RECEIVED_BY_WAREHOUSE" ? (
                <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
                  {selected.returns.length > 0 && !showExtraOrderSearch ? (
                    <button
                      type="button"
                      onClick={() => setShowExtraOrderSearch(true)}
                      className="text-xs font-medium text-zinc-700 underline"
                    >
                      Додати позиції з іншого замовлення
                    </button>
                  ) : (
                    <>
                      <h3 className="text-sm font-medium text-zinc-800">
                        {selected.returns.length === 0
                          ? "Знайти замовлення"
                          : "Додати з іншого замовлення"}
                      </h3>
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
                                void apiHttp
                                  .get<SearchOrder>(`/orders/${o.id}`)
                                  .then((res) => {
                                    if (res.data) setSelectedOrder(res.data);
                                  })
                                  .catch(() => undefined);
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
                        <>
                          {renderChecklistLines(
                            selectedOrder.id,
                            selectedOrder.items.map((line) => ({
                              orderItemId: line.id,
                              name: lineName(line),
                              maxQty: line.qty,
                            })),
                          )}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={handleAddItemsFromSearch}
                            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                          >
                            Додати позиції
                          </button>
                        </>
                      ) : null}
                    </>
                  )}

                  {misPickReturnItems.length > 0 ? (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                      <h3 className="text-sm font-medium text-zinc-800">
                        {strings.returns.misPickBadge}
                      </h3>
                      {misPickReturnItems.map((it) => {
                        const expected =
                          it.orderItem?.productNameSnapshot ??
                          it.orderItem?.product?.name ??
                          "—";
                        const actual =
                          it.actualProduct?.name ?? it.actualProduct?.sku ?? "—";
                        return (
                          <div
                            key={it.id}
                            className="rounded border border-zinc-200 bg-white px-2 py-2 text-sm"
                          >
                            <div className="text-xs text-zinc-500">
                              {it.orderNumber} · {it.qtyReturned} од.
                            </div>
                            <div className="mt-1 grid gap-1 sm:grid-cols-2">
                              <div>
                                <span className="text-[11px] text-zinc-500">
                                  {strings.returns.expectedProduct}:{" "}
                                </span>
                                <span className="text-zinc-800">{expected}</span>
                              </div>
                              <div>
                                <span className="text-[11px] text-zinc-500">
                                  {strings.returns.actualProduct}:{" "}
                                </span>
                                <span className="text-zinc-800">{actual}</span>
                              </div>
                            </div>
                            <label className="mt-2 block text-xs text-zinc-600">
                              {dispositionLabel(dispositionDrafts[it.id] ?? "PENDING")}
                              <select
                                value={dispositionDrafts[it.id] ?? ""}
                                onChange={(e) =>
                                  setDispositionDrafts((prev) => ({
                                    ...prev,
                                    [it.id]: e.target.value as
                                      | "RESTOCK"
                                      | "QUARANTINE"
                                      | "WRITE_OFF",
                                  }))
                                }
                                className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
                              >
                                <option value="">{strings.returns.dispositionPending}</option>
                                {DISPOSITION_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={handleSaveDispositions}
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Зберегти дії по пересорту
                      </button>
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
              {selected.status === "RECEIVED_BY_WAREHOUSE" ? (
                <button
                  type="button"
                  disabled={actionLoading || packageNeedsBreakdown(selected)}
                  onClick={handleCompleteInspection}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  title={
                    packageNeedsBreakdown(selected)
                      ? "Спочатку збережіть позиції по всіх замовленнях"
                      : undefined
                  }
                >
                  Розбір завершено / Закрити
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
