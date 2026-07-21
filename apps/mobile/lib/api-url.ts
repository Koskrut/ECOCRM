/**
 * Normalize user/build input to a base API URL (no trailing slash).
 * Adds https:// when scheme is missing.
 */
export function normalizeApiBaseUrl(input: string): string {
  let s = input.trim();
  if (!s) {
    throw new Error("empty");
  }
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    throw new Error("invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("invalid");
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol}//${parsed.host}${path === "/" ? "" : path}`;
}

/**
 * Candidate bases to try when the user pastes a web CRM host (no path)
 * vs a direct API host / already-suffixed `/api` BFF URL.
 */
export function apiBaseUrlCandidates(normalized: string): string[] {
  const out = [normalized];
  try {
    const u = new URL(normalized);
    const path = u.pathname.replace(/\/+$/, "") || "";
    if (!path) {
      out.push(`${normalized}/api`);
    }
  } catch {
    /* ignore */
  }
  return out;
}
