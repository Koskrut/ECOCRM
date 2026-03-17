import type { DeliveryMethod, OrderStatus, PaymentMethod, PaymentType } from "@prisma/client";

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

  deliveryMethod?: DeliveryMethod | null;
  paymentMethod?: PaymentMethod | null;
  bankAccountId?: string | null;
  bankAccount?: { id: string; name: string } | null;
  warehouseId?: string | null;
  warehouse?: { id: string; name: string } | null;
  /** Bitrix: Документы (Да/нет). */
  documentsRequested?: boolean | null;
  paymentType?: PaymentType | null;
  deliveryData?: Record<string, unknown> | null;
  /** Номер и дата счёта (из 1С). */
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  waybillNumber?: string | null;
  waybillDate?: string | null;
  exchangeRate?: number | null;

  createdAt: string;
  updatedAt: string;

  items: OrderItem[];
};
