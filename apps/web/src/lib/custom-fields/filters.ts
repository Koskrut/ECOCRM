export type CustomFilterValues = Record<string, string | string[]>;

export function countCustomFilters(values: CustomFilterValues | undefined): number {
  if (!values) return 0;
  return Object.values(values).filter((value) => {
    if (Array.isArray(value)) return value.some((item) => item.trim().length > 0);
    return typeof value === "string" && value.trim().length > 0;
  }).length;
}

export function serializeCustomFilters(values: CustomFilterValues | undefined): string | undefined {
  const compact: CustomFilterValues = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (Array.isArray(value)) {
      const items = value.map((item) => item.trim()).filter(Boolean);
      if (items.length > 0) compact[key] = items;
    } else if (typeof value === "string" && value.trim()) {
      compact[key] = value.trim();
    }
  }
  if (Object.keys(compact).length === 0) return undefined;
  return JSON.stringify(compact);
}

export function parseCustomFilters(raw: string | null | undefined): CustomFilterValues {
  if (!raw?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: CustomFilterValues = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
      else if (Array.isArray(value)) {
        out[key] = value.filter((item): item is string => typeof item === "string");
      }
    }
    return out;
  } catch {
    return {};
  }
}
