/** Turn API error bodies into a short alert string (never dump HTML pages). */
export function apiErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object" && body !== null && "message" in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
    if (Array.isArray(m)) return m.map(String).join(", ");
  }
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return String(status);
    if (trimmed.startsWith("<") || /<!DOCTYPE|<html/i.test(trimmed)) {
      return `HTTP ${status}`;
    }
    return trimmed.length > 400 ? `HTTP ${status}` : trimmed;
  }
  return String(status);
}
