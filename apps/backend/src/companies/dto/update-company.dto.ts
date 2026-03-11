import type { ValidationError } from "../../common/validation";
import { validateString } from "../../common/validation";

export type UpdateCompanyDto = {
  name?: string;
  edrpou?: string;
  taxId?: string;
  phone?: string;
  address?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  ownerId?: string | null;
};

export const validateUpdateCompanyDto = (payload: UpdateCompanyDto): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (payload.name !== undefined) {
    validateString(payload.name, "name", errors);
  }

  if (payload.edrpou !== undefined) {
    validateString(payload.edrpou, "edrpou", errors, { allowEmpty: true });
  }

  if (payload.taxId !== undefined) {
    validateString(payload.taxId, "taxId", errors, { allowEmpty: true });
  }

  if (payload.phone !== undefined) {
    validateString(payload.phone, "phone", errors, { allowEmpty: true });
  }

  if (payload.address !== undefined) {
    validateString(payload.address, "address", errors, { allowEmpty: true });
  }

  if (
    payload.name === undefined &&
    payload.edrpou === undefined &&
    payload.taxId === undefined &&
    payload.phone === undefined &&
    payload.address === undefined &&
    payload.lat === undefined &&
    payload.lng === undefined &&
    payload.googlePlaceId === undefined &&
    payload.ownerId === undefined
  ) {
    errors.push({ field: "payload", message: "at least one field is required" });
  }

  return errors;
};
