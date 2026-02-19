import { ValidationError, validateString } from "../../common/validation";

export type UpdateCompanyDto = {
  name?: string;
  edrpou?: string;
  taxId?: string;
};

export const validateUpdateCompanyDto = (payload: UpdateCompanyDto): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (payload.name !== undefined) {
    validateString(payload.name, "name", errors);
  }

  if (payload.edrpou !== undefined) {
    validateString(payload.edrpou, "edrpou", errors, { allowEmpty: false });
  }

  if (payload.taxId !== undefined) {
    validateString(payload.taxId, "taxId", errors, { allowEmpty: false });
  }

  if (payload.name === undefined && payload.edrpou === undefined && payload.taxId === undefined) {
    errors.push({ field: "payload", message: "at least one field is required" });
  }

  return errors;
};
