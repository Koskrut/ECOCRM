import { ValidationError, validateOptionalNumber, validateString } from "../../common/validation";

export type UpdateOrderDto = {
  // Разрешаем null, чтобы можно было "очистить" поле
  companyId?: string | null;
  clientId?: string | null;
  comment?: string | null; // Комментарий тоже можно стереть
  discountAmount?: number;
};

export const validateUpdateOrderDto = (
  payload: UpdateOrderDto,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Проверяем: если значение есть и оно НЕ null, то это должна быть строка
  if (payload.companyId !== undefined && payload.companyId !== null) {
    validateString(payload.companyId, "companyId", errors, { allowEmpty: false });
  }

  if (payload.clientId !== undefined && payload.clientId !== null) {
    validateString(payload.clientId, "clientId", errors, { allowEmpty: false });
  }

  if (payload.comment !== undefined && payload.comment !== null && typeof payload.comment !== "string") {
    errors.push({ field: "comment", message: "must be a string" });
  }

  if (payload.discountAmount !== undefined) {
    validateOptionalNumber(payload.discountAmount, "discountAmount", errors, { min: 0 });
  }

  if (
    payload.companyId === undefined &&
    payload.clientId === undefined &&
    payload.comment === undefined &&
    payload.discountAmount === undefined
  ) {
    errors.push({ field: "payload", message: "at least one field is required" });
  }

  return errors;
};