import type { ValidationError } from "../../common/validation";
import { validateString, validateBoolean } from "../../common/validation";

export type UpdateContactDto = {
  companyId?: string | null; // Разрешаем null
  firstName?: string;
  lastName?: string;
  phone?: string;
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

  if (payload.address !== undefined && payload.address !== null) {
    validateString(payload.address, "address", errors, { allowEmpty: false });
  }

  if (payload.googlePlaceId !== undefined && payload.googlePlaceId !== null) {
    validateString(payload.googlePlaceId, "googlePlaceId", errors, { allowEmpty: false });
  }

  if (payload.externalCode !== undefined && payload.externalCode !== null) {
    validateString(payload.externalCode, "externalCode", errors, { allowEmpty: false });
  }

  if (payload.region !== undefined && payload.region !== null) {
    validateString(payload.region, "region", errors, { allowEmpty: false });
  }
  if (payload.addressInfo !== undefined && payload.addressInfo !== null) {
    validateString(payload.addressInfo, "addressInfo", errors, { allowEmpty: false });
  }
  if (payload.city !== undefined && payload.city !== null) {
    validateString(payload.city, "city", errors, { allowEmpty: false });
  }
  if (payload.clientType !== undefined && payload.clientType !== null) {
    validateString(payload.clientType, "clientType", errors, { allowEmpty: false });
  }

  if (payload.lat !== undefined && payload.lat !== null && !Number.isFinite(payload.lat)) {
    errors.push({ field: "lat", message: "must be a number" });
  }

  if (payload.lng !== undefined && payload.lng !== null && !Number.isFinite(payload.lng)) {
    errors.push({ field: "lng", message: "must be a number" });
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
    payload.address === undefined &&
    payload.lat === undefined &&
    payload.lng === undefined &&
    payload.googlePlaceId === undefined &&
    payload.isPrimary === undefined &&
    payload.region === undefined &&
    payload.addressInfo === undefined &&
    payload.city === undefined &&
    payload.clientType === undefined
  ) {
    errors.push({ field: "payload", message: "at least one field is required" });
  }

  return errors;
};
