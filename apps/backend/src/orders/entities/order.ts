import { OrderStatus, DeliveryMethod, PaymentMethod, Prisma } from "@prisma/client";

// Эти экспорты нужны, чтобы другие файлы (DTO, сервисы) могли брать типы отсюда
export { OrderStatus, DeliveryMethod, PaymentMethod };

export class Order {
  id!: string;
  orderNumber!: string;
  status!: OrderStatus;
  
  // Связи (добавляем и ID, и объекты для полной совместимости с маппингом)
  ownerId!: string;
  companyId?: string | null;
  clientId?: string | null;

  company?: { id: string; name: string };
  client?: { id: string; firstName: string; lastName: string; phone: string };
  
  // Финансы
  currency!: string;
  subtotalAmount!: number;
  discountAmount!: number;
  totalAmount!: number;
  paidAmount!: number;
  debtAmount!: number;

  // Доставка и оплата (те самые новые поля)
  deliveryMethod?: DeliveryMethod | null;
  paymentMethod?: PaymentMethod | null;
  
  // Используем Prisma.JsonValue для корректной работы с JSON-полем в БД
  deliveryData?: Prisma.JsonValue | null;

  comment?: string;
  
  createdAt!: string;
  updatedAt!: string;

  // Список позиций (товаров)
  items?: {
    id: string;
    productId: string;
    productName: string;
    qty: number;
    price: number;
    lineTotal: number;
  }[];
}