import type { ValidationError } from "../../common/validation";
import { validateString } from "../../common/validation";

export type CreateCompanyDto = {
  name: string;
  edrpou?: string;
  taxId?: string;
  phone?: string;
  address?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  ownerId?: string | null;
};

export const validateCreateCompanyDto = (payload: CreateCompanyDto): ValidationError[] => {
  const errors: ValidationError[] = [];
  validateString(payload.name, "name", errors);

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

  return errors;
};
