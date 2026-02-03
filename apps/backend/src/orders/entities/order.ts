import { OrderItem } from "./order-item";

export type OrderStatus =
  | "NEW"
  | "SHIPPING_CREATED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELED";

export type Order = {
  id: string;
  orderNumber: string;
  companyId: string | null;
  clientId: string | null;
  company?: {
    id: string;
    name: string;
  };
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  ownerId: string;
  status: OrderStatus;
  currency: string;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  comment?: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
};

export type OrderSummary = Omit<Order, "items"> & {
  itemsCount: number;
};
