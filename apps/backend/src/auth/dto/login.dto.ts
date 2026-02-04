import { ValidationError, validateString } from "../../common/validation";

export type LoginDto = {
  email: string;
  password: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateLoginDto = (payload: LoginDto): ValidationError[] => {
  const errors: ValidationError[] = [];

  validateString(payload.email, "email", errors);
  if (typeof payload.email === "string" && !EMAIL_REGEX.test(payload.email)) {
    errors.push({ field: "email", message: "must be a valid email" });
  }

  validateString(payload.password, "password", errors);

  return errors;
};
