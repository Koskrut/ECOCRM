import { ValidationError, validateString } from "../../common/validation";

export type CreateCompanyDto = {
  name: string;
  edrpou?: string;
  taxId?: string;
};

export const validateCreateCompanyDto = (payload: CreateCompanyDto): ValidationError[] => {
  const errors: ValidationError[] = [];
  validateString(payload.name, "name", errors);

  if (payload.edrpou !== undefined) {
    validateString(payload.edrpou, "edrpou", errors, { allowEmpty: false });
  }

  if (payload.taxId !== undefined) {
    validateString(payload.taxId, "taxId", errors, { allowEmpty: false });
  }

  return errors;
};
