"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Filter, Search, Truck } from "lucide-react";
import { apiHttp } from "@/lib/api/client";
import { StatusBadge } from "@/components/StatusBadge";
import { OrderCard } from "./OrderCard";
import { OrderModal } from "./OrderModal";
import { OrdersKanban } from "./OrdersKanban";
import {
  OrdersFiltersPopover,
  type HasTtnFilter,
  type OrderSortBy,
  type OrderSortDir,
  type OrdersFiltersState,
  type OwnerOption,
} from "./OrdersFiltersPopover";

type OrderSummary = {
  id: string;
  orderNumber: string;
  ownerId?: string | null;
  owner?: { id: string; fullName: string; email?: string | null } | null;
  companyId: string | null;
  clientId: string | null;
  status: string;
  totalAmount: number;
  paidAmount?: number;
  debtAmount?: number;
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID";
  isPaid?: boolean;
  hasTtn?: boolean;
  currency: string;
  paymentType?: "PREPAYMENT" | "DEFERRED" | null;
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

const DEFAULT_PAGE_SIZE = 50;

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const orderIdFromUrl = searchParams.get("orderId");

  // ВАЖНО: apiHttp уже работает с baseURL="/api"
  const apiBaseUrl = "/api";

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState<number>(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [view, setView] = useState<OrdersView>(() =>
    searchParams.get("view") === "kanban" ? "kanban" : "list",
  );
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get("status") ?? "");
  const [ownerIdFilter, setOwnerIdFilter] = useState<string>(() => searchParams.get("ownerId") ?? "");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>(
    () => searchParams.get("paymentType") ?? "",
  );
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>(
    () => searchParams.get("paymentStatus") ?? "",
  );
  const [hasTtnFilter, setHasTtnFilter] = useState<HasTtnFilter>(() => {
    const raw = searchParams.get("hasTtn");
    if (raw === "true" || raw === "false") return raw;
    return "";
  });
  const [amountFrom, setAmountFrom] = useState<string>(() => searchParams.get("amountFrom") ?? "");
  const [amountTo, setAmountTo] = useState<string>(() => searchParams.get("amountTo") ?? "");
  const [q, setQ] = useState<string>(() => searchParams.get("q") ?? "");
  const [qInput, setQInput] = useState<string>(() => searchParams.get("q") ?? "");
  const [dateFrom, setDateFrom] = useState<string>(() => searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState<string>(() => searchParams.get("dateTo") ?? "");
  const [sortBy, setSortBy] = useState<OrderSortBy>(
    () => (searchParams.get("sortBy") as OrderSortBy) || "createdAt",
  );
  const [sortDir, setSortDir] = useState<OrderSortDir>(() =>
    searchParams.get("sortDir") === "asc" ? "asc" : "desc",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [appendOnNextFetch, setAppendOnNextFetch] = useState(false);

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);
  const canLoadMore = page < totalPages;

  useEffect(() => {
    const params = new URLSearchParams();
    if (orderIdFromUrl) params.set("orderId", orderIdFromUrl);
    if (view !== "list") params.set("view", view);
    if (page > 1) params.set("page", String(page));
    if (statusFilter) params.set("status", statusFilter);
    if (ownerIdFilter) params.set("ownerId", ownerIdFilter);
    if (amountFrom) params.set("amountFrom", amountFrom);
    if (amountTo) params.set("amountTo", amountTo);
    if (paymentTypeFilter) params.set("paymentType", paymentTypeFilter);
    if (paymentStatusFilter) params.set("paymentStatus", paymentStatusFilter);
    if (hasTtnFilter) params.set("hasTtn", hasTtnFilter);
    if (q) params.set("q", q);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (sortBy !== "createdAt") params.set("sortBy", sortBy);
    if (sortDir !== "desc") params.set("sortDir", sortDir);

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    }
  }, [
    dateFrom,
    dateTo,
    hasTtnFilter,
    amountFrom,
    amountTo,
    orderIdFromUrl,
    ownerIdFilter,
    page,
    pathname,
    paymentStatusFilter,
    paymentTypeFilter,
    q,
    router,
    searchParams,
    sortBy,
    sortDir,
    statusFilter,
    view,
  ]);

  useEffect(() => {
    if (orderIdFromUrl) {
      setActiveOrderId(orderIdFromUrl);
      setOrderModalOpen(true);
    }
  }, [orderIdFromUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = qInput.trim();
      setAppendOnNextFetch(false);
      setPage(1);
      setQ((prev) => (prev === nextQ ? prev : nextQ));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    let cancelled = false;

    const loadOwners = async () => {
      try {
        const res = await apiHttp.get<{ items?: Array<{ id: string; fullName?: string }> }>("/users");
        if (cancelled) return;
        const items = res.data?.items ?? [];
        setOwners(
          items
            .filter((x) => Boolean(x?.id))
            .map((x) => ({ id: x.id, fullName: x.fullName?.trim() || "Без имени" })),
        );
      } catch {
        if (!cancelled) setOwners([]);
      }
    };

    void loadOwners();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((res) => setUserRole(res.data?.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

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
      if (ownerIdFilter) params.ownerId = ownerIdFilter;
      if (paymentTypeFilter) params.paymentType = paymentTypeFilter;
      if (paymentStatusFilter) params.paymentStatus = paymentStatusFilter;
      if (hasTtnFilter) params.hasTtn = hasTtnFilter;
      if (amountFrom) params.amountFrom = amountFrom;
      if (amountTo) params.amountTo = amountTo;
      if (q.trim()) params.q = q.trim();
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      params.sortBy = sortBy;
      params.sortDir = sortDir;

      const res = await apiHttp.get<OrdersListResponse>("/orders", { params });

      const nextItems = res.data?.items || [];
      setOrders((prev) => {
        if (!appendOnNextFetch) return nextItems;
        const merged = [...prev];
        const seen = new Set(merged.map((o) => o.id));
        for (const item of nextItems) {
          if (!seen.has(item.id)) {
            merged.push(item);
            seen.add(item.id);
          }
        }
        return merged;
      });
      setTotal(res.data?.total ?? 0);
    } catch (err) {
      setError(getErrMessage(err, "Error loading orders"));
      if (!appendOnNextFetch) setOrders([]);
    } finally {
      setAppendOnNextFetch(false);
      setLoading(false);
    }
  }, [
    appendOnNextFetch,
    amountFrom,
    amountTo,
    dateFrom,
    dateTo,
    hasTtnFilter,
    ownerIdFilter,
    page,
    pageSize,
    paymentStatusFilter,
    paymentTypeFilter,
    q,
    sortBy,
    sortDir,
    statusFilter,
  ]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const openExistingOrder = (id: string) => {
    setActiveOrderId(id);
    setOrderModalOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set("orderId", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
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
    const params = new URLSearchParams(searchParams.toString());
    params.delete("orderId");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  };

  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAppendOnNextFetch(false);
    setPage(1);
    setQ(qInput.trim());
  };

  const applyPopoverFilters = (next: OrdersFiltersState) => {
    setAppendOnNextFetch(false);
    setStatusFilter(next.status);
    setOwnerIdFilter(next.ownerId);
    setAmountFrom(next.amountFrom);
    setAmountTo(next.amountTo);
    setDateFrom(next.dateFrom);
    setDateTo(next.dateTo);
    setPaymentTypeFilter(next.paymentType);
    setPaymentStatusFilter(next.paymentStatus);
    setHasTtnFilter(next.hasTtn);
    setSortBy(next.sortBy);
    setSortDir(next.sortDir);
    setPage(1);
  };

  const resetAllFilters = () => {
    setAppendOnNextFetch(false);
    setStatusFilter("");
    setOwnerIdFilter("");
    setAmountFrom("");
    setAmountTo("");
    setDateFrom("");
    setDateTo("");
    setPaymentTypeFilter("");
    setPaymentStatusFilter("");
    setHasTtnFilter("");
    setSortBy("createdAt");
    setSortDir("desc");
    setQInput("");
    setQ("");
    setPage(1);
  };

  const filtersState: OrdersFiltersState = {
    status: statusFilter,
    ownerId: ownerIdFilter,
    amountFrom,
    amountTo,
    dateFrom,
    dateTo,
    paymentType: paymentTypeFilter,
    paymentStatus: paymentStatusFilter,
    hasTtn: hasTtnFilter,
    sortBy,
    sortDir,
  };

  const activeFiltersCount = [
    statusFilter,
    ownerIdFilter,
    amountFrom,
    amountTo,
    dateFrom,
    dateTo,
    paymentTypeFilter,
    paymentStatusFilter,
    hasTtnFilter,
  ].filter(Boolean).length;

  const getClientLabel = (order: OrderSummary) => {
    if (order.client) {
      const full = `${order.client.firstName ?? ""} ${order.client.lastName ?? ""}`.trim();
      return full || "—";
    }
    return order.company?.name ?? "—";
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-3 sm:p-4 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Заказы</h1>
            <p className="text-sm text-zinc-500">Список заказов по всем менеджерам</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void openNewOrder()}
              disabled={creating}
              className="btn-primary hidden sm:inline-flex"
            >
              {creating ? "Создание…" : "+ Новый заказ"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mb-4">
          <div className="relative">
            <form
              onSubmit={onSearchSubmit}
              className="flex items-center gap-2 rounded-xl p-2"
            >
              <div className="inline-flex shrink-0 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    view === "list" ? "bg-accent-gradient text-white" : "text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  Список
                </button>
                <button
                  type="button"
                  onClick={() => setView("kanban")}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    view === "kanban" ? "bg-accent-gradient text-white" : "text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  Kanban
                </button>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                <input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Поиск по номеру, клиенту, компании"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  type="search"
                  aria-label="Поиск заказов"
                />
                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className="flex shrink-0 items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700"
                  aria-label="Открыть фильтры"
                >
                  <Filter className="h-4 w-4" />
                </button>
              </div>
            </form>

            <OrdersFiltersPopover
              open={filtersOpen}
              value={filtersState}
              ownerOptions={owners}
              statusOptions={ORDER_STATUS_OPTIONS}
              onClose={() => setFiltersOpen(false)}
              onApply={applyPopoverFilters}
              onReset={resetAllFilters}
            />
          </div>
          <div className="mt-2 text-sm text-zinc-500">
            Всего: {total} | Страница {page} из {totalPages}
          </div>
        </div>

        {view === "list" ? (
          <>
            {/* Desktop + Tablet: table */}
            <div className="hidden sm:block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100/80 text-xs font-medium uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Заказ</th>
                    <th className="px-4 py-3 hidden xl:table-cell">Клиент/Компания</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Ответственный</th>
                    <th className="px-4 py-3">Дата</th>
                    <th className="px-4 py-3 hidden md:table-cell">Оплата</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3 text-right hidden lg:table-cell">Товары</th>
                    <th className="px-4 py-3 text-right">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-zinc-500">
                        Загрузка заказов...
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-zinc-500">
                        Заказы не найдены
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => openExistingOrder(order.id)}
                        className="cursor-pointer transition-colors hover:bg-zinc-50"
                      >
                        <td className="px-4 py-4">
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
                        </td>
                        <td className="px-4 py-4 hidden xl:table-cell text-zinc-700">
                          {getClientLabel(order)}
                        </td>
                        <td className="px-4 py-4 hidden lg:table-cell text-zinc-700">
                          {order.owner?.fullName || "—"}
                        </td>
                        <td className="px-4 py-4 text-zinc-500">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
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
                        <td className="px-4 py-4">
                          <StatusBadge variant="order" status={order.status} />
                        </td>
                        <td className="px-4 py-4 text-right text-zinc-500 hidden lg:table-cell">
                          {order.itemsCount}
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-zinc-900">
                          {order.totalAmount.toFixed(2)} {order.currency}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-4">
                <span className="text-xs text-zinc-500">
                  Страница {page} из {totalPages} • Всего {total}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1 || loading}
                    onClick={() => {
                      setAppendOnNextFetch(false);
                      setPage((p) => Math.max(1, p - 1));
                    }}
                    className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    Назад
                  </button>
                  <button
                    disabled={!canLoadMore || loading}
                    onClick={() => {
                      setAppendOnNextFetch(false);
                      setPage((p) => p + 1);
                    }}
                    className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    Вперёд
                  </button>
                  <button
                    disabled={!canLoadMore || loading}
                    onClick={() => {
                      setAppendOnNextFetch(true);
                      setPage((p) => p + 1);
                    }}
                    className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    Подгрузить ещё
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile: card list */}
            <div className="sm:hidden space-y-4">
              {loading ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
                  Загрузка заказов...
                </div>
              ) : orders.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
                  Заказы не найдены
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
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-transparent px-2 py-4">
                    <span className="text-xs text-zinc-500">
                      Страница {page}/{totalPages}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={page === 1 || loading}
                        onClick={() => {
                          setAppendOnNextFetch(false);
                          setPage((p) => Math.max(1, p - 1));
                        }}
                        className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                      >
                        Назад
                      </button>
                      <button
                        disabled={!canLoadMore || loading}
                        onClick={() => {
                          setAppendOnNextFetch(false);
                          setPage((p) => p + 1);
                        }}
                        className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                      >
                        Вперёд
                      </button>
                      <button
                        disabled={!canLoadMore || loading}
                        onClick={() => {
                          setAppendOnNextFetch(true);
                          setPage((p) => p + 1);
                        }}
                        className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                      >
                        Ещё
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <OrdersKanban
            onOpenOrder={(id) => openExistingOrder(id)}
            filters={{
              status: statusFilter || undefined,
              ownerId: ownerIdFilter || undefined,
              amountFrom: amountFrom || undefined,
              amountTo: amountTo || undefined,
              q: q || undefined,
              paymentType: paymentTypeFilter || undefined,
              paymentStatus: paymentStatusFilter || undefined,
              hasTtn: hasTtnFilter || undefined,
              dateFrom: dateFrom || undefined,
              dateTo: dateTo || undefined,
              sortBy,
              sortDir,
            }}
          />
        )}
      </div>

      {/* Mobile FAB */}
      <button
        type="button"
        onClick={() => void openNewOrder()}
        disabled={creating}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-lg transition-opacity hover:bg-accent-600 disabled:opacity-50 sm:hidden"
        aria-label="Новый заказ"
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
          userRole={userRole}
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
