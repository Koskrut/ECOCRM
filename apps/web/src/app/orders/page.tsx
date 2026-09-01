"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Filter, Globe, MailPlus, Search } from "lucide-react";
import { apiHttp } from "@/lib/api/client";
import { isTextSelected } from "@/lib/dom";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { formatDate } from "@/lib/crmDatetime";
import { DocumentsRequestedBadge } from "@/components/orders/DocumentsRequestedBadge";
import { OrderPromoBadge } from "@/components/orders/OrderPromoBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { OrderCard } from "./OrderCard";
import { useListColumns } from "@/lib/lists/useListColumns";
import { renderCellText } from "@/lib/lists/renderCell";
import { FinancialKanban } from "./FinancialKanban";
import { OrdersKanban } from "./OrdersKanban";
import { ReturnsKanban } from "./ReturnsKanban";
import { IncomingReturnPackageModal } from "./IncomingReturnPackageModal";
import {
  OrdersFiltersPopover,
  type HasTtnFilter,
  type OrderSortBy,
  type OrderSortDir,
  type OrdersFiltersState,
  type OwnerOption,
} from "./OrdersFiltersPopover";
import { strings } from "@/locales";
import { HelpHint } from "@/components/help/HelpHint";
import { withPreservedScroll } from "@/lib/modal/preserveScroll";
import { useEntityModalStack, type EntityModalFrame } from "@/lib/modal/useEntityModalStack";
import { EntityModalStackLayers } from "@/components/modals/EntityModalStackLayers";

type OrderSummary = {
  id: string;
  orderNumber: string;
  orderSource?: "CRM" | "STORE" | null;
  ownerId?: string | null;
  owner?: { id: string; fullName: string; email?: string | null } | null;
  companyId: string | null;
  clientId: string | null;
  status: string;
  orderStage?: string | null;
  totalAmount: number;
  paidAmount?: number;
  debtAmount?: number;
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID";
  isPaid?: boolean;
  hasTtn?: boolean;
  ttnSharedAcrossOrders?: boolean;
  ttnSharedWithOrders?: Array<{ id: string; orderNumber: string }>;
  currency: string;
  exchangeRate?: number | null;
  paymentType?: "PREPAYMENT" | "DEFERRED" | null;
  createdAt: string;
  itemsCount: number;
  items?: Array<{
    id: string;
    productId?: string | null;
    productNameSnapshot?: string | null;
    qty: number;
    product?: { sku: string } | null;
  }>;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string } | null;
  warehouseId?: string | null;
  warehouse?: { id: string; name: string } | null;
  documentsRequested?: boolean | null;
  hasPromo?: boolean | null;
};

type OrdersListResponse = {
  items: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
};

type OrdersView = "list" | "kanban" | "financial" | "returns";

const DEFAULT_PAGE_SIZE = 50;

/** Phase 3: primary filter by orderStage (human-readable). */
const ORDER_STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Усі стадії" },
  { value: "NEW", label: "Новий" },
  { value: "AWAITING_PAYMENT", label: "Очікує оплату" },
  { value: "AWAITING_STOCK", label: "Очікує на склад" },
  { value: "CONFIRMED", label: "Підтверджено" },
  { value: "READY_TO_SHIP", label: "Готово до відправки" },
  { value: "SHIPPED", label: "Відправлено" },
  { value: "AWAITING_RECEIPT", label: "Очікує отримання" },
  { value: "RECEIVED", label: "Отримано" },
  { value: "COMPLETED", label: "Завершено" },
  { value: "CANCELED", label: "Скасовано" },
  { value: "REFUSED", label: "Відмова" },
  { value: "RETURN_IN_PROGRESS", label: "Повернення" },
  { value: "FULLY_RETURNED", label: "Повернений" },
];

/** Phase 4: financial board filter options */
const FINANCIAL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Усі фін. статуси" },
  { value: "INVOICE_PENDING", label: "Потрібно виставити рахунок" },
  { value: "AWAITING_PAYMENT", label: "Очікуємо оплату" },
  { value: "DUE_SOON", label: "Термін скоро" },
  { value: "OVERDUE", label: "Прострочено" },
  { value: "PAID", label: "Оплачено" },
  { value: "CLOSED", label: "Закрито" },
];

