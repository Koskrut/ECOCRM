import { DeliveryMethod, PaymentMethod } from "@prisma/client";
import {
  ValidationError,
  validateString,
  validateOptionalNumber,
} from "../../common/validation";

export type CreateOrderDto = {
  ownerId: string;
  companyId?: string | null;
  clientId?: string | null;
  comment?: string;
  discountAmount?: number;

  // ТЕ САМЫЕ ПОЛЯ, КОТОРЫХ НЕ ХВАТАЛО:
  deliveryMethod?: DeliveryMethod;
  paymentMethod?: PaymentMethod;
  deliveryData?: {
    recipientName: string;
    recipientPhone: string;
    city: string;
    warehouse: string;
  } | null;
};

export const validateCreateOrderDto = (
  payload: CreateOrderDto,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Базовая валидация
  validateString(payload.ownerId, "ownerId", errors);

  if (payload.companyId) validateString(payload.companyId, "companyId", errors);
  if (payload.clientId) validateString(payload.clientId, "clientId", errors);
  
  validateOptionalNumber(payload.discountAmount, "discountAmount", errors, {
    min: 0,
  });

  // Валидация методов (Enum)
  if (payload.deliveryMethod && !Object.values(DeliveryMethod).includes(payload.deliveryMethod)) {
    errors.push({ field: "deliveryMethod", message: "invalid delivery method" });
  }

  if (payload.paymentMethod && !Object.values(PaymentMethod).includes(payload.paymentMethod)) {
    errors.push({ field: "paymentMethod", message: "invalid payment method" });
  }

  return errors;
};