import { apiHttp } from "../client";

export type FulfillmentQueueOrder = {
  id: string;
  orderNumber: string;
  orderStage?: string | null;
  totalAmount: number;
  currency: string;
  paymentType?: string | null;
  paidAmount?: number;
  warehouseId?: string | null;
  createdAt: string;
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

export const ordersApi = {
  getFulfillmentQueue() {
    return apiHttp
      .get<FulfillmentQueueResponse>("/orders/fulfillment-queue")
      .then((r) => r.data ?? { items: [], total: 0, counts: {} });
  },

  patchStage(orderId: string, toStage: string, reason?: string) {
    return apiHttp.patch(`/orders/${orderId}/stage`, { toStage, reason });
  },

  splitByStock(orderId: string) {
    return apiHttp.post(`/orders/${orderId}/split-by-stock`);
  },
};
