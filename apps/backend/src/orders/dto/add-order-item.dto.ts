import { ValidationError, validateNumber, validateString } from "../../common/validation";

export type AddOrderItemDto = {
  productId: string;
  qty: number;
  price: number;
};

export const validateAddOrderItemDto = (payload: AddOrderItemDto): ValidationError[] => {
  const errors: ValidationError[] = [];
  validateString(payload.productId, "productId", errors);
  validateNumber(payload.qty, "qty", errors, { min: 1 });
  validateNumber(payload.price, "price", errors, { min: 0 });
  return errors;
};
