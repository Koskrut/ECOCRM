import type { ValidationError } from "../../common/validation";
import { validateString } from "../../common/validation";
import { EMAIL_REGEX, USERNAME_REGEX, getLoginIdentifier, normalizeUsername } from "../username.util";

export type LoginDto = {
  /** Full email (legacy) or same as `login`. */
  email?: string;
  /** Preferred: email or username in one field. */
  login?: string;
  password: string;
};

export const validateLoginDto = (payload: LoginDto): ValidationError[] => {
  const errors: ValidationError[] = [];

  const idRaw = getLoginIdentifier(payload);
  validateString(idRaw, "login", errors);

  if (idRaw) {
    if (idRaw.includes("@")) {
      if (!EMAIL_REGEX.test(idRaw)) {
        errors.push({ field: "email", message: "must be a valid email" });
      }
    } else {
      const u = normalizeUsername(idRaw);
      if (!USERNAME_REGEX.test(u)) {
        errors.push({
          field: "login",
          message: "invalid username (use letters, digits, . _ - ; 2–64 chars)",
        });
      }
    }
  }

  validateString(payload.password, "password", errors);

  return errors;
};
