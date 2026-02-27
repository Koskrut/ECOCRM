"use client";

import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
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
  createdAt: string;
  itemsCount: number;
};

type OrdersListResponse = {
  items: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
};

type OrdersView = "list" | "kanban";

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

export default function OrdersPage() {
  // ВАЖНО: apiHttp уже работает с baseURL="/api"
  // А OrderModal всё ещё принимает apiBaseUrl, поэтому оставляем "/api" только для него.
  const apiBaseUrl = "/api";

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [view, setView] = useState<OrdersView>("list");

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await apiHttp.get<OrdersListResponse>("/orders", {
        params: { page, pageSize },
      });

      setOrders(res.data?.items || []);
    } catch (err) {
      setError(getErrMessage(err, "Error loading orders"));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

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
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Orders</h1>
            <p className="text-sm text-zinc-500">Manage your sales orders</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-md border border-zinc-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setView("list")}
                className={`rounded px-3 py-1 text-sm ${
                  view === "list" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setView("kanban")}
                className={`rounded px-3 py-1 text-sm ${
                  view === "kanban" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                Kanban
              </button>
            </div>

            <button
              type="button"
              onClick={() => void openNewOrder()}
              disabled={creating}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-60"
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

        {view === "list" ? (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="px-6 py-3">Order #</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Items</th>
                  <th className="px-6 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                      Loading orders...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
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
                        <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800">
                          {order.status}
                        </span>
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
        ) : (
          <OrdersKanban onOpenOrder={(id) => openExistingOrder(id)} />
        )}
      </div>

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
