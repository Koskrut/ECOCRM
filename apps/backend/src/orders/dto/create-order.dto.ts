import { ValidationError, validateNumber, validateString } from "../../common/validation";

export type CreateOrderDto = {
  companyId?: string;
  clientId?: string;
  ownerId: string;
  comment?: string;
  discountAmount?: number;
};

export const validateCreateOrderDto = (
  payload: CreateOrderDto,
): ValidationError[] => {
  const errors: ValidationError[] = [];
  validateString(payload.ownerId, "ownerId", errors);

  if (payload.companyId !== undefined) {
    validateString(payload.companyId, "companyId", errors);
  }

  if (payload.clientId !== undefined) {
    validateString(payload.clientId, "clientId", errors);
  }

  if (payload.comment !== undefined) {
    validateString(payload.comment, "comment", errors, { allowEmpty: false });
  }

  if (payload.discountAmount !== undefined) {
    validateNumber(payload.discountAmount, "discountAmount", errors, { min: 0 });
  }

  return errors;
};