type OrderAttentionPreset = "overdue-payments" | "stuck";

const ORDER_ATTENTION_LABELS: Record<OrderAttentionPreset, string> = {
  "overdue-payments": "Прострочені оплати",
  stuck: "Завислі угоди",
};

const ORDER_ATTENTION_PRESETS = new Set<string>(Object.keys(ORDER_ATTENTION_LABELS));

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
  const returnIdFromUrl = searchParams.get("returnId");
  const root = useMemo<EntityModalFrame | null>(() => {
    if (orderIdFromUrl) return { type: "order", id: orderIdFromUrl };
    if (returnIdFromUrl) return { type: "return", id: returnIdFromUrl };
    return null;
  }, [orderIdFromUrl, returnIdFromUrl]);
  const stack = useEntityModalStack(root);

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { extraColumns, customValues, loadValuesFor } = useListColumns("ORDER");

  useEffect(() => {
    if (orders.length === 0) return;
    void loadValuesFor(orders.map((o) => o.id));
  }, [orders, loadValuesFor]);

  const [page, setPage] = useState<number>(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [view, setView] = useState<OrdersView>(() => {
    const v = searchParams.get("view");
    if (v === "kanban") return "kanban";
    if (v === "financial") return "financial";
    if (v === "returns") return "returns";
    return "list";
  });
  const [financialStatusFilter, setFinancialStatusFilter] = useState<string>(
    () => searchParams.get("financialStatus") ?? "",
  );
  const [attention, setAttention] = useState<OrderAttentionPreset | "">(() => {
    const raw = searchParams.get("attention");
    if (raw && ORDER_ATTENTION_PRESETS.has(raw)) return raw as OrderAttentionPreset;
    if (searchParams.get("financialStatus") === "OVERDUE") return "overdue-payments";
    return "";
  });
  const [attentionPeriod, setAttentionPeriod] = useState<"week" | "month">(() =>
    searchParams.get("attentionPeriod") === "week" ? "week" : "month",
  );
  const [orderIdsFilter, setOrderIdsFilter] = useState(() => searchParams.get("ids") ?? "");
  const [financialOverdue, setFinancialOverdue] = useState<boolean>(
    () => searchParams.get("financialOverdue") === "true",
  );
  const [financialDueSoon, setFinancialDueSoon] = useState<boolean>(
    () => searchParams.get("financialDueSoon") === "true",
  );
  const [financialHasDebt, setFinancialHasDebt] = useState<boolean>(
    () => searchParams.get("financialHasDebt") === "true",
  );
  const [financialHasDueDate, setFinancialHasDueDate] = useState<boolean>(
    () => searchParams.get("financialHasDueDate") === "true",
  );
  const [orderStageFilter, setOrderStageFilter] = useState<string>(
    () => searchParams.get("orderStage") ?? "",
  );
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get("status") ?? "");
  const [ownerIdFilter, setOwnerIdFilter] = useState<string>(
    () => searchParams.get("ownerId") ?? "",
  );
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

  const [kanbanRefreshKey, setKanbanRefreshKey] = useState(0);
  const [returnsRefreshKey, setReturnsRefreshKey] = useState(0);
  const [showIncomingReturnPackage, setShowIncomingReturnPackage] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [ttnHintOrderId, setTtnHintOrderId] = useState<string | null>(null);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);
  const canLoadMore = page < totalPages;

  useEffect(() => {
    const params = new URLSearchParams();
    if (orderIdFromUrl) params.set("orderId", orderIdFromUrl);
    if (returnIdFromUrl) params.set("returnId", returnIdFromUrl);
    if (view !== "list") params.set("view", view);
    if (attention) params.set("attention", attention);
    if (attention === "stuck" && attentionPeriod !== "month") {
      params.set("attentionPeriod", attentionPeriod);
    }
    if (orderIdsFilter) params.set("ids", orderIdsFilter);
    if (financialStatusFilter && !attention) params.set("financialStatus", financialStatusFilter);
    if (financialOverdue) params.set("financialOverdue", "true");
    if (financialDueSoon) params.set("financialDueSoon", "true");
    if (financialHasDebt) params.set("financialHasDebt", "true");
    if (financialHasDueDate) params.set("financialHasDueDate", "true");
    if (page > 1) params.set("page", String(page));
    if (orderStageFilter) params.set("orderStage", orderStageFilter);
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
    returnIdFromUrl,
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
    orderStageFilter,
    statusFilter,
    view,
    financialStatusFilter,
    financialOverdue,
    financialDueSoon,
    financialHasDebt,
    financialHasDueDate,
    attention,
    attentionPeriod,
    orderIdsFilter,
  ]);

  const qRef = useRef(q);
  qRef.current = q;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = qInput.trim();
      if (qRef.current === nextQ) return;
      setAppendOnNextFetch(false);
      setPage(1);
      setQ(nextQ);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    let cancelled = false;

    const loadOwners = async () => {
      try {
        const res = await apiHttp.get<{ items?: Array<{ id: string; fullName?: string }> }>(
          "/users",
        );
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

  const isWarehouse = userRole === "WAREHOUSE";

  const fetchOrders = useCallback(async (opts?: { silent?: boolean }) => {
    const run = async () => {
      if (!opts?.silent) setLoading(true);
      setError(null);

      try {
        const params: Record<string, string | number | boolean> = {
          page,
          pageSize,
          withCompanyClient: true,
        };
        if (attention) params.attention = attention;
        if (attention === "stuck") params.attentionPeriod = attentionPeriod;
        if (orderIdsFilter) params.ids = orderIdsFilter;
        if (!attention && !orderIdsFilter && financialStatusFilter) {
          params.financialStatus = financialStatusFilter;
        }
        if (orderStageFilter) params.orderStage = orderStageFilter;
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
        if (financialOverdue) params.overdue = true;
        if (financialDueSoon) params.dueSoon = true;
        if (financialHasDebt) params.hasDebt = true;
        if (financialHasDueDate) params.hasDueDate = true;
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
    };
    if (opts?.silent) await withPreservedScroll(run);
    else await run();
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
    orderStageFilter,
    statusFilter,
    attention,
    attentionPeriod,
    orderIdsFilter,
    financialStatusFilter,
    financialOverdue,
    financialDueSoon,
    financialHasDebt,
    financialHasDueDate,
  ]);

  useEffect(() => {
    if (view === "list") void fetchOrders();
  }, [fetchOrders, view]);

  useEffect(() => {
    if (!ttnHintOrderId) return;
    const handleDocClick = () => setTtnHintOrderId(null);
    document.addEventListener("click", handleDocClick);
    return () => {
      document.removeEventListener("click", handleDocClick);
    };
  }, [ttnHintOrderId]);

  const openRootOrder = (id: string) => {
    stack.closeAll();
    const params = new URLSearchParams(searchParams.toString());
    params.set("orderId", id);
    params.delete("returnId");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const openExistingOrder = (id: string) => {
    if (root) {
      stack.open({ type: "order", id });
      return;
    }
    openRootOrder(id);
  };

  const openReturn = (id: string) => {
    if (root) {
      stack.open({ type: "return", id });
      return;
    }
    stack.closeAll();
    const params = new URLSearchParams(searchParams.toString());
    params.set("returnId", id);
    params.delete("orderId");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeReturnModal = () => {
    stack.closeAll();
    setReturnsRefreshKey((k) => k + 1);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("returnId");
    params.delete("orderId");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, {
      scroll: false,
    });
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
        documentsRequested: false,
        comment: null,
        discountAmount: 0,
      });

      const created = res.data;
      if (!created?.id) throw new Error("Order created, but id missing");

      openRootOrder(created.id);

      void fetchOrders();
    } catch (e) {
      setError(getErrMessage(e, "Не вдалося створити замовлення"));
    } finally {
      setCreating(false);
    }
  };

  const closeOrderModal = () => {
    stack.closeAll();
    if (view === "list") void fetchOrders({ silent: true });
    setKanbanRefreshKey((k) => k + 1);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("orderId");
    params.delete("returnId");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, {
      scroll: false,
    });
  };

  const closeFrom = (index: number) => {
    if (index <= 0) {
      if (root?.type === "return") closeReturnModal();
      else closeOrderModal();
      return;
    }
    stack.closeFrom(index);
  };

  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAppendOnNextFetch(false);
    setPage(1);
    setQ(qInput.trim());
  };

  const applyPopoverFilters = (next: OrdersFiltersState) => {
    setAppendOnNextFetch(false);
    setOrderStageFilter(next.orderStage);
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
    setOrderStageFilter("");
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
    setAttention("");
    setAttentionPeriod("month");
    setOrderIdsFilter("");
    setFinancialStatusFilter("");
    setFinancialOverdue(false);
    setFinancialDueSoon(false);
    setFinancialHasDebt(false);
    setFinancialHasDueDate(false);
    setPage(1);
  };

  const popoverFiltersActive =
    view === "returns"
      ? Boolean(ownerIdFilter || dateFrom || dateTo)
      : Boolean(
          orderStageFilter ||
            ownerIdFilter ||
            amountFrom ||
            amountTo ||
            dateFrom ||
            dateTo ||
            paymentTypeFilter ||
            paymentStatusFilter ||
            hasTtnFilter ||
            (view !== "financial" && (sortBy !== "createdAt" || sortDir !== "desc")),
        );

  const filtersState: OrdersFiltersState = {
    orderStage: orderStageFilter,
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

  const getClientLabel = (order: OrderSummary) => {
    if (order.client) {
      const full = `${order.client.lastName ?? ""} ${order.client.firstName ?? ""}`.trim();
      return full || "—";
    }
    return order.company?.name ?? "—";
  };

  return (
    <div className="w-full min-w-0">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{strings.nav.orders}</h1>
            <p className="text-sm text-zinc-500">
              {isWarehouse
                ? "Перегляд усіх замовлень"
                : "Список замовлень по всіх менеджерах"}
            </p>
          </div>

          {!isWarehouse ? (
            <div className="flex items-center gap-3">
              <HelpHint routeKey="orders" />
              <button
                type="button"
                onClick={() => void openNewOrder()}
                disabled={creating}
                className="btn-primary hidden sm:inline-flex"
              >
                {creating ? "Створення…" : "+ Нове замовлення"}
              </button>
            </div>
          ) : (
            <HelpHint routeKey="orders" />
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {(attention || orderIdsFilter) && view !== "returns" ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {attention ? (
              <button
                type="button"
                onClick={() => {
                  setAttention("");
                  setAttentionPeriod("month");
                  setPage(1);
                }}
                className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
                title="Скинути фільтр"
              >
                {ORDER_ATTENTION_LABELS[attention]} ×
              </button>
            ) : null}
            {orderIdsFilter ? (
              <button
                type="button"
                onClick={() => {
                  setOrderIdsFilter("");
                  setPage(1);
                }}
                className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-900 hover:bg-sky-200"
                title="Скинути фільтр"
              >
                План дня ({orderIdsFilter.split(",").filter(Boolean).length}) ×
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mb-4">
          <div className="relative">
            <form
              onSubmit={onSearchSubmit}
              className="flex flex-col gap-2 rounded-xl p-2 sm:flex-row sm:items-center"
            >
              <div className="flex shrink-0 overflow-x-auto overflow-y-hidden rounded-lg border border-zinc-200 bg-white p-1 shadow-sm sm:inline-flex">
                <div className="flex gap-0 flex-nowrap min-w-0">
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
                      view === "list"
                        ? "bg-accent-gradient text-white"
                        : "text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    Список
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("kanban")}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
                      view === "kanban"
                        ? "bg-accent-gradient text-white"
                        : "text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    Kanban
                  </button>
                  {!isWarehouse ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setView("financial")}
                        className={`shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
                          view === "financial"
                            ? "bg-accent-gradient text-white"
                            : "text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        Фінанси
                      </button>
                      <button
                        type="button"
                        onClick={() => setView("returns")}
                        className={`shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
                          view === "returns"
                            ? "bg-accent-gradient text-white"
                            : "text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        Повернення
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                <input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder={
                    view === "returns"
                      ? "Пошук за номером замовлення, ТТН, кодом"
                      : "Пошук за номером, клієнтом, компанією, ТТН, товаром"
                  }
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  type="search"
                  aria-label="Пошук замовлень"
                />
                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className={`relative flex shrink-0 items-center justify-center rounded p-1 hover:bg-zinc-200/50 ${
                    popoverFiltersActive
                      ? "text-accent-700"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                  aria-label="Відкрити фільтри"
                  aria-pressed={popoverFiltersActive}
                >
                  <Filter className="h-4 w-4" />
                  {popoverFiltersActive ? (
                    <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-accent-500" />
                  ) : null}
                </button>
              </div>
            </form>

            <OrdersFiltersPopover
              open={filtersOpen}
              value={filtersState}
              ownerOptions={owners}
              orderStageOptions={ORDER_STAGE_OPTIONS}
              variant={view === "returns" ? "returns" : view === "financial" ? "financial" : "orders"}
              onClose={() => setFiltersOpen(false)}
              onApply={applyPopoverFilters}
              onReset={resetAllFilters}
            />
          </div>
          <div className="mt-2 text-sm text-zinc-500">
            {view === "financial"
              ? "Фінансова дошка — за станом оплат і термінів"
              : view === "returns"
                ? "Канбан повернень замовлень"
                : view === "kanban"
                  ? "Канбан за стадіями замовлення"
                  : `Всего: ${total} | Страница ${page} из ${totalPages}`}
          </div>
        </div>

        {view === "returns" ? (
          <ReturnsKanban
            onOpenOrder={(orderId) => openExistingOrder(orderId)}
            onOpenReturn={(returnId) => openReturn(returnId)}
            refreshKey={returnsRefreshKey}
            onRegisterIncoming={
              isWarehouse ? undefined : () => setShowIncomingReturnPackage(true)
            }
            warehouseMode={isWarehouse}
            filters={{
              q: q || undefined,
              ownerId: ownerIdFilter || undefined,
              dateFrom: dateFrom || undefined,
              dateTo: dateTo || undefined,
            }}
          />
        ) : view === "financial" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2">
              <span className="text-xs font-medium text-zinc-500">Фільтри:</span>
              <select
                value={financialStatusFilter}
                onChange={(e) => setFinancialStatusFilter(e.target.value)}
                className="rounded border border-zinc-200 px-2 py-1 text-sm"
              >
                {FINANCIAL_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value || "_"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={paymentTypeFilter}
                onChange={(e) => setPaymentTypeFilter(e.target.value)}
                className="rounded border border-zinc-200 px-2 py-1 text-sm"
              >
                <option value="">Тип оплати: будь-який</option>
                <option value="PREPAYMENT">Передоплата</option>
                <option value="DEFERRED">Відтермінування</option>
              </select>
              <label className="flex items-center gap-1 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={financialOverdue}
                  onChange={(e) => setFinancialOverdue(e.target.checked)}
                />
                Прострочено
              </label>
              <label className="flex items-center gap-1 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={financialDueSoon}
                  onChange={(e) => setFinancialDueSoon(e.target.checked)}
                />
                Термін скоро
              </label>
              <label className="flex items-center gap-1 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={financialHasDebt}
                  onChange={(e) => setFinancialHasDebt(e.target.checked)}
                />
                Є борг
              </label>
              <label className="flex items-center gap-1 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={financialHasDueDate}
                  onChange={(e) => setFinancialHasDueDate(e.target.checked)}
                />
                Є срок оплати
              </label>
            </div>
            <FinancialKanban
              onOpenOrder={(id) => openExistingOrder(id)}
              refreshKey={kanbanRefreshKey}
              filters={{
                financialStatus: financialStatusFilter || undefined,
                paymentType: paymentTypeFilter || undefined,
                overdue: financialOverdue ? "true" : undefined,
                dueSoon: financialDueSoon ? "true" : undefined,
                hasDebt: financialHasDebt ? "true" : undefined,
                hasDueDate: financialHasDueDate ? "true" : undefined,
                ownerId: ownerIdFilter || undefined,
                attention: attention || undefined,
                attentionPeriod: attention === "stuck" ? attentionPeriod : undefined,
                q: q || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                sortBy: "paymentDueDate",
                sortDir: "asc",
                ids: orderIdsFilter || undefined,
                orderStage: orderStageFilter || undefined,
                amountFrom: amountFrom || undefined,
                amountTo: amountTo || undefined,
                paymentStatus: paymentStatusFilter || undefined,
                hasTtn: hasTtnFilter || undefined,
              }}
            />
          </div>
        ) : view === "list" ? (
          <>
            {/* Desktop + Tablet: table */}
            <div className="hidden sm:block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100/80 text-xs font-medium uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Заказ</th>
                    <th className="px-4 py-3">Клиент/Компания</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Відповідальний</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Склад</th>
                    <th className="px-4 py-3">Дата</th>
                    <th className="px-4 py-3 hidden md:table-cell">Оплата</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3 text-right hidden lg:table-cell">Товари</th>
                    <th className="px-4 py-3 text-right">Сума</th>
                    {extraColumns.map((col) => (
                      <th key={col.fieldId} className="px-4 py-3">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9 + extraColumns.length} className="px-6 py-8 text-center text-zinc-500">
                        Загрузка заказов...
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={9 + extraColumns.length} className="px-6 py-8 text-center text-zinc-500">
                        Замовлення не знайдено
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => {
                          if (isTextSelected()) return;
                          openExistingOrder(order.id);
                        }}
                        className="cursor-pointer transition-colors hover:bg-zinc-50"
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 font-medium text-zinc-900">
                            <span>{order.orderNumber}</span>
                            {order.orderSource === "STORE" && (
                              <span title="Заказ с сайта" className="inline-flex text-violet-600">
                                <Globe className="h-4 w-4" />
                              </span>
                            )}
                            {order.hasTtn && (
                              <span title="ТТН створено" className="inline-flex text-blue-600">
                                <MailPlus className="h-4 w-4" />
                              </span>
                            )}
                            {order.ttnSharedAcrossOrders && (
                              <span className="relative inline-flex">
                                <button
                                  type="button"
                                  title="Номер ТТН також привʼязаний до іншого замовлення"
                                  className="inline-flex text-amber-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTtnHintOrderId((prev) =>
                                      prev === order.id ? null : order.id,
                                    );
                                  }}
                                >
                                  <AlertTriangle className="h-4 w-4" />
                                </button>
                                {ttnHintOrderId === order.id && (
                                  <div
                                    className="absolute left-0 top-6 z-20 min-w-[220px] rounded-md border border-zinc-200 bg-white p-2 text-xs font-normal text-zinc-700 shadow-lg"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {(order.ttnSharedWithOrders?.length ?? 0) > 0
                                      ? `Также едет заказ: ${order.ttnSharedWithOrders
                                          ?.map((linkedOrder) => `№${linkedOrder.orderNumber}`)
                                          .join(", ")}`
                                      : "Номер ТТН також привʼязаний до іншого замовлення"}
                                  </div>
                                )}
                              </span>
                            )}
                            {(order.isPaid ||
                              order.paymentStatus === "PAID" ||
                              order.paymentStatus === "OVERPAID") && (
                              <span title="Заказ оплачен" className="inline-flex text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" />
                              </span>
                            )}
                            <DocumentsRequestedBadge documentsRequested={order.documentsRequested} />
                            <OrderPromoBadge hasPromo={order.hasPromo} />
                          </div>
                        </td>
                        <td className="px-4 py-4 text-zinc-700">
                          {getClientLabel(order)}
                        </td>
                        <td className="px-4 py-4 hidden lg:table-cell text-zinc-700">
                          {order.owner?.fullName || "—"}
                        </td>
                        <td className="px-4 py-4 hidden lg:table-cell text-zinc-700">
                          {order.warehouse?.name || "—"}
                        </td>
                        <td className="px-4 py-4 text-zinc-500">{formatDate(order.createdAt)}</td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          {order.paymentType ? (
                            <span
                              className={
                                order.paymentType === "PREPAYMENT"
                                  ? "inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
                                  : "inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                              }
                            >
                              {order.paymentType === "PREPAYMENT" ? "Передоплата" : "Відтермінування"}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge
                            variant="order"
                            status={order.status}
                            orderStage={order.orderStage}
                          />
                        </td>
                        <td className="px-4 py-4 text-right text-zinc-500 hidden lg:table-cell">
                          <div className="relative inline-flex items-center justify-end group">
                            <span className="cursor-help">{order.itemsCount}</span>
                            <div className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden min-w-[220px] max-w-[360px] rounded-md border border-zinc-200 bg-white p-2 text-left text-xs text-zinc-700 shadow-lg group-hover:block">
                              {order.items && order.items.length > 0 ? (
                                <div className="space-y-1">
                                  {order.items.map((item) => (
                                    <div key={item.id} className="truncate">
                                      {item.product?.sku ?? "Без артикула"} x{item.qty}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-zinc-500">Нет позиций</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-zinc-900">
                          {formatOrderAmount(order.totalAmount, order.currency, order.exchangeRate)}
                        </td>
                        {extraColumns.map((col) => (
                          <td key={col.fieldId} className="px-4 py-4 text-zinc-600">
                            {renderCellText(col, order as unknown as Record<string, unknown>, customValues)}
                          </td>
                        ))}
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
                    Вперед
                  </button>
                  <button
                    disabled={!canLoadMore || loading}
                    onClick={() => {
                      setAppendOnNextFetch(true);
                      setPage((p) => p + 1);
                    }}
                    className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    Підвантажити ще
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
                  Замовлення не знайдено
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
                        Вперед
                      </button>
                      <button
                        disabled={!canLoadMore || loading}
                        onClick={() => {
                          setAppendOnNextFetch(true);
                          setPage((p) => p + 1);
                        }}
                        className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                      >
                        Ще
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
            refreshKey={kanbanRefreshKey}
            warehouseMode={false}
            warehouseRestricted={isWarehouse}
            filters={{
              orderStage: orderStageFilter || undefined,
              status: statusFilter || undefined,
              ownerId: ownerIdFilter || undefined,
              attention: attention || undefined,
              attentionPeriod: attention === "stuck" ? attentionPeriod : undefined,
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
              ids: orderIdsFilter || undefined,
              overdue: financialOverdue ? "true" : undefined,
              dueSoon: financialDueSoon ? "true" : undefined,
              hasDebt: financialHasDebt ? "true" : undefined,
              hasDueDate: financialHasDueDate ? "true" : undefined,
            }}
          />
        )}
      {/* Mobile FAB */}
      {!isWarehouse ? (
        <button
          type="button"
          onClick={() => void openNewOrder()}
          disabled={creating}
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-lg transition-opacity hover:bg-accent-600 disabled:opacity-50 sm:hidden"
          aria-label="Нове замовлення"
        >
          <span className="text-2xl leading-none">+</span>
        </button>
      ) : null}

      {root ? (
        <EntityModalStackLayers
          frames={stack.frames}
          root={root}
          userRole={userRole}
          onOpen={stack.open}
          onCloseFrom={closeFrom}
          onReplace={stack.replace}
          onUpdate={() => {
            void fetchOrders({ silent: true });
            setKanbanRefreshKey((k) => k + 1);
          }}
          onOrderSaved={() => {
            if (view === "returns") setReturnsRefreshKey((k) => k + 1);
          }}
        />
      ) : null}
      <IncomingReturnPackageModal
        open={showIncomingReturnPackage}
        onClose={() => setShowIncomingReturnPackage(false)}
        onCreated={() => setReturnsRefreshKey((k) => k + 1)}
        contactSearch={async (q) => {
          const res = await apiHttp.get<{
            items?: Array<{ id: string; firstName: string; lastName: string; phone: string }>;
          }>("/contacts", { params: { q, page: 1, pageSize: 20 } });
          return res.data?.items ?? [];
        }}
      />
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
