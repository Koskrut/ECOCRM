import { ValidationError, validateString, validateBoolean } from "../../common/validation";

export type UpdateContactDto = {
  companyId?: string | null; // Разрешаем null
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string | null;
  position?: string | null;
  isPrimary?: boolean;
};

export const validateUpdateContactDto = (payload: UpdateContactDto): ValidationError[] => {
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

  // ВАЖНО: Проверяем строку, только если значение НЕ null
  if (payload.companyId !== undefined && payload.companyId !== null) {
    validateString(payload.companyId, "companyId", errors);
  }

  if (payload.email !== undefined && payload.email !== null) {
    validateString(payload.email, "email", errors, { allowEmpty: false });
  }

  if (payload.position !== undefined && payload.position !== null) {
    validateString(payload.position, "position", errors, { allowEmpty: false });
  }

  if (payload.isPrimary !== undefined) {
    validateBoolean(payload.isPrimary, "isPrimary", errors);
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
