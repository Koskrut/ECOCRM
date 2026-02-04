import { UserRole } from "@prisma/client";
import { ValidationError, validateString } from "../../common/validation";

export type RegisterDto = {
  email: string;
  password: string;
  fullName: string;
  role?: UserRole;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateRegisterDto = (payload: RegisterDto): ValidationError[] => {
  const errors: ValidationError[] = [];

  validateString(payload.email, "email", errors);
  if (typeof payload.email === "string" && !EMAIL_REGEX.test(payload.email)) {
    errors.push({ field: "email", message: "must be a valid email" });
  }

  validateString(payload.password, "password", errors);
  if (typeof payload.password === "string" && payload.password.length < 8) {
    errors.push({ field: "password", message: "must be at least 8 characters" });
  }

  validateString(payload.fullName, "fullName", errors);

  if (payload.role && !Object.values(UserRole).includes(payload.role)) {
    errors.push({ field: "role", message: "invalid role" });
  }

  return errors;
};
