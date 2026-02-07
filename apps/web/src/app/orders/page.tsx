"use client";

import { useEffect, useState, useCallback } from "react";
// Импортируем наши модалки (проверь пути!)
import { OrderModal } from "./OrderModal";
import { CreateOrderModal } from "./CreateOrderModal";
import { OrdersKanban } from "./OrdersKanban";


// Тип для списка (упрощенный, совпадает с тем что отдает бэкенд listOrders)
type OrderSummary = {
  id: string;
  orderNumber: string;
  companyId: string | null;
  clientId: string | null;
  // В списке бэкенд может не возвращать развернутые объекты company/client, 
  // но если возвращает — добавь типы. 
  // Обычно для списка нужно делать отдельные join-ы на бэкенде или маппинг.
  // Для простоты предположим, что мы пока показываем ID или доработаем бэкенд позже.
  // Но судя по твоему OrdersService.listOrders, он возвращает плоскую структуру.
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  itemsCount: number;
};

// Тип ответа от API списка
type OrdersListResponse = {
  items: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
};

type OrdersView = "list" | "kanban";


export default function OrdersPage() {
  const API_URL = "/api";
 // Замени на свой URL API

  // --- State ---
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination (базовая)
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [view, setView] = useState<OrdersView>("list");
  // Modals State
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // --- Fetch Orders ---
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders?page=${page}&pageSize=${pageSize}`);
      if (!res.ok) throw new Error("Failed to fetch orders");
      const data: OrdersListResponse = await res.json();
      setOrders(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading orders");
    } finally {
      setLoading(false);
    }
  }, [API_URL, page, pageSize]);

  // Загружаем при старте и смене страницы
  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  // --- Handlers ---

  const handleOrderCreated = (newOrderId: string) => {
    // 1. Обновляем список, чтобы новый заказ появился
    void fetchOrders();
    // 2. Сразу открываем его на редактирование
    setSelectedOrderId(newOrderId);
  };

  const handleCloseEdit = () => {
    setSelectedOrderId(null);
    // При закрытии редактирования тоже обновляем список (вдруг поменялась сумма или статус)
    void fetchOrders();
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
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
        view === "list"
          ? "bg-zinc-900 text-white"
          : "text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      List
    </button>
    <button
      type="button"
      onClick={() => setView("kanban")}
      className={`rounded px-3 py-1 text-sm ${
        view === "kanban"
          ? "bg-zinc-900 text-white"
          : "text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      Kanban
    </button>
  </div>

  <button
    onClick={() => setShowCreateModal(true)}
    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors shadow-sm"
  >
    + New Order
  </button>
</div>

        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-600 border border-red-100">
            {error}
          </div>
        )}

        {/* Table */}
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
              onClick={() => setSelectedOrderId(order.id)}
              className="cursor-pointer hover:bg-zinc-50 transition-colors"
            >
              <td className="px-6 py-4 font-medium text-zinc-900">{order.orderNumber}</td>
              <td className="px-6 py-4 text-zinc-500">
                {new Date(order.createdAt).toLocaleDateString()}
              </td>
              <td className="px-6 py-4">
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800 border border-zinc-200">
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

    <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 bg-zinc-50">
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
  <OrdersKanban onOpenOrder={(id) => setSelectedOrderId(id)} />
)}

      </div>

      {/* --- MODALS --- */}

      {/* 1. Create Order Modal */}
      {showCreateModal && (
        <CreateOrderModal
          apiBaseUrl="/api"
          onClose={() => setShowCreateModal(false)}
          onOrderCreated={handleOrderCreated}
        />
      )}

      {/* 2. Edit Order Modal */}
      {selectedOrderId && (
        <OrderModal
          apiBaseUrl="/api"
          orderId={selectedOrderId}
          onClose={handleCloseEdit}
          // Если нужно открывать карточки компании/контакта из заказа:
          onOpenCompany={(id) => console.log("Open company", id)} 
          onOpenContact={(id) => console.log("Open contact", id)}
        />
      )}
    </div>
  );
}