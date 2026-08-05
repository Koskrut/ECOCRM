import type { ValidationError } from "../../common/validation";
import { validateString } from "../../common/validation";

/** Input for company create (internal callers may omit phone/region). */
export type CreateCompanyInput = {
  name: string;
  phone?: string;
  region?: string;
  edrpou?: string;
  taxId?: string;
  address?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  ownerId?: string | null;
};

/** API create body: name, phone and region are required. */
export type CreateCompanyDto = CreateCompanyInput & {
  phone: string;
  region: string;
};

export const validateCreateCompanyDto = (payload: CreateCompanyInput): ValidationError[] => {
  const errors: ValidationError[] = [];
  validateString(payload.name, "name", errors);
  validateString(payload.phone, "phone", errors);
  validateString(payload.region, "region", errors);

  if (payload.edrpou != null) {
    validateString(payload.edrpou, "edrpou", errors, { allowEmpty: true });
  }

  if (payload.taxId != null) {
    validateString(payload.taxId, "taxId", errors, { allowEmpty: true });
  }

  if (payload.address != null) {
    validateString(payload.address, "address", errors, { allowEmpty: true });
  }

  return errors;
};
