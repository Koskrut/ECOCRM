import { UserRole } from "@prisma/client";
import type { ValidationError } from "../../common/validation";
import { validateString } from "../../common/validation";
import { EMAIL_REGEX, USERNAME_REGEX, normalizeUsername } from "../username.util";

export type RegisterDto = {
  email: string;
  password: string;
  fullName: string;
  /** Optional CRM login without @; stored lowercase. */
  username?: string;
  role?: UserRole;
};

export const validateRegisterDto = (payload: RegisterDto): ValidationError[] => {
  const errors: ValidationError[] = [];

  validateString(payload.email, "email", errors);
  if (typeof payload.email === "string" && !EMAIL_REGEX.test(payload.email)) {
    errors.push({ field: "email", message: "must be a valid email" });
  }

  if (payload.username != null && String(payload.username).trim()) {
    const u = normalizeUsername(String(payload.username));
    if (!USERNAME_REGEX.test(u)) {
      errors.push({
        field: "username",
        message: "invalid username (use letters, digits, . _ - ; 2–64 chars)",
      });
    }
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
