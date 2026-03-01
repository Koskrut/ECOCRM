"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiHttp } from "@/lib/api/client";
import { StatusBadge } from "@/components/StatusBadge";
import { OrderCard } from "./OrderCard";
import { OrderModal } from "./OrderModal";
import { OrdersKanban } from "./OrdersKanban";

type OrderSummary = {
  id: string;
  orderNumber: string;
  companyId: string | null;
  clientId: string | null;
  status: string;
  totalAmount: number;
  currency: string;
  paymentType?: string | null;
  createdAt: string;
  itemsCount: number;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string } | null;
};

type OrdersListResponse = {
  items: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
};

type OrdersView = "list" | "kanban";

const ORDER_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Усі стадії" },
  { value: "NEW", label: "NEW" },
  { value: "IN_WORK", label: "IN_WORK" },
  { value: "READY_TO_SHIP", label: "READY_TO_SHIP" },
  { value: "SHIPPED", label: "SHIPPED" },
  { value: "CONTROL_PAYMENT", label: "CONTROL_PAYMENT" },
  { value: "SUCCESS", label: "SUCCESS" },
  { value: "RETURNING", label: "RETURNING" },
  { value: "CANCELED", label: "CANCELED" },
];

function getErrMessage(e: unknown, fallback: string) {
  const anyErr = e as {
    response?: { data?: { message?: string; error?: string } };
    message?: string;
  };

  return (
    anyErr?.response?.data?.message ||
    anyErr?.response?.data?.error ||
    (e instanceof Error ? e.message : fallback)
  );
}

function OrdersPageContent() {
  const searchParams = useSearchParams();
  const orderIdFromUrl = searchParams.get("orderId");

  // ВАЖНО: apiHttp уже работает с baseURL="/api"
  const apiBaseUrl = "/api";

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [view, setView] = useState<OrdersView>("list");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (orderIdFromUrl) {
      setActiveOrderId(orderIdFromUrl);
      setOrderModalOpen(true);
    }
  }, [orderIdFromUrl]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params: Record<string, string | number | boolean> = {
        page,
        pageSize,
        withCompanyClient: true,
      };
      if (statusFilter) params.status = statusFilter;

      const res = await apiHttp.get<OrdersListResponse>("/orders", { params });

      setOrders(res.data?.items || []);
      setTotal(res.data?.total ?? 0);
    } catch (err) {
      setError(getErrMessage(err, "Error loading orders"));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const openExistingOrder = (id: string) => {
    setActiveOrderId(id);
    setOrderModalOpen(true);
  };

  const openNewOrder = async () => {
    if (creating) return;

    setCreating(true);
    setError(null);

    try {
      const res = await apiHttp.post<{ id: string }>("/orders", {
        companyId: null,
        clientId: null,
        deliveryMethod: "PICKUP",
        comment: null,
        discountAmount: 0,
      });

      const created = res.data;
      if (!created?.id) throw new Error("Order created, but id missing");

      setActiveOrderId(created.id);
      setOrderModalOpen(true);

      void fetchOrders();
    } catch (e) {
      setError(getErrMessage(e, "Failed to create order"));
    } finally {
      setCreating(false);
    }
  };

  const closeOrderModal = () => {
    setOrderModalOpen(false);
    setActiveOrderId(null);
    void fetchOrders();
    if (orderIdFromUrl) {
      window.history.replaceState({}, "", "/orders");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Orders</h1>
            <p className="text-sm text-zinc-500">Manage your sales orders</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setView("list")}
                className={`rounded-md px-3 py-1 text-sm ${
                  view === "list" ? "bg-accent-gradient text-white" : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setView("kanban")}
                className={`rounded-md px-3 py-1 text-sm ${
                  view === "kanban" ? "bg-accent-gradient text-white" : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                Kanban
              </button>
            </div>

            <button
              type="button"
              onClick={() => void openNewOrder()}
              disabled={creating}
              className="btn-primary hidden md:inline-flex"
            >
              {creating ? "Creating…" : "+ New Order"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Status filter (reference: pipeline / stage selector) */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label htmlFor="order-status-filter" className="text-sm font-medium text-zinc-700">
            Статус
          </label>
          <select
            id="order-status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          >
            {ORDER_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || "_all"} value={opt.value}>
                {opt.value ? opt.label : "Усі стадії"}
              </option>
            ))}
          </select>
          <span className="text-sm text-zinc-500">
            {statusFilter ? `${total} заказів` : `Усі стадії (${total})`}
          </span>
        </div>

        {view === "list" ? (
          <>
            {/* Desktop: table */}
            <div className="hidden md:block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100/80 text-xs font-medium uppercase text-zinc-500">
                  <tr>
                    <th className="px-6 py-3">Order #</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Payment</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Items</th>
                    <th className="px-6 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                        Loading orders...
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                        No orders found. Create one!
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => openExistingOrder(order.id)}
                        className="cursor-pointer transition-colors hover:bg-zinc-50"
                      >
                        <td className="px-6 py-4 font-medium text-zinc-900">{order.orderNumber}</td>
                        <td className="px-6 py-4 text-zinc-500">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          {order.paymentType ? (
                            <span
                              className={
                                order.paymentType === "PREPAYMENT"
                                  ? "inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
                                  : "inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                              }
                            >
                              {order.paymentType === "PREPAYMENT" ? "Предоплата" : "Отсрочка"}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge variant="order" status={order.status} />
                        </td>
                        <td className="px-6 py-4 text-right text-zinc-500">{order.itemsCount}</td>
                        <td className="px-6 py-4 text-right font-medium text-zinc-900">
                          {order.totalAmount.toFixed(2)} {order.currency}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-6 py-4">
                <span className="text-xs text-zinc-500">Page {page}</span>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    disabled={orders.length < pageSize || loading}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile: card list */}
            <div className="md:hidden space-y-4">
              {loading ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
                  Loading orders...
                </div>
              ) : orders.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
                  No orders found. Create one!
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {orders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onOpen={openExistingOrder}
                        onOpenContact={undefined}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-200 bg-transparent px-2 py-4">
                    <span className="text-xs text-zinc-500">Page {page}</span>
                    <div className="flex gap-2">
                      <button
                        disabled={page === 1 || loading}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <button
                        disabled={orders.length < pageSize || loading}
                        onClick={() => setPage((p) => p + 1)}
                        className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <OrdersKanban onOpenOrder={(id) => openExistingOrder(id)} />
        )}
      </div>

      {/* Mobile FAB */}
      <button
        type="button"
        onClick={() => void openNewOrder()}
        disabled={creating}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-lg transition-opacity hover:bg-accent-600 disabled:opacity-50 md:hidden"
        aria-label="New order"
      >
        <span className="text-2xl leading-none">+</span>
      </button>

      {orderModalOpen && activeOrderId && (
        <OrderModal
          apiBaseUrl={apiBaseUrl}
          orderId={activeOrderId}
          onClose={closeOrderModal}
          onSaved={() => void fetchOrders()}
          onOpenCompany={(id) => console.log("Open company", id)}
          onOpenContact={(id) => console.log("Open contact", id)}
        />
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading…</div>}>
      <OrdersPageContent />
    </Suspense>
  );
}
