export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lowercase handle for CRM login (without @). 1 char, or 2–64 chars with allowed punctuation inside.
 */
export const USERNAME_REGEX = /^[a-z0-9]$|^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;

export function getLoginIdentifier(payload: { email?: string; login?: string }): string {
  if (typeof payload.login === "string" && payload.login.trim()) return payload.login.trim();
  if (typeof payload.email === "string") return payload.email.trim();
  return "";
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Derive a username base from a normalized (lowercase) email address. */
export function usernameBaseFromEmail(emailLower: string): string {
  const local = (emailLower.split("@")[0] ?? "").toLowerCase();
  let base = local.replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (base.length < 1) base = "user";
  return base.slice(0, 64);
}

export async function allocateUniqueUsername(
  usernameTaken: (candidate: string) => Promise<boolean>,
  base: string,
): Promise<string> {
  const root = (base.length > 0 ? base : "user").slice(0, 64);
  let candidate = root;
  let n = 0;
  while (await usernameTaken(candidate)) {
    n += 1;
    candidate = `${root.slice(0, 50)}-${n}`.slice(0, 64);
  }
  return candidate;
}
