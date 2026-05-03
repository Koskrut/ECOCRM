/** Deterministic JSON for hashing request bodies (idempotency). */
export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "undefined") return "undefined";
  if (t !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
