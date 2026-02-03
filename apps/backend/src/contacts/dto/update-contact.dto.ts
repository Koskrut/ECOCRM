import { ValidationError, validateString } from "../../common/validation";

export type UpdateContactDto = {
  companyId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  position?: string;
  isPrimary?: boolean;
};

export const validateUpdateContactDto = (
  payload: UpdateContactDto,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (payload.firstName !== undefined) {
    validateString(payload.firstName, "firstName", errors);
  }

  if (payload.lastName !== undefined) {
    validateString(payload.lastName, "lastName", errors);
  }

  if (payload.phone !== undefined) {
    validateString(payload.phone, "phone", errors);
  }

  if (payload.companyId !== undefined) {
    validateString(payload.companyId, "companyId", errors);
  }

  if (payload.email !== undefined) {
    validateString(payload.email, "email", errors, { allowEmpty: false });
  }

  if (payload.position !== undefined) {
    validateString(payload.position, "position", errors, { allowEmpty: false });
  }

  if (
    payload.firstName === undefined &&
    payload.lastName === undefined &&
    payload.phone === undefined &&
    payload.companyId === undefined &&
    payload.email === undefined &&
    payload.position === undefined &&
    payload.isPrimary === undefined
  ) {
    errors.push({ field: "payload", message: "at least one field is required" });
  }

  return errors;
};
