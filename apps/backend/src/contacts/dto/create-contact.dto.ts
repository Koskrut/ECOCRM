import type { ValidationError } from "../../common/validation";
import { validateString } from "../../common/validation";

export type CreateContactDto = {
  companyId?: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  position?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
  isPrimary?: boolean;
  /** Код 1С. */
  externalCode?: string | null;
  region?: string | null;
  addressInfo?: string | null;
  city?: string | null;
  clientType?: string | null;
};

export const validateCreateContactDto = (payload: CreateContactDto): ValidationError[] => {
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

  if (payload.address !== undefined && payload.address !== null) {
    validateString(payload.address, "address", errors);
  }

  if (payload.googlePlaceId !== undefined && payload.googlePlaceId !== null) {
    validateString(payload.googlePlaceId, "googlePlaceId", errors);
  }

  if (payload.externalCode !== undefined && payload.externalCode !== null) {
    validateString(payload.externalCode, "externalCode", errors);
  }

  if (payload.region !== undefined && payload.region !== null) {
    validateString(payload.region, "region", errors);
  }
  if (payload.addressInfo !== undefined && payload.addressInfo !== null) {
    validateString(payload.addressInfo, "addressInfo", errors);
  }
  if (payload.city !== undefined && payload.city !== null) {
    validateString(payload.city, "city", errors);
  }
  if (payload.clientType !== undefined && payload.clientType !== null) {
    validateString(payload.clientType, "clientType", errors);
  }

  if (payload.lat !== undefined && payload.lat !== null && !Number.isFinite(payload.lat)) {
    errors.push({ field: "lat", message: "must be a number" });
  }

  if (payload.lng !== undefined && payload.lng !== null && !Number.isFinite(payload.lng)) {
    errors.push({ field: "lng", message: "must be a number" });
  }

  return errors;
};
