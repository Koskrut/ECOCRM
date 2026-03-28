/** Keys from the Excel workflow that must not appear on the public storefront. */
const INTERNAL_SPEC_KEYS = new Set(["fill_status", "review_note", "source_fragment"]);

/**
 * Strip internal bookkeeping fields and empty values for the store API.
 */
export function publicStoreCharacteristics(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (INTERNAL_SPEC_KEYS.has(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}
