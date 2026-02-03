import { OrderStatus } from "./order";

export type OrderStatusHistory = {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string;
  reason?: string;
  createdAt: string;
};
