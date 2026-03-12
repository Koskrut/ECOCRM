/**
 * Whether to set Secure on auth cookies.
 * True only when the request is over HTTPS (direct or via x-forwarded-proto),
 * so login works over http://IP and automatically uses secure cookies behind HTTPS.
 */
export function isSecureRequest(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded === "https") return true;
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}
