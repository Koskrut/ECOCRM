import { OrderStatus } from "@prisma/client";

export type OrderCompany = {
  id: string;
  name: string;
};

export type OrderContact = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
};

export type OrderItem = {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  price: number;
  lineTotal: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  status: OrderStatus;

  ownerId: string;

  companyId?: string;
  company?: OrderCompany;

  // старое поле (у тебя используется в UI/доске)
  clientId?: string;
  client?: OrderContact;

  // ✅ новое: контакт для создания ТТН
  contactId?: string;
  contact?: OrderContact;

  currency: string;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;

  comment?: string;

  deliveryMethod?: any;
  paymentMethod?: any;
  deliveryData?: any;

  createdAt: string;
  updatedAt: string;

  items: OrderItem[];
};
