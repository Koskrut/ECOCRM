function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Deep merge: missing or undefined keys in `over` keep `base`. Functions in `over` replace entirely. */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  over?: Partial<{ [K in keyof T]: unknown }>,
): T {
  if (!over) return base;
  const result: Record<string, unknown> = { ...base };
  for (const k of Object.keys(over) as (keyof T)[]) {
    const ov = over[k];
    if (ov === undefined) continue;
    const bv = base[k];
    if (typeof ov === "function") {
      result[k as string] = ov;
      continue;
    }
    if (isPlainObject(bv) && isPlainObject(ov)) {
      result[k as string] = deepMerge(
        bv as Record<string, unknown>,
        ov as Record<string, unknown>,
      );
    } else {
      result[k as string] = ov;
    }
  }
  return result as T;
}
