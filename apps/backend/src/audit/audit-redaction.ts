const SECRET_KEYWORDS = ["password", "token", "secret", "authorization", "cookie", "apiKey"];
const MAX_DEPTH = 6;
const MAX_STRING = 4000;

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

function sanitizeString(value: string): string {
  if (value.length <= MAX_STRING) return value;
  return `${value.slice(0, MAX_STRING)}...<truncated>`;
}

export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth >= MAX_DEPTH) return "<max-depth>";
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redactAuditValue(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = shouldRedactKey(key) ? "<redacted>" : redactAuditValue(entry, depth + 1);
    }
    return out;
  }
  return String(value);
}
