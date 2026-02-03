import { ValidationError, validateString } from "../../common/validation";

export type CreateContactDto = {
  companyId?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  position?: string;
  isPrimary?: boolean;
};

export const validateCreateContactDto = (
  payload: CreateContactDto,
): ValidationError[] => {
  const errors: ValidationError[] = [];
  validateString(payload.firstName, "firstName", errors);
  validateString(payload.lastName, "lastName", errors);
  validateString(payload.phone, "phone", errors);

  if (payload.companyId !== undefined) {
    validateString(payload.companyId, "companyId", errors);
  }

  if (payload.email !== undefined) {
    validateString(payload.email, "email", errors, { allowEmpty: false });
  }

  if (payload.position !== undefined) {
    validateString(payload.position, "position", errors, { allowEmpty: false });
  }

  return errors;
};
