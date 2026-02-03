import { ValidationError, validateOptionalNumber } from "../../common/validation";

export type UpdateOrderItemDto = {
  qty?: number;
  price?: number;
};

export const validateUpdateOrderItemDto = (
  payload: UpdateOrderItemDto,
): ValidationError[] => {
  const errors: ValidationError[] = [];
  validateOptionalNumber(payload.qty, "qty", errors, { min: 1 });
  validateOptionalNumber(payload.price, "price", errors, { min: 0 });
  if (payload.qty === undefined && payload.price === undefined) {
    errors.push({ field: "payload", message: "qty or price is required" });
  }
  return errors;
};
