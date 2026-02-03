import { ValidationError, validateString, validateBoolean } from "../../common/validation";

export type CreateContactDto = {
  companyId?: string | null;
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

  // --- ВАЖНО: Добавляем ту же проверку здесь ---
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

  return errors;
};