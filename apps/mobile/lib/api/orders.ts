import { apiFetch } from "@/lib/api";
import { endOfLocalDayIso, startOfLocalDayIso } from "@/lib/date";

export type OrderListItem = {
  id: string;
  orderNumber?: string | null;
  status: string;
  orderStage?: string | null;
  stockReadiness?: "NONE" | "PARTIAL" | "FULL" | null;
  financialStatus?: string | null;
  totalAmount?: number | null;
  subtotalAmount?: number | null;
  discountAmount?: number | null;
  paidAmount?: number | null;
  debtAmount?: number | null;
  exchangeRate?: number | null;
  paymentStatus?: string | null;
  currency?: string | null;
  createdAt: string;
  contactId?: string | null;
  companyId?: string | null;
  ownerId?: string | null;
  comment?: string | null;
  paymentType?: string | null;
  paymentMethod?: string | null;
  paymentDueDate?: string | null;
  bankAccountId?: string | null;
  warehouseId?: string | null;
  documentsRequested?: boolean | null;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string } | null;
  warehouse?: { id: string; name: string } | null;
  bankAccount?: { id: string; name: string } | null;
  items?: Array<{
    id: string;
    productId: string | null;
    productName?: string | null;
    productNameSnapshot?: string | null;
    qty: number;
    price: number;
    discountPercent: number;
    promoType?: string | null;
    lineTotal: number;
    product?: { sku?: string | null; name?: string | null } | null;
  }>;
  deliveryMethod?: string | null;
  deliveryData?: Record<string, unknown> | null;
};

export type Order = OrderListItem;

export type ListOrdersResponse = {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ListOrdersQuery = {
  contactId?: string;
  companyId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  ownerId?: string;
  orderStage?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type CreateOrderBody = {
  contactId?: string | null;
  companyId?: string | null;
  clientId?: string | null;
  comment?: string;
  discountAmount?: number;
  documentsRequested?: boolean | null;
  deliveryMethod?: string;
  paymentType?: string;
  paymentMethod?: string;
  bankAccountId?: string | null;
  warehouseId?: string | null;
};

export type PatchOrderBody = {
  contactId?: string | null;
  companyId?: string | null;
  clientId?: string | null;
  comment?: string | null;
  deliveryMethod?: string | null;
  deliveryData?: Record<string, unknown> | null;
  warehouseId?: string | null;
  paymentType?: string | null;
  paymentMethod?: string | null;
  paymentDueDate?: string | null;
  bankAccountId?: string | null;
  documentsRequested?: boolean | null;
  discountAmount?: number | null;
};

export type AddOrderItemBody = {
  productId: string;
  qty: number;
  price: number;
  discountPercent?: number;
  promoType?: string | null;
};

export type UpdateOrderItemBody = {
  qty?: number;
  price?: number;
  discountPercent?: number;
  promoType?: string | null;
};

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export const ordersApi = {
  list: (token: string, query: ListOrdersQuery = {}) =>
    apiFetch<ListOrdersResponse>(
      `/orders${qs({
        contactId: query.contactId,
        companyId: query.companyId,
        q: query.q,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        ownerId: query.ownerId,
        orderStage: query.orderStage,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        sortBy: "createdAt",
        sortDir: "desc",
        withCompanyClient: true,
      })}`,
      { token },
    ),

  getById: (token: string, id: string) => apiFetch<Order>(`/orders/${id}`, { token }),

  create: (token: string, body: CreateOrderBody) =>
    apiFetch<Order>("/orders", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  patch: (token: string, id: string, body: PatchOrderBody) =>
    apiFetch<Order>(`/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),

  addItem: (token: string, orderId: string, body: AddOrderItemBody) =>
    apiFetch<Order>(`/orders/${orderId}/items`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateItem: (token: string, orderId: string, itemId: string, body: UpdateOrderItemBody) =>
    apiFetch<Order>(`/orders/${orderId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),

  removeItem: (token: string, orderId: string, itemId: string) =>
    apiFetch<Order>(`/orders/${orderId}/items/${itemId}`, {
      method: "DELETE",
      token,
    }),

  updateStage: (token: string, orderId: string, toStage: string, reason?: string) =>
    apiFetch<Order>(`/orders/${orderId}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ toStage, reason }),
      token,
    }),
};

/** Convenience filters for mobile list chips. */
export function ordersFilterQuery(
  filter: "all" | "mine" | "today" | "drafts",
  userId?: string | null,
): Pick<ListOrdersQuery, "ownerId" | "dateFrom" | "dateTo" | "orderStage"> {
  if (filter === "mine" && userId) return { ownerId: userId };
  if (filter === "today") {
    return { dateFrom: startOfLocalDayIso(), dateTo: endOfLocalDayIso() };
  }
  if (filter === "drafts") return { orderStage: "NEW" };
  return {};
}
