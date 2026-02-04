import { ValidationError, validateString } from "../../common/validation";

export type CreateContactDto = {
  companyId?: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  position?: string | null;
  isPrimary?: boolean;
};

export const validateCreateContactDto = (
  payload: CreateContactDto,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Обязательные строковые поля
  validateString(payload.firstName, "firstName", errors);
  validateString(payload.lastName, "lastName", errors);
  validateString(payload.phone, "phone", errors);

  // Опциональные поля (проверяем, если они переданы и не null)
  if (payload.companyId) {
    validateString(payload.companyId, "companyId", errors);
  }
  
  if (payload.email) {
    validateString(payload.email, "email", errors);
  }

  if (payload.position) {
    validateString(payload.position, "position", errors);
  }

  return errors;
};