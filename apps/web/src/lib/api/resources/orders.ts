import { apiHttp } from "../client";
import type { OrderStockReadiness } from "@/components/orders/StockReadinessBadge";

export type FulfillmentQueueOrder = {
  id: string;
  orderNumber: string;
  orderStage?: string | null;
  totalAmount: number;
  currency: string;
  paymentType?: string | null;
  paidAmount?: number;
  comment?: string | null;
  documentsRequested?: boolean | null;
  warehouseId?: string | null;
  warehouse?: { id: string; name: string } | null;
  deliveryMethod?: string | null;
  createdAt: string;
  stockReadiness?: OrderStockReadiness | null;
  company?: { id: string; name: string } | null;
  client?: { id: string; firstName: string; lastName: string } | null;
  items?: Array<{
    id: string;
    qty: number;
    productNameSnapshot?: string | null;
    product?: { sku: string; name: string } | null;
  }>;
};

export type FulfillmentQueueResponse = {
  items: FulfillmentQueueOrder[];
  total: number;
  counts: Record<string, number>;
};

export type SplitByStockResponse = {
  parent?: FulfillmentQueueOrder & { orderNumber?: string };
  child?: FulfillmentQueueOrder & { orderNumber?: string };
};

export const ordersApi = {
  getFulfillmentQueue(params?: { warehouseIds?: string[] }) {
    const query =
      params?.warehouseIds && params.warehouseIds.length > 0
        ? { warehouseIds: params.warehouseIds.join(",") }
        : undefined;
    return apiHttp
      .get<FulfillmentQueueResponse>("/orders/fulfillment-queue", { params: query })
      .then((r) => r.data ?? { items: [], total: 0, counts: {} });
  },

  patchStage(orderId: string, toStage: string, reason?: string) {
    return apiHttp.patch(`/orders/${orderId}/stage`, { toStage, reason });
  },

  updateItem(orderId: string, itemId: string, payload: { qty: number }) {
    return apiHttp.patch(`/orders/${orderId}/items/${itemId}`, payload);
  },

  splitByStock(orderId: string) {
    return apiHttp
      .post<SplitByStockResponse>(`/orders/${orderId}/split-by-stock`)
      .then((r) => r.data);
  },
};
