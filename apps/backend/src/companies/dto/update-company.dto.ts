import type { ValidationError } from "../../common/validation";
import { validateString } from "../../common/validation";

export type UpdateCompanyDto = {
  name?: string;
  edrpou?: string;
  taxId?: string;
  phone?: string;
  address?: string;
  region?: string | null;
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

  if (payload.edrpou != null) {
    validateString(payload.edrpou, "edrpou", errors, { allowEmpty: true });
  }

  if (payload.taxId != null) {
    validateString(payload.taxId, "taxId", errors, { allowEmpty: true });
  }

  if (payload.phone != null) {
    validateString(payload.phone, "phone", errors, { allowEmpty: true });
  }

  if (payload.address != null) {
    validateString(payload.address, "address", errors, { allowEmpty: true });
  }

  if (payload.region !== undefined && payload.region !== null) {
    validateString(payload.region, "region", errors, { allowEmpty: false });
  }

  if (
    payload.name === undefined &&
    payload.edrpou === undefined &&
    payload.taxId === undefined &&
    payload.phone === undefined &&
    payload.address === undefined &&
    payload.region === undefined &&
    payload.lat === undefined &&
    payload.lng === undefined &&
    payload.googlePlaceId === undefined &&
    payload.ownerId === undefined
  ) {
    errors.push({ field: "payload", message: "at least one field is required" });
  }

  return errors;
};
