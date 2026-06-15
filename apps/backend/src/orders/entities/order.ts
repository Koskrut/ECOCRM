import type {
  DeliveryStatus,
  OrderFinancialStatus,
  OrderStage,
  OrderStatus,
  DeliveryMethod,
  PaymentMethod,
  PaymentType,
} from "@prisma/client";

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
  discountPercent: number;
  lineTotal: number;
};

export type OrderShipment = {
  id: string;
  status?: string | null;
  carrier?: string | null;
  createdAt?: string;
  updatedAt?: string;
  ttns?: Array<{
    id: string;
    documentNumber: string;
    statusCode?: string | null;
    statusText?: string | null;
    createdAt?: string;
  }>;
};

export type OrderLinkRef = {
  id: string;
  orderNumber: string;
};

export type OrderChildRef = OrderLinkRef & {
  orderStage?: OrderStage | null;
};

export type Order = {
  id: string;
  orderNumber: string;
  parentOrderId?: string | null;
  parent?: OrderLinkRef | null;
  children?: OrderChildRef[];
  /** @deprecated Phase 7: use orderStage. May be null. */
  status?: OrderStatus | null;

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

  /** Phase 1: new order model fields (optional for backward compatibility). */
  orderStage?: OrderStage | null;
  deliveryStatus?: DeliveryStatus | null;
  financialStatus?: OrderFinancialStatus | null;
  paymentDueDate?: string | null;

  createdAt: string;
  updatedAt: string;

  items: OrderItem[];
  shipments?: OrderShipment[];
};
