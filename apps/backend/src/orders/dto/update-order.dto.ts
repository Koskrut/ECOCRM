import { ValidationError, validateOptionalNumber, validateString } from "../../common/validation";

export type UpdateOrderDto = {
  companyId?: string;
  clientId?: string;
  comment?: string;
  discountAmount?: number;
};

export const validateUpdateOrderDto = (
  payload: UpdateOrderDto,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (payload.companyId !== undefined) {
    validateString(payload.companyId, "companyId", errors, { allowEmpty: false });
  }

  if (payload.clientId !== undefined) {
    validateString(payload.clientId, "clientId", errors, { allowEmpty: false });
  }

  if (payload.comment !== undefined && typeof payload.comment !== "string") {
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
