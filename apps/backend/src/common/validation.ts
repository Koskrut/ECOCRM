export type ValidationError = {
  field: string;
  message: string;
};

export const validateString = (
  value: unknown,
  field: string,
  errors: ValidationError[],
  options?: { allowEmpty?: boolean },
): void => {
  if (typeof value !== "string") {
    errors.push({ field, message: "must be a string" });
    return;
  }
  if (!options?.allowEmpty && value.trim().length === 0) {
    errors.push({ field, message: "must not be empty" });
  }
};

export const validateNumber = (
  value: unknown,
  field: string,
  errors: ValidationError[],
  options?: { min?: number },
): void => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    errors.push({ field, message: "must be a number" });
    return;
  }
  if (options?.min !== undefined && value < options.min) {
    errors.push({ field, message: `must be >= ${options.min}` });
  }
};

export const validateOptionalNumber = (
  value: unknown,
  field: string,
  errors: ValidationError[],
  options?: { min?: number },
): void => {
  if (value === undefined) {
    return;
  }
  validateNumber(value, field, errors, options);
};

// --- Добавляем валидацию булевого значения ---
export const validateBoolean = (value: unknown, field: string, errors: ValidationError[]): void => {
  if (typeof value !== "boolean") {
    errors.push({ field, message: "must be a boolean" });
  }
};
