// src/orders/entities/order-status-history.ts
import { OrderStatus } from "@prisma/client";

export type OrderStatusHistory = {
  id: string;
  orderId: string;
  fromStatus?: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string;
  reason?: string | null;
  createdAt: string;
};
